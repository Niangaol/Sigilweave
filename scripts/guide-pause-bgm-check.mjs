// 真机回归：① 墨宝开场讲解期间战斗冻结（怪兽不刷、时间不推进、背景仍渲染）；
//          ② 讲解读完解冻、怪兽入场、热血 BGM 真正合成音符；③ M 静音联动。
// BGM 探测用 WebAudio 振荡器计数（每个音符一次 createOscillator），
// 不依赖源码模块路径，因此本地 dev 与构建后的 Pages 都能验证。
// 用法：BASE_URL=http://127.0.0.1:5173 node scripts/guide-pause-bgm-check.mjs
//       BASE_URL=https://wangbichun.github.io/Sigilweave node scripts/guide-pause-bgm-check.mjs
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const base = process.env.BASE_URL || 'http://127.0.0.1:5173';
const url = base + '/?scene=battle&seed=guidepausecheck&cine=0';
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
const checks = [];

try {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  // 页面脚本运行前挂钩 AudioContext，统计所有振荡器创建（= 合成音符数）
  await page.addInitScript(() => {
    window.__OSC_COUNT__ = 0;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) {
      const orig = AC.prototype.createOscillator;
      AC.prototype.createOscillator = function (...a) { window.__OSC_COUNT__++; return orig.apply(this, a); };
    }
  });
  await page.goto(url, { waitUntil: 'domcontentloaded' });

  // 等开场讲解弹出：guideGate=true 且 GuideScene active
  await page.waitForFunction(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    const gs = s?.scene?.get?.('GuideScene');
    return s && s.guideGate === true && s.phase === 'play' && gs?.active;
  }, null, { timeout: 15000 });
  await page.waitForTimeout(700);

  // 1. 闸门立起：讲解冻结战斗，敌人不刷、时间不推进、主角/背景仍在、BGM 不排音符
  const gated = await page.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    return {
      guideGate: s.guideGate,
      paused: s.paused,
      enginePaused: s.engine.paused,
      enemies: s.enemies.length,
      now: s.engine.now,
      playerExists: !!s.player,
      backgroundExists: !!s.background,
      osc: window.__OSC_COUNT__,
    };
  });
  assert.equal(gated.guideGate, true, '开场讲解应立起闸门');
  assert.equal(gated.paused, true, '讲解期间战斗应暂停');
  assert.equal(gated.enginePaused, true, '引擎应暂停');
  assert.equal(gated.enemies, 0, '讲解期间不应刷出怪兽');
  assert.equal(gated.now, 0, '讲解期间引擎时间应停在 0');
  assert.ok(gated.playerExists && gated.backgroundExists, '主角与背景对象应存在（画面仍是游戏地图）');
  assert.equal(gated.osc, 0, '讲解期间 BGM 不应合成音符');
  checks.push('讲解期间：闸门立起·战斗/引擎暂停·0怪兽·引擎时间静止·主角与背景仍渲染·BGM静默');

  // 2. 讲解中引擎时间确实静止（再等一段确认不推进）
  await page.waitForTimeout(500);
  const still = await page.evaluate(() => window.__SIGILWEAVE_BATTLE__.engine.now);
  assert.equal(still, 0, '讲解等待期间引擎时间仍应为 0');
  checks.push('讲解期间：等待 500ms 后引擎时间仍为 0（真正冻结）');

  // 3. 把开场讲解全部点完（next 读完后 GuideScene 广播 guide:done）
  const lines = await page.evaluate(() => window.__SIGILWEAVE_BATTLE__.scene.get('GuideScene').lines.length);
  await page.evaluate(() => {
    const gs = window.__SIGILWEAVE_BATTLE__.scene.get('GuideScene');
    let guard = 0;
    while (gs.active && guard++ < 60) gs.next();
  });
  checks.push(`讲完开场讲解：点完 ${lines} 句台词（自然广播 guide:done）`);

  // 4. 解冻后：闸门放下、怪兽入场、时间推进、BGM 真正合成音符
  await page.waitForFunction(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    return s && s.guideGate === false && s.paused === false;
  }, null, { timeout: 5000 });
  await page.waitForTimeout(1600);
  const after = await page.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    return {
      guideGate: s.guideGate,
      paused: s.paused,
      enemies: s.enemies.length,
      now: s.engine.now,
      osc: window.__OSC_COUNT__,
    };
  });
  assert.equal(after.guideGate, false, '讲完后闸门应放下');
  assert.equal(after.paused, false, '讲完后战斗应恢复');
  assert.ok(after.now > still, `讲完后引擎时间应推进（${still} -> ${after.now}）`);
  assert.ok(after.enemies > 0, '讲完后怪兽应开始刷出');
  assert.ok(after.osc - gated.osc >= 20, `开打后 BGM 应合成大量音符（增量 ${after.osc - gated.osc}）`);
  checks.push(`讲完解冻：闸门放下·怪兽入场·时间推进·热血BGM合成音符(+${after.osc - gated.osc})`);

  // 5. 静音（M）后 BGM 停止排新音符：toggleSound 后观察振荡器计数是否停滞
  await page.keyboard.press('m');
  await page.waitForTimeout(200);
  const muteBase = await page.evaluate(() => window.__OSC_COUNT__);
  await page.waitForTimeout(600);
  const muteAfter = await page.evaluate(() => window.__OSC_COUNT__);
  assert.equal(muteAfter, muteBase, `M 静音后 BGM 应停止合成新音符（${muteBase} -> ${muteAfter}）`);
  await page.keyboard.press('m'); // 恢复
  checks.push('M 静音联动：静音后 BGM 停止合成新音符');

  assert.equal(errors.length, 0, '不应有页面异常：' + errors.join('; '));
  checks.push('0 个 pageerror');

  console.log('引导暂停 + BGM 真机验证通过：' + checks.length + '/' + checks.length);
  checks.forEach((c, i) => console.log('  ' + (i + 1) + '. ' + c));
} finally {
  await browser.close();
}
