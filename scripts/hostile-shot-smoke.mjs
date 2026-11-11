// 偶发 bug 回归：世界中心（旧 480×270 屏幕边界之外）开战时，Boss 弹幕必须存活。
// 修复前 updateHostileShots 按旧单屏边界清退世界坐标弹丸，首发即消失，此脚本会超时。
// 用法：先起 dev/preview，再 node scripts/hostile-shot-smoke.mjs
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5173';
const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));

try {
  await page.goto(BASE + '/?scene=battle&cine=0&seed=hostile-world-center');
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.phase === 'play');

  // 玩家默认出生在世界中心；确认确实在旧屏幕边界之外，保证踩到回归区域
  const spawn = await page.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    return { x: s.player.x, y: s.player.y, w: s.world.w, h: s.world.h };
  });
  assert(spawn.x > 480 || spawn.y > 270, '出生点必须在旧屏幕边界外：' + JSON.stringify(spawn));

  // 拉到等级阈值触发大 Boss 问答，答错进入实战（走场景自己的结算路径）
  await page.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    const need = { 1: 5, 2: 8, 3: 11, 4: 14, 5: 17, 6: 20, 7: 23 }[s.act];
    while (s.run.progression.level < need) s.run.progression.level++;
  });
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.phase === 'encounter', null, { timeout: 15000 });
  await page.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    const active = s.run.encounters.active;
    const wrong = active.choices.find(c => c.id !== active.correctChoiceId);
    s.selectEncounterAnswer(wrong.id);
    s.confirmEncounterAnswer();
    s.continueEncounter();
    // 观察期间免伤，避免被弹幕/接触打死中断断言
    s.player.hp = 9999; s.player.maxHp = 9999; s.player.invulnUntil = 1e12;
  });
  await page.waitForFunction(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    return s?.phase === 'play' && s.boss?.alive;
  }, null, { timeout: 15000 });

  const bossPos = await page.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    return { x: s.boss.x, y: s.boss.y };
  });
  assert(bossPos.x > 480 || bossPos.y > 270, 'Boss 必须在旧屏幕边界外开火：' + JSON.stringify(bossPos));

  // 核心断言：弹幕发射后存活（修复前每帧被清退，这里会超时）
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.hostileShots.length > 0, null, { timeout: 10000 });
  const shots1 = await page.evaluate(() => window.__SIGILWEAVE_BATTLE__.hostileShots.map(s => ({ x: s.x, y: s.y })));
  await page.waitForTimeout(300);
  const shots2 = await page.evaluate(() => window.__SIGILWEAVE_BATTLE__.hostileShots.map(s => ({ x: s.x, y: s.y })));
  assert(shots2.length > 0, '300ms 后弹幕仍应存活');
  const moved = shots2.some((s, i) => shots1[i] && (Math.abs(s.x - shots1[i].x) > 0.5 || Math.abs(s.y - shots1[i].y) > 0.5));
  assert(moved, '弹幕应按速度飞行而不是被清退或原地不动');

  // 远程杂兵同款路径：世界坐标注入一发弹丸，确认存活并朝玩家飞
  await page.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    s.addHostileShot({ x: s.player.x, y: s.player.y - 60, vx: 0, vy: 60, damage: 1, lifeMs: 6000 });
  });
  await page.waitForTimeout(200);
  const injected = await page.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    return s.hostileShots.some(shot => Math.abs(shot.x - s.player.x) < 2 && shot.y > s.player.y - 60);
  });
  assert(injected, '注入的世界坐标弹丸应存活并推进');

  await page.screenshot({ path: 'docs/hostile-shots-world-center.png' });
  assert.equal(errors.length, 0, errors.join('; '));
  console.log('HOSTILE_SHOTS_OK', JSON.stringify({ spawn, bossPos, alive: shots2.length }));
} finally {
  await browser.close();
}