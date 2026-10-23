// P3 遭遇问答浏览器回归：NPC对错、Boss答对直接消灭、答错进入实战、读题全冻结、结算幂等。
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5173';
const browser = await chromium.launch({ channel: 'msedge' });

async function newRun(seed) {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE + '/?scene=battle&quick=1&seed=' + seed);
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.phase === 'play');
  return { page, errors };
}
const click = (page, x, y) => page.mouse.click(x * 2, y * 2, { delay: 60 });
async function waitEncounter(page) {
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.phase === 'encounter', null, { timeout: 20000 });
}
async function choiceIndex(page, predicate) {
  return page.evaluate(pred => {
    const active = window.__SIGILWEAVE_BATTLE__.run.encounters.active;
    return active.choices.findIndex(c => (pred === 'correct' ? c.id === active.correctChoiceId : c.id !== active.correctChoiceId));
  }, predicate);
}
async function answer(page, which) {
  const idx = await choiceIndex(page, which);
  assert(idx >= 0);
  await click(page, 240, 156 + idx * 23);   // 选项按钮中心
  await click(page, 396, 238);              // 确认作答
}

// ---- 路径A：NPC答对领奖 + Boss答对直接消灭 ----
{
  const { page, errors } = await newRun('enc-a');
  await page.evaluate(() => { const s = window.__SIGILWEAVE_BATTLE__; s.player.hp = 50; });
  await waitEncounter(page);
  const npc = await page.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    return { id: s.run.encounters.active.id, now: s.engine.now, paused: s.engine.paused };
  });
  assert.equal(npc.id, 'npc-1'); assert.equal(npc.paused, true);
  // 读题期间战斗时钟冻结：真实时间流逝500ms，模拟时钟不变。
  await page.waitForTimeout(500);
  const frozenNow = await page.evaluate(() => window.__SIGILWEAVE_BATTLE__.engine.now);
  assert.equal(frozenNow, npc.now);
  await page.screenshot({ path: 'docs/p3-NPC问答.png' });
  await answer(page, 'correct');
  const reward = await page.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    return { hp: s.player.hp, shards: s.shardCount, phase: s.run.encounters.active?.phase };
  });
  assert.equal(reward.hp, 65);            // 50 + 15 治疗
  assert.equal(reward.shards, 8);         // NPC答对 +8
  assert.equal(reward.phase, 'result');
  await click(page, 369, 236);            // 继续前进
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.phase === 'play');
  // Boss前置问答：答对直接消灭
  await waitEncounter(page);
  const bossQ = await page.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    return { id: s.run.encounters.active.id, bossAlive: !!s.boss?.alive, started: s.bossStarted };
  });
  assert.equal(bossQ.id, 'boss-1'); assert.equal(bossQ.bossAlive, true); assert.equal(bossQ.started, true);
  await page.screenshot({ path: 'docs/p3-Boss问答.png' });
  await answer(page, 'correct');
  await click(page, 369, 236);
  await page.waitForFunction(() => !!window.__SIGILWEAVE_WORKSHOP__, null, { timeout: 15000 });
  const after = await page.evaluate(() => {
    const s = window.__SIGILWEAVE_WORKSHOP__;
    return {
      act: s.run.act,
      shards: s.run.shards,
      resolutions: structuredClone(s.run.bossResolutions),
      completed: structuredClone(s.run.encounters.completed),
      reports: s.run.reports.length,
    };
  });
  assert.equal(after.act, 2);
  assert.deepEqual(after.resolutions, { 1: { act: 1, bossId: 'boss-1', method: 'quiz', reward: 12 } });
  assert.equal(after.completed['npc-1'], true); assert.equal(after.completed['boss-1'], true);
  assert.equal(after.reports, 1);
  // 碎片 = NPC8 + Boss问答4 + 通关12 + 击杀掉落(不确定)，至少24
  assert(after.shards >= 24, 'shards=' + after.shards);
  assert.equal(errors.length, 0, errors.join('; '));
  await page.close();
  console.log('PATH_A_OK', JSON.stringify(after));
}

// ---- 路径B：Boss答错进入真实战斗 ----
{
  const { page, errors } = await newRun('enc-b');
  await waitEncounter(page);                       // NPC
  await answer(page, 'wrong');
  const penalty = await page.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    return { slowUntil: s.playerSlowUntil, now: s.engine.now, shards: s.shardCount };
  });
  assert.equal(penalty.slowUntil, penalty.now + 8000);  // 迟缓诅咒8秒
  assert.equal(penalty.shards, 0);                       // 答错不领奖
  await click(page, 369, 236);
  await waitEncounter(page);                       // Boss
  await answer(page, 'wrong');
  await click(page, 369, 236);                     // 准备战斗
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.phase === 'play');
  const battle = await page.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    return { bossAlive: s.boss?.alive, bossStarted: s.bossStarted, enemies: s.enemies.length };
  });
  assert.equal(battle.bossAlive, true); assert.equal(battle.bossStarted, true);
  // Boss真的在攻击：预警600ms后发射弹丸
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__.boss.model.shots >= 1, null, { timeout: 15000 });
  await page.screenshot({ path: 'docs/p3-Boss实战.png' });
  // 战斗击败路径：把Boss打到濒死，让下一次命中完成处决
  await page.evaluate(() => { const s = window.__SIGILWEAVE_BATTLE__; s.boss.hp = 0; s.boss.alive = false; });
  await page.waitForFunction(() => !!window.__SIGILWEAVE_WORKSHOP__, null, { timeout: 15000 });
  const res = await page.evaluate(() => window.__SIGILWEAVE_WORKSHOP__.run.bossResolutions[1]);
  assert.equal(res.method, 'combat'); assert.equal(res.reward, 12);
  assert.equal(errors.length, 0, errors.join('; '));
  await page.close();
  console.log('PATH_B_OK', JSON.stringify(res));
}

await browser.close();
