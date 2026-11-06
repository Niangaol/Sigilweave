// 过场动画真实浏览器验收：逐段截图 + 时长/跳过断言。
// 运行前先起静态服务器（生产构建已含过场）：
//   npm run build
//   node scripts/static-server.mjs dist 4174
//   BASE_URL=http://127.0.0.1:4174 node scripts/cutscene-shot.mjs
// 需要本机允许启动浏览器；若 Playwright 起不来，可用有启动权限的机器复跑。
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4174';
const OUT = process.env.OUT_DIR ?? 'docs/cutscene';
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? 'msedge' });
const report = { ok: false, shots: [], timings: [], errors: [], checks: [] };
const check = (name, pass, detail) => {
  report.checks.push({ name, pass: !!pass, detail });
  if (!pass) throw new Error('验收失败：' + name + (detail ? ' — ' + detail : ''));
};

try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.on('pageerror', e => report.errors.push(e.message));

  const shot = async (name) => {
    const path = OUT + '/' + name + '.png';
    await page.screenshot({ path });
    report.shots.push(name);
    return path;
  };
  const active = async (key) => page.waitForFunction(k => window.__SIGILWEAVE__?.scene.isActive(k), key, { timeout: 20000 });
  // 目标场景就绪 ≠ 过场结束：必须等覆盖层真正停下，截图才是目标场景本身
  const settle = async (key) => {
    await page.waitForFunction(k => window.__SIGILWEAVE__?.scene.isActive(k)
      && !window.__SIGILWEAVE__?.scene.isActive('CutsceneScene'), key, { timeout: 20000 });
    await page.waitForTimeout(300);
  };
  const cut = async (kind, phase = 'hold') => {
    await page.waitForFunction(([k, p]) => window.__SIGILWEAVE_CUTSCENE__?.kind === k
      && window.__SIGILWEAVE_CUTSCENE__?.phase === p, [kind, phase], { timeout: 20000 });
    const state = await page.evaluate(() => ({ ...window.__SIGILWEAVE_CUTSCENE__ }));
    report.timings.push({ kind, phase, duration: state.duration, act: state.act, elapsed: state.elapsed });
    check(kind + ' 时长 900–1600ms', state.duration >= 900 && state.duration <= 1600, String(state.duration));
    return state;
  };

  // 1) 开场：Boot → 标题（自动过场）
  await page.goto(BASE + '/?seed=cutscene-shot', { waitUntil: 'load' });
  await cut('boot', 'hold');
  await shot('01-boot');
  await settle('TitleScene');
  await page.waitForTimeout(300);
  await shot('02-title');

  // 2) 标题 → 选套
  await page.keyboard.press('Enter');
  await cut('sigil', 'hold');
  await shot('03-title-to-loadout');
  await settle('LoadoutScene');
  await shot('04-loadout');

  // 3) 选套 → 第一幕标题卡
  await page.keyboard.press('Enter');
  const act1 = await cut('act', 'hold');
  check('第一幕卡片属于第 1 幕', act1.act === 1, String(act1.act));
  // 目标场景 create 完成需要一两帧；等 targetReady 再验证「底下已经就绪」
  await page.waitForFunction(() => window.__SIGILWEAVE_CUTSCENE__?.targetReady === true, null, { timeout: 5000 });
  // 无缝的硬证据：标题卡还在停留时，目标战斗场景已经 create 完成并躺在覆盖层底下
  const under = await page.evaluate(() => ({
    battleCreated: !!window.__SIGILWEAVE_BATTLE__,
    battleStatus: window.__SIGILWEAVE__?.scene.getScene('BattleScene')?.sys.settings.status,
    cutActive: window.__SIGILWEAVE__?.scene.isActive('CutsceneScene'),
  }));
  check('标题卡停留时目标场景已在底下创建', under.battleCreated && under.cutActive, JSON.stringify(under));
  await shot('05-act1-card');
  await page.waitForFunction(() => window.__SIGILWEAVE_CUTSCENE__?.phase === 'reveal', null, { timeout: 10000 });
  await page.waitForTimeout(120);
  await shot('05b-act1-reveal');
  await settle('BattleScene');
  await page.waitForTimeout(300);
  await shot('06-act1-battle');

  // 4) 通关一幕 → 契约解除卡 → 幕间。先让战斗跑 6 秒，统计卡里才有非零数据
  await page.waitForTimeout(6000);
  await page.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    s.phase = 'bossDefeated';
    s.bossDefeated = true;
    s.transitionLeft = 0;
    s.completeAct();
  });
  const clear = await cut('clear', 'hold');
  check('解除卡属于刚完成的一幕', clear.act === 1, String(clear.act));
  await shot('07-clear-card');
  await settle('IntermissionScene');
  await shot('08-intermission');

  // 5) 幕间 → 第二幕标题卡。先按正常出发；若默认构筑不满足出发条件，退回直接拉过场做视觉证据。
  await page.evaluate(() => {
    const w = window.__SIGILWEAVE_WORKSHOP__;
    w.workshop.roundsRemaining = 0;
    w.workshop.offer = null;
    w.depart();
    if (!w.departed) {
      window.__SIGILWEAVE__.scene.launch('CutsceneScene', {
        from: 'IntermissionScene', to: 'BattleScene',
        payload: { run: w.run, __cine: true }, kind: 'act', act: 2,
      });
    }
  });
  const act2 = await cut('act', 'hold');
  check('第二幕卡片属于第 2 幕', act2.act === 2, String(act2.act));
  await shot('09-act2-card');
  await settle('BattleScene');

  // 6) 死亡 → 熄灭卡 → 结算
  await page.evaluate(() => window.__SIGILWEAVE_BATTLE__.die());
  await cut('death', 'hold');
  await shot('10-death-card');
  await settle('GameOverScene');
  await shot('11-gameover');

  // 7) 再战（短转场）→ 强制终局胜利演出
  await page.keyboard.press('Enter');
  await cut('retry', 'hold');
  await settle('BattleScene');
  await page.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    // 注入一组完整三幕跑分，只为了让胜利卡的统计不是 00:00/0（真实游玩用真数据）
    s.run.reports = [
      { act: 1, elapsedMs: 143000, kills: 312, triggers: 980, combos: 26, blocked: 4, peakRate: 0.8 },
      { act: 2, elapsedMs: 201000, kills: 450, triggers: 1300, combos: 31, blocked: 6, peakRate: 0.9 },
      { act: 3, elapsedMs: 166000, kills: 380, triggers: 1100, combos: 29, blocked: 5, peakRate: 0.85 },
    ];
    s.run.bossResolutions = {
      'boss-1': { method: 'quiz' }, 'boss-2': { method: 'combat' }, 'boss-3': { method: 'quiz' },
    };
    s.kills = 312;
    s.shardCount = 19;
    s.engine.now = 143000;
    s.act = 3;
    s.phase = 'bossDefeated';
    s.bossDefeated = true;
    s.completeAct();
  });
  await cut('victory', 'hold');
  await shot('12-victory-card');
  await settle('GameOverScene');
  await shot('13-victory-panel');

  // 8) 返回标题 + 跳过行为：转场 150ms 后按空格，应直接进目标场景
  await page.keyboard.press('Escape');
  await cut('return', 'hold');
  await settle('TitleScene');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__SIGILWEAVE_CUTSCENE__?.kind === 'sigil', null, { timeout: 10000 });
  await page.waitForTimeout(220);
  await page.keyboard.press('Space');
  await page.waitForFunction(() => window.__SIGILWEAVE_CUTSCENE__?.skipped === true, null, { timeout: 5000 });
  await settle('LoadoutScene');
  report.checks.push({ name: '跳过后仍落到目标场景', pass: true });

  // 9) 竖屏：标题卡落在 480×760 画布内
  const portrait = await browser.newPage({ viewport: { width: 390, height: 844 } });
  portrait.on('pageerror', e => report.errors.push('portrait: ' + e.message));
  await portrait.goto(BASE + '/?seed=cutscene-portrait', { waitUntil: 'load' });
  await portrait.waitForFunction(() => window.__SIGILWEAVE__?.scene.isActive('TitleScene')
    && !window.__SIGILWEAVE__?.scene.isActive('CutsceneScene'), null, { timeout: 20000 });
  await portrait.waitForTimeout(300);
  await portrait.keyboard.press('Enter');
  await portrait.waitForFunction(() => window.__SIGILWEAVE_CUTSCENE__?.kind === 'sigil', null, { timeout: 10000 });
  await portrait.waitForFunction(() => window.__SIGILWEAVE__?.scene.isActive('LoadoutScene')
    && !window.__SIGILWEAVE__?.scene.isActive('CutsceneScene'), null, { timeout: 20000 });
  await portrait.waitForTimeout(300);
  await portrait.keyboard.press('Enter');
  await portrait.waitForFunction(() => window.__SIGILWEAVE_CUTSCENE__?.kind === 'act'
    && window.__SIGILWEAVE_CUTSCENE__?.phase === 'hold', null, { timeout: 20000 });
  await portrait.screenshot({ path: OUT + '/14-portrait-act1.png' });
  report.shots.push('14-portrait-act1');
  const metrics = await portrait.evaluate(() => ({ w: innerWidth, h: innerHeight, cut: window.__SIGILWEAVE_CUTSCENE__ }));
  check('竖屏画布为高窗', metrics.h > metrics.w, JSON.stringify(metrics));
  await portrait.close();

  // 10) 第三幕标题卡画廊页：主流程为了截死亡/胜利没有真正走到三幕，这里单独渲染同一套 act3 卡片
  const gallery = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  gallery.on('pageerror', e => report.errors.push('gallery: ' + e.message));
  await gallery.goto(BASE + '/?seed=cutscene-act3', { waitUntil: 'load' });
  await gallery.waitForFunction(() => window.__SIGILWEAVE__?.scene.isActive('TitleScene')
    && !window.__SIGILWEAVE__?.scene.isActive('CutsceneScene'), null, { timeout: 20000 });
  await gallery.evaluate(() => {
    const title = window.__SIGILWEAVE__.scene.getScene('TitleScene');
    title.scene.launch('CutsceneScene', {
      from: 'TitleScene', to: 'LoadoutScene',
      payload: { __cine: true }, kind: 'act', act: 3,
    });
  });
  await gallery.waitForFunction(() => window.__SIGILWEAVE_CUTSCENE__?.kind === 'act'
    && window.__SIGILWEAVE_CUTSCENE__?.phase === 'hold', null, { timeout: 20000 });
  const act3 = await gallery.evaluate(() => ({ ...window.__SIGILWEAVE_CUTSCENE__ }));
  check('第三幕卡片属于第 3 幕', act3.act === 3, String(act3.act));
  await gallery.screenshot({ path: OUT + '/15-act3-card.png' });
  report.shots.push('15-act3-card');
  await gallery.waitForFunction(() => window.__SIGILWEAVE__?.scene.isActive('LoadoutScene')
    && !window.__SIGILWEAVE__?.scene.isActive('CutsceneScene'), null, { timeout: 20000 });
  await gallery.close();

  report.ok = report.errors.length === 0;
  console.log(JSON.stringify(report, null, 2));
} finally {
  await writeFile(OUT + '/verify.json', JSON.stringify(report, null, 2));
  await browser.close();
}
