// 战斗深化（2026-11-18）实机核查：右键冲刺、编队三角、Boss 转阶段/破防。
// 用 ?scene=battle&quick=1 直进战斗，不经过标题与备战。
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4174';
const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
const dialogs = [];
page.on('pageerror', e => errors.push(e.message));
page.on('dialog', async (d) => { dialogs.push(d.type()); await d.dismiss(); });
const out = {};

try {
  await page.goto(BASE + '/?scene=battle&quick=1&seed=d3');
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.phase === 'play');
  await page.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    s.player.invulnUntil = Number.MAX_SAFE_INTEGER;
  });

  // ---- 1. 右键冲刺：真的位移，且不弹系统菜单 ----
  const before = await page.evaluate(() => ({ x: window.__SIGILWEAVE_BATTLE__.player.x, y: window.__SIGILWEAVE_BATTLE__.player.y }));
  await page.mouse.move(480 + 120, 270);
  await page.mouse.click(480 + 120, 270, { button: 'right', delay: 40 });
  await page.waitForTimeout(120);
  const dash = await page.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    const p = s.player;
    return { x: p.x, y: p.y, dashUntil: p.dashUntil ?? 0, dashReadyAt: p.dashReadyAt ?? 0, now: s.engine.now };
  });
  out.dash = {
    moved: Math.round(Math.hypot(dash.x - before.x, dash.y - before.y)),
    dashing: dash.dashUntil > dash.now,
    cooldownMs: Math.round(dash.dashReadyAt - dash.now),
    dialogs: dialogs.length,
  };
  await page.screenshot({ path: 'docs/d3-1-冲刺.png' });

  // ---- 2. 编队三角：两批同模板，各自独立 ----
  await page.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    const dif = { hp: 20, speed: 40, damage: 6, maxAlive: 999 };
    const put = (defId, path, uid, dx) => s.spawnEnemy(dif, { x: s.player.x + dx, y: s.player.y - 40 }, {
      defId, formationId: 'shield_wall', formationUid: uid, formationPath: path,
    });
    put('page_golem', 'vanguard', 'shield_wall#1', -70);
    put('crystal_dryad', 'ranged', 'shield_wall#1', -40);
    put('brass_warden', 'vanguard', 'shield_wall#2', 70);
    put('crystal_dryad', 'ranged', 'shield_wall#2', 40);
  });
  await page.waitForTimeout(700);
  // 首次编队刷出会弹 G19 面板，先收掉再截图，否则整屏被盖住
  await page.keyboard.press('Space');
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'docs/d3-2-编队三角.png' });
  // 裁一块放大看三角与光环（精英前排应当也有三角）
  await page.screenshot({ path: 'docs/d3-2b-编队三角-特写.png', clip: { x: 300, y: 120, width: 360, height: 220 } });
  out.formation = await page.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    const list = s.enemies.filter(e => e.formationId);
    return {
      members: list.length,
      uids: [...new Set(list.map(e => e.formationUid))],
      marks: list.filter(e => !(e.def?.elite && e.formationPath !== 'vanguard')).length,
      auras: list.filter(e => e.formationAura).length,
      eliteFront: list.filter(e => e.def?.elite && e.formationPath === 'vanguard').length,
    };
  });

  // ---- 3. Boss：推到阶段切换与破防 ----
  // 大 Boss 由「等级达标」触发；直接改 level 不会自己跑检查，所以手动调一次 checkProgressEvents。
  await page.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    const need = { 1: 5, 2: 10, 3: 15, 4: 20, 5: 24, 6: 28, 7: 32 }[s.stage];
    while (s.run.progression.level < need) s.run.progression.level++;
    s.checkProgressEvents();
  });
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.phase === 'encounter', null, { timeout: 20000 });
  // 答错 → 进真实战斗（选项与确认按钮都是游戏坐标，页面像素要 ×2）
  const wrongIdx = await page.evaluate(() => {
    const a = window.__SIGILWEAVE_BATTLE__.run.encounters.active;
    return a.choices.findIndex((c) => c.id !== a.correctChoiceId);
  });
  for (let attempt = 0; attempt < 10; attempt++) {
    await page.mouse.click(480, (312 + wrongIdx * 46), { delay: 60 });
    const selected = await page.evaluate(() => window.__SIGILWEAVE_BATTLE__.run.encounters.active?.selectedChoiceId ?? null);
    if (selected) break;
    await page.waitForTimeout(300);
  }
  for (let attempt = 0; attempt < 6; attempt++) {
    await page.mouse.click(792, 476, { delay: 60 });
    const ph = await page.evaluate(() => window.__SIGILWEAVE_BATTLE__.run.encounters.active?.phase ?? 'gone');
    if (ph === 'result') break;
    await page.waitForTimeout(300);
  }
  await page.mouse.click(792, 476, { delay: 60 }); // 「继续前进」离开结算面板
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.phase === 'play' && !!window.__SIGILWEAVE_BATTLE__.boss?.alive, null, { timeout: 20000 });
  // 清掉排队的新手引导面板，否则截图整屏被教程盖住
  for (let i = 0; i < 8; i++) { await page.mouse.click(850, 470, { delay: 40 }); await page.waitForTimeout(120); }
  const bossStart = await page.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    s.player.invulnUntil = Number.MAX_SAFE_INTEGER;
    return { hp: s.boss.hp, phase: s.boss.model.phase ?? 0, shots: s.boss.model.shots ?? 0 };
  });
  // 压到 60% → 应推一次阶段（阶段 1）
  await page.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    s.boss.hp = Math.round(s.boss.maxHp * 0.6);
  });
  await page.waitForFunction(() => (window.__SIGILWEAVE_BATTLE__.boss?.model.phase ?? 0) >= 1, null, { timeout: 20000 });
  for (let i = 0; i < 4; i++) { await page.mouse.click(850, 470, { delay: 40 }); await page.waitForTimeout(100); }
  await page.screenshot({ path: 'docs/d3-3-Boss转阶段.png' });
  const afterShift = await page.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    return { phase: s.boss.model.phase, mode: s.boss.model.mode, shiftLeft: Math.round(s.boss.model.shiftLeft ?? 0) };
  });
  // 压到 30% → 阶段 2，然后等一次破防（armor 归零 + breakUntil 生效）
  await page.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    s.boss.hp = Math.round(s.boss.maxHp * 0.3);
  });
  await page.waitForFunction(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    return (s.boss?.model.phase ?? 0) >= 2 && s.boss?.armor === 0;
  }, null, { timeout: 30000 });
  for (let i = 0; i < 4; i++) { await page.mouse.click(850, 470, { delay: 40 }); await page.waitForTimeout(80); }
  await page.screenshot({ path: 'docs/d3-4-Boss破防.png' });
  out.boss = await page.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    return {
      hpStart: null, hpNow: s.boss.hp, maxHp: s.boss.maxHp,
      phase: s.boss.model.phase, armor: s.boss.armor,
      mode: s.boss.model.mode, breakLeftMs: Math.round((s.boss.breakUntil ?? 0) - s.engine.now),
      shots: s.boss.model.shots, ultInMs: Math.round(s.boss.model.ultIn ?? 0),
    };
  });
  out.boss.afterShift = afterShift;
  out.boss.hpStart = bossStart.hp;
  out.boss.shotsFromStart = bossStart.shots;
  out.boss.phaseAtStart = bossStart.phase;
  out.errors = errors;
  out.dialogs = dialogs;
  console.log(JSON.stringify(out, null, 2));
} finally {
  await browser.close();
}
