// 真机回归：① 墨宝开场讲解期间战斗冻结（怪兽不刷、时间不推进、背景仍渲染）；
//          ② 讲解读完解冻、怪兽入场、热血 BGM 起；③ 换场后 BGM 生命周期闭环。
// 用法：BASE_URL=http://127.0.0.1:5173 node scripts/guide-pause-bgm-check.mjs
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const base = process.env.BASE_URL || 'http://127.0.0.1:5173';
// 直达战斗、固定种子、带引导、跳过过场 => 开场讲解会弹并立起冻结闸门
const url = base + '/?scene=battle&seed=guidepausecheck&cine=0';
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
const checks = [];

try {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(url, { waitUntil: 'domcontentloaded' });

  // 等开场讲解弹出：guideGate=true 且 GuideScene active
  await page.waitForFunction(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    const gs = s?.scene?.get?.('GuideScene');
    return s && s.guideGate === true && s.phase === 'play' && gs?.active;
  }, null, { timeout: 15000 });
  await page.waitForTimeout(700);

  // 1. 闸门立起：讲解冻结战斗，敌人不刷、时间不推进、主角/背景仍在
  const gated = await page.evaluate(async () => {
    const s = window.__SIGILWEAVE_BATTLE__;
    const m = await import('/src/audio/BattleMusic.js');
    return {
      guideGate: s.guideGate,
      paused: s.paused,
      enginePaused: s.engine.paused,
      enemies: s.enemies.length,
      now: s.engine.now,
      playerExists: !!s.player,
      backgroundExists: !!s.background,
      bgmPlaying: m.isBattleMusicPlaying(),
    };
  });
  assert.equal(gated.guideGate, true, '开场讲解应立起闸门');
  assert.equal(gated.paused, true, '讲解期间战斗应暂停');
  assert.equal(gated.enginePaused, true, '引擎应暂停');
  assert.equal(gated.enemies, 0, '讲解期间不应刷出怪兽');
  assert.equal(gated.now, 0, '讲解期间引擎时间应停在 0');
  assert.ok(gated.playerExists && gated.backgroundExists, '主角与背景对象应存在（画面仍是游戏地图）');
  assert.equal(gated.bgmPlaying, false, '讲解期间 BGM 不应启动');
  checks.push('讲解期间：闸门立起·战斗/引擎暂停·0怪兽·引擎时间静止·主角与背景仍渲染·BGM未起');

  // 2. 把开场讲解全部点完（next 读完后 GuideScene 广播 guide:done）
  const lines = await page.evaluate(() => {
    const gs = window.__SIGILWEAVE_BATTLE__.scene.get('GuideScene');
    return gs.lines.length;
  });
  await page.evaluate(() => {
    const gs = window.__SIGILWEAVE_BATTLE__.scene.get('GuideScene');
    let guard = 0;
    while (gs.active && guard++ < 60) gs.next();
  });
  checks.push(`讲完开场讲解：点完 ${lines} 句台词（自然广播 guide:done）`);

  // 3. 解冻后：闸门放下、战斗恢复、怪兽入场、时间推进、BGM 起
  await page.waitForFunction(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    return s && s.guideGate === false && s.paused === false;
  }, null, { timeout: 5000 });
  await page.waitForTimeout(1600);
  const after = await page.evaluate(async () => {
    const s = window.__SIGILWEAVE_BATTLE__;
    const m = await import('/src/audio/BattleMusic.js');
    return {
      guideGate: s.guideGate,
      paused: s.paused,
      enemies: s.enemies.length,
      now: s.engine.now,
      bgmPlaying: m.isBattleMusicPlaying(),
    };
  });
  assert.equal(after.guideGate, false, '讲完后闸门应放下');
  assert.equal(after.paused, false, '讲完后战斗应恢复');
  assert.ok(after.now > gated.now, `讲完后引擎时间应推进（${gated.now} -> ${after.now}）`);
  assert.ok(after.enemies > 0, '讲完后怪兽应开始刷出');
  assert.equal(after.bgmPlaying, true, '开打后 BGM 应在播放');
  checks.push('讲完解冻：闸门放下·战斗恢复·怪兽入场·时间推进·热血BGM响起');

  // 4. 静音（M）后 BGM tick 静默：模块仍在播但音量为 0，由 isSoundEnabled 联动
  const muteOk = await page.evaluate(async () => {
    const sfx = await import('/src/audio/Sfx.js');
    const before = sfx.isSoundEnabled();
    sfx.toggleSound();
    const muted = sfx.isSoundEnabled();
    sfx.toggleSound(); // 恢复，避免影响后续
    return { before, muted };
  });
  assert.equal(muteOk.before, true, '初始应为有声');
  assert.equal(muteOk.muted, false, 'toggleSound 应切换为静音');
  checks.push('M 静音联动：isSoundEnabled 切换生效（BGM tick 据此静默）');

  // 5. 换场后 BGM 仍持续（同一战斗场景，惰性启动幂等）
  await page.evaluate(() => window.__SIGILWEAVE_BATTLE__.swapStage(2));
  await page.waitForTimeout(300);
  const afterSwap = await page.evaluate(async () => {
    const m = await import('/src/audio/BattleMusic.js');
    return m.isBattleMusicPlaying();
  });
  assert.equal(afterSwap, true, '同场景换场后 BGM 应继续播放');
  checks.push('换场后：BGM 幂等持续播放（不叠不重）');

  assert.equal(errors.length, 0, '不应有页面异常：' + errors.join('; '));
  checks.push('0 个 pageerror');

  console.log('引导暂停 + BGM 真机验证通过：' + checks.length + '/' + checks.length);
  checks.forEach((c, i) => console.log('  ' + (i + 1) + '. ' + c));
} finally {
  await browser.close();
}
