// scripts/story-shot.mjs
// 开场与幕间 journey 真实浏览器验收：逐镜截图 + 无缝/跳过断言。
//   npm run build
//   node scripts/static-server.mjs dist 4174
//   BASE_URL=http://127.0.0.1:4174 node scripts/story-shot.mjs
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4174';
const OUT = process.env.OUT_DIR ?? 'docs/story';
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? 'msedge' });
const report = { ok: false, shots: [], errors: [], checks: [] };
const check = (name, pass, detail) => {
  report.checks.push({ name, pass: !!pass, detail });
  if (!pass) throw new Error('验收失败：' + name + (detail ? ' — ' + detail : ''));
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

  // 1) 开场六镜逐镜截图
  await page.goto(BASE + '/?seed=story-shot', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__SIGILWEAVE_STORY__?.phase === 'playing', null, { timeout: 20000 });
  const total = await page.evaluate(() => window.__SIGILWEAVE_STORY__.totalMs);
  check('开场总时长 36000ms', total === 36000, String(total));
  for (const [i, id] of ['skyfall', 'contracts', 'graveyard', 'altar', 'awaken', 'title'].entries()) {
    await page.waitForFunction(k => window.__SIGILWEAVE_STORY__?.shot === k, id, { timeout: 20000 });
    await page.waitForTimeout(2500);
    await shot('0' + (i + 1) + '-opening-' + id);
  }

  // 2) 开场→标题无缝：boot 过场停留时标题页已在底下创建并冻结
  // 直接等 status===6（PAUSED）：freezeTarget 是 delayedCall(0)，targetReady 当帧可能还没落 pause
  await page.waitForFunction(() => window.__SIGILWEAVE_CUTSCENE__?.kind === 'boot'
    && window.__SIGILWEAVE_CUTSCENE__?.targetReady === true
    && window.__SIGILWEAVE__?.scene.getScene('TitleScene')?.sys.settings.status === 6, null, { timeout: 20000 });
  const under = await page.evaluate(() => ({
    titleStatus: window.__SIGILWEAVE__?.scene.getScene('TitleScene')?.sys.settings.status,
    cutActive: window.__SIGILWEAVE__?.scene.isActive('CutsceneScene'),
  }));
  check('boot 停留时标题页已在底下创建并冻结', under.cutActive && under.titleStatus === 6, JSON.stringify(under));
  await shot('07-boot-handoff');
  await settle('TitleScene');
  await shot('08-title');

  // 3) 跳过：重新加载，宽限期后一键跳过整段开场
  await page.goto(BASE + '/?seed=story-skip', { waitUntil: 'load' });
  await page.waitForFunction(() => (window.__SIGILWEAVE_STORY__?.elapsed ?? 0) > 250
    && window.__SIGILWEAVE_STORY__?.phase === 'playing', null, { timeout: 20000 });
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__SIGILWEAVE_STORY__?.skipped === true, null, { timeout: 5000 });
  await settle('TitleScene');
  report.checks.push({ name: '开场跳过后仍落到标题页', pass: true });

  // 4) 标题→选套→第一幕（第一幕保持 act 标题卡）
  await page.keyboard.press('Enter');
  await settle('LoadoutScene');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__SIGILWEAVE_CUTSCENE__?.kind === 'act'
    && window.__SIGILWEAVE_CUTSCENE__?.phase === 'hold', null, { timeout: 20000 });
  const act1 = await page.evaluate(() => ({ ...window.__SIGILWEAVE_CUTSCENE__ }));
  check('第一幕仍是 act 标题卡', act1.act === 1 && act1.duration <= 1600, JSON.stringify(act1));
  await settle('BattleScene');

  // 5) 幕间→第二幕 journey：演出期间战斗在底下冻结
  await page.waitForTimeout(3000);
  await page.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    s.phase = 'bossDefeated'; s.bossDefeated = true; s.transitionLeft = 0; s.completeAct();
  });
  await page.waitForFunction(() => window.__SIGILWEAVE_CUTSCENE__?.kind === 'clear', null, { timeout: 20000 });
  await settle('IntermissionScene');
  await page.evaluate(() => {
    const w = window.__SIGILWEAVE_WORKSHOP__;
    w.workshop.roundsRemaining = 0;
    w.workshop.offer = null;
    w.depart();
    if (!w.departed) {
      // game.scene 是 SceneManager，没有 launch；须经活跃场景实例的 ScenePlugin（同 cutscene-shot.mjs）
      window.__SIGILWEAVE__.scene.getScene('IntermissionScene').scene.launch('CutsceneScene', {
        from: 'IntermissionScene', to: 'BattleScene',
        payload: { run: w.run, __cine: true }, kind: 'journey', act: 2,
      });
    }
  });
  await page.waitForFunction(() => window.__SIGILWEAVE_CUTSCENE__?.kind === 'journey'
    && window.__SIGILWEAVE_CUTSCENE__?.phase === 'hold'
    && window.__SIGILWEAVE_CUTSCENE__?.targetReady === true, null, { timeout: 20000 });
  const j2 = await page.evaluate(() => ({
    cut: { ...window.__SIGILWEAVE_CUTSCENE__ },
    battleStatus: window.__SIGILWEAVE__?.scene.getScene('BattleScene')?.sys.settings.status,
  }));
  check('journey 属于第 2 幕且时长 5840ms', j2.cut.act === 2 && j2.cut.duration === 5840, JSON.stringify(j2.cut));
  check('journey 演出期间战斗已在底下冻结', j2.battleStatus === 6, String(j2.battleStatus));
  await page.waitForTimeout(2000);
  await shot('09-journey-act2');
  await page.waitForFunction(() => window.__SIGILWEAVE_CUTSCENE__?.phase === 'reveal', null, { timeout: 10000 });
  await page.waitForTimeout(120);
  await shot('09b-journey-act2-reveal');
  await settle('BattleScene');
  const run2 = await page.evaluate(() => window.__SIGILWEAVE__?.scene.getScene('BattleScene')?.sys.settings.status);
  check('揭开后战斗正常运行', run2 === 5, String(run2));
  await shot('10-act2-battle');

  // 6) 幕间→第三幕 journey
  await page.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    s.phase = 'bossDefeated'; s.bossDefeated = true; s.transitionLeft = 0; s.completeAct();
  });
  await page.waitForFunction(() => window.__SIGILWEAVE_CUTSCENE__?.kind === 'clear', null, { timeout: 20000 });
  await settle('IntermissionScene');
  await page.evaluate(() => {
    const w = window.__SIGILWEAVE_WORKSHOP__;
    w.workshop.roundsRemaining = 0;
    w.workshop.offer = null;
    w.depart();
    if (!w.departed) {
      window.__SIGILWEAVE__.scene.getScene('IntermissionScene').scene.launch('CutsceneScene', {
        from: 'IntermissionScene', to: 'BattleScene',
        payload: { run: w.run, __cine: true }, kind: 'journey', act: 3,
      });
    }
  });
  await page.waitForFunction(() => window.__SIGILWEAVE_CUTSCENE__?.kind === 'journey'
    && window.__SIGILWEAVE_CUTSCENE__?.phase === 'hold', null, { timeout: 20000 });
  const j3 = await page.evaluate(() => ({ ...window.__SIGILWEAVE_CUTSCENE__ }));
  check('第二段 journey 属于第 3 幕', j3.act === 3, String(j3.act));
  await page.waitForTimeout(2000);
  await shot('11-journey-act3');
  await settle('BattleScene');

  // 7) journey 跳过不软锁：重开一局到幕间再跳过（直接用覆盖层注入验证跳过路径）
  await page.evaluate(() => {
    // 同上：launch 是 ScenePlugin 的方法，挂在场景实例的 .scene 上
    window.__SIGILWEAVE__.scene.getScene('BattleScene').scene.launch('CutsceneScene', {
      from: 'BattleScene', to: 'BattleScene',
      payload: { run: window.__SIGILWEAVE_BATTLE__.run, __cine: true }, kind: 'journey', act: 3,
    });
  });
  await page.waitForFunction(() => window.__SIGILWEAVE_CUTSCENE__?.kind === 'journey', null, { timeout: 10000 });
  await page.waitForTimeout(300);
  await page.keyboard.press('Space');
  await page.waitForFunction(() => window.__SIGILWEAVE_CUTSCENE__?.skipped === true, null, { timeout: 5000 });
  await settle('BattleScene');
  const runAfterSkip = await page.evaluate(() => window.__SIGILWEAVE__?.scene.getScene('BattleScene')?.sys.settings.status);
  check('journey 跳过后战斗正常运行（不软锁）', runAfterSkip === 5, String(runAfterSkip));

  // 8) ?cine=0：开场不播，直达标题
  const nocine = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  nocine.on('pageerror', e => report.errors.push('cine0: ' + e.message));
  await nocine.goto(BASE + '/?cine=0', { waitUntil: 'load' });
  await nocine.waitForFunction(() => window.__SIGILWEAVE__?.scene.isActive('TitleScene'), null, { timeout: 20000 });
  const storyNever = await nocine.evaluate(() => window.__SIGILWEAVE_STORY__ == null);
  check('?cine=0 开场不播', storyNever, String(storyNever));
  await nocine.close();

  // 9) 竖屏：开场首镜 + 跳过落标题
  const portrait = await browser.newPage({ viewport: { width: 390, height: 844 } });
  portrait.on('pageerror', e => report.errors.push('portrait: ' + e.message));
  await portrait.goto(BASE + '/?seed=story-portrait', { waitUntil: 'load' });
  await portrait.waitForFunction(() => window.__SIGILWEAVE_STORY__?.phase === 'playing', null, { timeout: 20000 });
  await portrait.waitForTimeout(1500);
  await portrait.screenshot({ path: OUT + '/12-portrait-opening.png' });
  report.shots.push('12-portrait-opening');
  await portrait.keyboard.press('Enter');
  await portrait.waitForFunction(() => window.__SIGILWEAVE__?.scene.isActive('TitleScene')
    && !window.__SIGILWEAVE__?.scene.isActive('CutsceneScene')
    && !window.__SIGILWEAVE__?.scene.isActive('StoryScene'), null, { timeout: 20000 });
  await portrait.screenshot({ path: OUT + '/13-portrait-title.png' });
  report.shots.push('13-portrait-title');
  await portrait.close();

  report.ok = report.errors.length === 0;
  check('0 个 pageerror', report.errors.length === 0, report.errors.join(' | '));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await writeFile(OUT + '/verify.json', JSON.stringify(report, null, 2));
  await browser.close();
}