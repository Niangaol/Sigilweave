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
  // 面板重渲染瞬间点击可能丢失：选后验证，未选中则重试
  for (let attempt = 0; attempt < 10; attempt++) {
    await click(page, 240, 156 + idx * 23);   // 选项按钮中心
    const selected = await page.evaluate(() => window.__SIGILWEAVE_BATTLE__.run.encounters.active?.selectedChoiceId ?? null);
    if (selected) break;
    await page.waitForTimeout(400);
  }
  const confirmed = assert.ok;
  for (let attempt = 0; attempt < 4; attempt++) {
    await click(page, 396, 238);              // 确认作答
    const phase2 = await page.evaluate(() => window.__SIGILWEAVE_BATTLE__.run.encounters.active?.phase ?? 'question');
    if (phase2 === 'result') break;
    await page.waitForTimeout(250);
  }
}
// 大地图流：把玩家传送到指定类型事件点旁；大Boss用等级强制触发
async function goToEvent(page, type) {
  await page.evaluate((type) => {
    const s = window.__SIGILWEAVE_BATTLE__;
    const point = s.eventPoints.find(p => p.type === type && !p.done) ?? s.eventPoints.find(p => p.type === type);
    if (!point) throw new Error('no point: ' + type);
    s.player.x = point.x; s.player.y = point.y + 12;
  }, type);
}
async function forceMajorLevel(page) {
  await page.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    const need = { 1: 5, 2: 8, 3: 11 }[s.act];
    while (s.run.progression.level < need) s.run.progression.level++;
  });
}

// ---- 路径A：NPC答对领奖 + Boss答对直接消灭 ----
{
  const { page, errors } = await newRun('enc-a');
  await page.evaluate(() => { const s = window.__SIGILWEAVE_BATTLE__; s.player.hp = 50; });
  await goToEvent(page, 'npc');
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
  // 大Boss等级触发：拉到阈值即登场
  await forceMajorLevel(page);
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
  assert.deepEqual(after.resolutions, { 1: { act: 1, bossId: 'boss-1', method: 'quiz', tier: 'major', reward: 12 } });
  assert.equal(after.completed['npc-1'], true); assert.equal(after.completed['boss-1'], true);
  assert.equal(after.reports, 1);
  // 碎片 = NPC8 + Boss问答4 + 通关12 + 击杀掉落(不确定)，至少24
  assert(after.shards >= 24, 'shards=' + after.shards);
  assert.equal(errors.length, 0, errors.join('; '));
  await page.close();
  console.log('PATH_A_OK', JSON.stringify(after));
}

// ---- 路径B：Boss答错进入真实战斗（用已验证的直接点击时序） ----
{
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE + '/?scene=battle&quick=1&seed=enc-b');
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.phase === 'play');
  const click = (x, y) => page.mouse.click(x * 2, y * 2, { delay: 60 });
  const goToEvent = (type) => page.evaluate((type) => {
    const s = window.__SIGILWEAVE_BATTLE__;
    const point = s.eventPoints.find(p => p.type === type && !p.done) ?? s.eventPoints.find(p => p.type === type);
    if (!point) throw new Error('no point: ' + type);
    s.player.x = point.x; s.player.y = point.y + 12;
  }, type);
  const forceMajorLevel = () => page.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    const need = { 1: 5, 2: 8, 3: 11 }[s.act];
    while (s.run.progression.level < need) s.run.progression.level++;
  });
  const answerWrong = async () => {
    const idx = await page.evaluate(() => {
      const a = window.__SIGILWEAVE_BATTLE__.run.encounters.active;
      return a.choices.findIndex(c => c.id !== a.correctChoiceId);
    });
    // 面板重渲染瞬间点击可能丢失：选后验证，未选中则重试
    for (let attempt = 0; attempt < 6; attempt++) {
      await click(240, 156 + idx * 23);
      const selected = await page.evaluate(() => window.__SIGILWEAVE_BATTLE__.run.encounters.active?.selectedChoiceId ?? null);
      if (selected) break;
      await page.waitForTimeout(300);
    }
    for (let attempt = 0; attempt < 6; attempt++) {
      await click(396, 238);
      const phase2 = await page.evaluate(() => window.__SIGILWEAVE_BATTLE__.run.encounters.active?.phase ?? 'question');
      if (phase2 === 'result') break;
      await page.waitForTimeout(300);
    }
  };
  // NPC 答错：迟缓惩罚，不领奖
  await goToEvent('npc');
  await waitEncounter(page);
  await answerWrong();
  const penalty = await page.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    return { slowUntil: s.playerSlowUntil, now: s.engine.now, shards: s.shardCount };
  });
  assert.equal(penalty.slowUntil, penalty.now + 8000);
  assert.equal(penalty.shards, 0);
  await click(369, 236);
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.phase === 'play', null, { timeout: 8000 });
  // 大Boss等级触发 → 答错 → 真实战斗
  await forceMajorLevel();
  await waitEncounter(page);
  await answerWrong();
  await click(369, 236);
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.phase === 'play', null, { timeout: 8000 });
  const battle = await page.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    return { bossAlive: s.boss?.alive, bossStarted: s.bossStarted, shots: s.boss?.model.shots ?? 0 };
  });
  assert.equal(battle.bossAlive, true); assert.equal(battle.bossStarted, true);
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__.boss.model.shots >= 1, null, { timeout: 15000 });
  await page.screenshot({ path: 'docs/p3-Boss实战.png' });
  await page.evaluate(() => { const s = window.__SIGILWEAVE_BATTLE__; s.boss.hp = 0; s.boss.alive = false; });
  await page.waitForFunction(() => !!window.__SIGILWEAVE_WORKSHOP__, null, { timeout: 15000 });
  const res = await page.evaluate(() => window.__SIGILWEAVE_WORKSHOP__.run.bossResolutions[1]);
  assert.equal(res.method, 'combat'); assert.equal(res.reward, 12);
  assert.equal(errors.length, 0, errors.join('; '));
  await page.close();
  console.log('PATH_B_OK', JSON.stringify(res));
}

await browser.close();
