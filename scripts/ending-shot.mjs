// scripts/ending-shot.mjs
// 结局演出真实浏览器验收：逐镜截图 + 无缝/跳过/?cine=0 断言。
//   npm run build
//   node scripts/static-server.mjs dist 4174
//   BASE_URL=http://127.0.0.1:4174 node scripts/ending-shot.mjs
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4174';
const OUT = process.env.OUT_DIR ?? 'docs/ending';
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? 'msedge' });
const report = { ok: false, shots: [], errors: [], checks: [] };
const check = (name, pass, detail) => {
  report.checks.push({ name, pass: !!pass, detail });
  if (!pass) throw new Error('验收失败：' + name + (detail ? ' — ' + detail : ''));
};

// 注入一组完整三幕跑分并强制第三幕通幕（机制同 cutscene-shot.mjs §7；真实游玩用真数据）
const forceVictory = () => {
  const s = window.__SIGILWEAVE_BATTLE__;
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
};

try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.on('pageerror', e => report.errors.push(e.message));
  const shot = async (name) => {
    await page.screenshot({ path: OUT + '/' + name + '.png' });
    report.shots.push(name);
  };
  const settle = async (key) => {
    await page.waitForFunction(k => window.__SIGILWEAVE__?.scene.isActive(k)
      && !window.__SIGILWEAVE__?.scene.isActive('CutsceneScene')
      && !window.__SIGILWEAVE__?.scene.isActive('StoryScene'), key, { timeout: 20000 });
    await page.waitForTimeout(300);
  };

  // 1) ?scene=battle 调试直达战斗（boot 过场 → 标题自动进战斗），强制第三幕通幕
  await page.goto(BASE + '/?seed=ending-shot&scene=battle', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__SIGILWEAVE__?.scene.isActive('BattleScene')
    && !window.__SIGILWEAVE__?.scene.isActive('CutsceneScene'), null, { timeout: 20000 });
  await page.waitForTimeout(500);
  await page.evaluate(forceVictory);

  // 2) 胜利卡仍是 victory 1600ms；停留时结局播放器已在底下创建并冻结（无缝硬证据）
  await page.waitForFunction(() => window.__SIGILWEAVE_CUTSCENE__?.kind === 'victory'
    && window.__SIGILWEAVE_CUTSCENE__?.phase === 'hold', null, { timeout: 20000 });
  const vic = await page.evaluate(() => ({ ...window.__SIGILWEAVE_CUTSCENE__ }));
  check('胜利卡时长仍在 900–1600ms', vic.duration >= 900 && vic.duration <= 1600, String(vic.duration));
  await page.waitForFunction(() => window.__SIGILWEAVE_CUTSCENE__?.targetReady === true
    && window.__SIGILWEAVE__?.scene.getScene('StoryScene')?.sys.settings.status === 6, null, { timeout: 10000 });
  const under = await page.evaluate(() => ({
    storyStatus: window.__SIGILWEAVE__?.scene.getScene('StoryScene')?.sys.settings.status,
    cutActive: window.__SIGILWEAVE__?.scene.isActive('CutsceneScene'),
  }));
  check('胜利卡停留时结局播放器已在底下创建并冻结', under.cutActive && under.storyStatus === 6, JSON.stringify(under));
  await shot('01-victory-card');

  // 3) 结局四镜逐镜截图
  await page.waitForFunction(() => window.__SIGILWEAVE_ENDING__?.phase === 'playing', null, { timeout: 20000 });
  const total = await page.evaluate(() => window.__SIGILWEAVE_ENDING__.totalMs);
  check('结局总时长 32000ms', total === 32000, String(total));
  for (const [i, id] of ['release', 'quiet', 'dawn', 'credits'].entries()) {
    await page.waitForFunction(k => window.__SIGILWEAVE_ENDING__?.shot === k, id, { timeout: 20000 });
    await page.waitForTimeout(id === 'credits' ? 4500 : 2500);
    await shot('0' + (i + 2) + '-ending-' + id);
  }

  // 4) 结局→结算无缝：boot 交接停留时 GameOverScene 已在底下创建并冻结
  await page.waitForFunction(() => window.__SIGILWEAVE_CUTSCENE__?.kind === 'boot'
    && window.__SIGILWEAVE_CUTSCENE__?.targetReady === true
    && window.__SIGILWEAVE__?.scene.getScene('GameOverScene')?.sys.settings.status === 6, null, { timeout: 20000 });
  const handoff = await page.evaluate(() => ({
    panelStatus: window.__SIGILWEAVE__?.scene.getScene('GameOverScene')?.sys.settings.status,
    cutActive: window.__SIGILWEAVE__?.scene.isActive('CutsceneScene'),
  }));
  check('boot 交接停留时结算面板已在底下创建并冻结', handoff.cutActive && handoff.panelStatus === 6, JSON.stringify(handoff));
  await shot('06-boot-handoff');
  await settle('GameOverScene');
  const panel = await page.evaluate(() => ({
    status: window.__SIGILWEAVE__?.scene.getScene('GameOverScene')?.sys.settings.status,
    victory: window.__SIGILWEAVE__?.scene.getScene('GameOverScene')?.data?.victory,
    kills: window.__SIGILWEAVE__?.scene.getScene('GameOverScene')?.data?.kills,
  }));
  check('揭开后结算正常运行且为胜利面板、跑分透传', panel.status === 5 && panel.victory === true && panel.kills === 1142, JSON.stringify(panel));
  await shot('07-victory-panel');

  // 5) 跳过：重开后宽限期后一键跳过整段结局，仍落到胜利结算
  await page.goto(BASE + '/?seed=ending-skip&scene=battle', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__SIGILWEAVE__?.scene.isActive('BattleScene')
    && !window.__SIGILWEAVE__?.scene.isActive('CutsceneScene'), null, { timeout: 20000 });
  await page.evaluate(forceVictory);
  await page.waitForFunction(() => (window.__SIGILWEAVE_ENDING__?.elapsed ?? 0) > 250
    && window.__SIGILWEAVE_ENDING__?.phase === 'playing', null, { timeout: 20000 });
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__SIGILWEAVE_ENDING__?.skipped === true, null, { timeout: 5000 });
  await settle('GameOverScene');
  const afterSkip = await page.evaluate(() => window.__SIGILWEAVE__?.scene.getScene('GameOverScene')?.sys.settings.status);
  check('结局跳过后结算正常运行（不软锁）', afterSkip === 5, String(afterSkip));

  // 6) ?cine=0：不播结局不播过场，直达胜利结算
  const nocine = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  nocine.on('pageerror', e => report.errors.push('cine0: ' + e.message));
  await nocine.goto(BASE + '/?cine=0&scene=battle', { waitUntil: 'load' });
  await nocine.waitForFunction(() => window.__SIGILWEAVE__?.scene.isActive('BattleScene'), null, { timeout: 20000 });
  await nocine.evaluate(forceVictory);
  await nocine.waitForFunction(() => window.__SIGILWEAVE__?.scene.isActive('GameOverScene'), null, { timeout: 10000 });
  const nocineState = await nocine.evaluate(() => ({
    ending: window.__SIGILWEAVE_ENDING__ ?? null,
    victory: window.__SIGILWEAVE__?.scene.getScene('GameOverScene')?.data?.victory,
  }));
  check('?cine=0 不播结局直达胜利结算', nocineState.ending === null && nocineState.victory === true, JSON.stringify(nocineState));
  await nocine.close();

  // 7) 竖屏：结局 dawn 镜 + 跳过落结算
  const portrait = await browser.newPage({ viewport: { width: 390, height: 844 } });
  portrait.on('pageerror', e => report.errors.push('portrait: ' + e.message));
  await portrait.goto(BASE + '/?seed=ending-portrait&scene=battle', { waitUntil: 'load' });
  await portrait.waitForFunction(() => window.__SIGILWEAVE__?.scene.isActive('BattleScene')
    && !window.__SIGILWEAVE__?.scene.isActive('CutsceneScene'), null, { timeout: 20000 });
  await portrait.evaluate(forceVictory);
  await portrait.waitForFunction(() => window.__SIGILWEAVE_ENDING__?.shot === 'dawn', null, { timeout: 20000 });
  await portrait.waitForTimeout(2000);
  await portrait.screenshot({ path: OUT + '/08-portrait-ending-dawn.png' });
  report.shots.push('08-portrait-ending-dawn');
  await portrait.keyboard.press('Enter');
  await portrait.waitForFunction(() => window.__SIGILWEAVE__?.scene.isActive('GameOverScene')
    && !window.__SIGILWEAVE__?.scene.isActive('CutsceneScene')
    && !window.__SIGILWEAVE__?.scene.isActive('StoryScene'), null, { timeout: 20000 });
  await portrait.screenshot({ path: OUT + '/09-portrait-victory-panel.png' });
  report.shots.push('09-portrait-victory-panel');
  await portrait.close();

  report.ok = report.errors.length === 0;
  check('0 个 pageerror', report.errors.length === 0, report.errors.join(' | '));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await writeFile(OUT + '/verify.json', JSON.stringify(report, null, 2));
  await browser.close();
}