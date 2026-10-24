// 三幕完整回归：6/12/16格、1/1/2脉流、沿途NPC问答、每幕Boss前置问答（答对直接消灭）、两次幕间构筑、最终胜利。
import { chromium, firefox } from 'playwright';
import assert from 'node:assert/strict';
const browser = process.env.BROWSER === 'firefox'
  ? await firefox.launch()
  : await chromium.launch({ channel: 'msedge' });
try {
 const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
 const errors = [];
 page.on('pageerror', e => errors.push(e.message));
 await page.goto((process.env.BASE_URL ?? 'http://127.0.0.1:5173') + '/?scene=battle&quick=1&seed=three-act');
 const click = (x, y) => page.mouse.click(x * 2, y * 2, { delay: 60 });
 // 任一遭遇出现时：答对并继续。kind: 'npc' 走事件点 / 'major' 强制等级触发。
 async function answerEncounter(kind) {
  if (kind === 'npc') {
   await page.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    const p = s.eventPoints.find(p => p.type === 'npc' && !p.done);
    s.player.x = p.x; s.player.y = p.y + 12;
   });
  } else {
   await page.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    const need = { 1: 5, 2: 8, 3: 11 }[s.act];
    while (s.run.progression.level < need) s.run.progression.level++;
   });
  }
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.phase === 'encounter', null, { timeout: 25000 });
  const id = await page.evaluate(() => window.__SIGILWEAVE_BATTLE__.run.encounters.active.id);
  const idx = await page.evaluate(() => {
   const a = window.__SIGILWEAVE_BATTLE__.run.encounters.active;
   return a.choices.findIndex(c => c.id === a.correctChoiceId);
  });
  await click(240, 156 + idx * 23);
  await click(396, 238);
  await click(369, 236);
  return id;
 }
 const observations = [];
 for (let act = 1; act <= 3; act++) {
  await page.waitForFunction(n => window.__SIGILWEAVE_BATTLE__?.act === n, act);
  observations.push(await page.evaluate(() => {
   const s = window.__SIGILWEAVE_BATTLE__;
   return { act: s.act, count: s.grid.unlockedIds().length, signals: s.engine.signals.size };
  }));
  const npcId = await answerEncounter('npc');
  assert.equal(npcId, 'npc-' + act);
  const bossId = await answerEncounter('major');
  assert.equal(bossId, 'boss-' + act);
  if (act < 3) {
   await page.waitForFunction(() => !!window.__SIGILWEAVE_WORKSHOP__, null, { timeout: 15000 });
   for (let round = 0; round < 3; round++) {
    const old = await page.evaluate(() => window.__SIGILWEAVE_WORKSHOP__.workshop.offer.id);
    await click(86, 45);
    await page.waitForFunction(id => window.__SIGILWEAVE_WORKSHOP__.workshop.offer?.id !== id, old);
   }
   await click(352, 261);
  }
 }
 await page.waitForFunction(() => window.__SIGILWEAVE__.scene.isActive('GameOverScene'), null, { timeout: 20000 });
 const result = await page.evaluate(() => {
  const s = window.__SIGILWEAVE__.scene.getScene('GameOverScene');
  return { victory: s.data.victory, act: s.data.act, elapsedMs: s.data.elapsedMs,
   resolutions: structuredClone(s.data.bossResolutions),
   heading: s.children.list.filter(x => x.type === 'Text').map(x => x.text).join(' | ') };
 });
 // 起点已按平衡调参改为 2/3/3
 assert.deepEqual(observations, [{ act: 1, count: 6, signals: 2 }, { act: 2, count: 12, signals: 3 }, { act: 3, count: 16, signals: 3 }]);
 assert.equal(result.victory, true);
 assert.equal(result.act, 3);
 assert.equal(Object.keys(result.resolutions).length, 3);
 assert(Object.values(result.resolutions).every(r => r.method === 'quiz' && r.reward === 12));
 // 幕时长改由等级触发Boss决定：只验证“有时间积累”而非固定45秒
 console.log('ELAPSED_DEBUG', JSON.stringify({ elapsedMs: result.elapsedMs }));
 // 幕由等级触发大Boss决定，quick流程下引擎时间很短是预期：只验证“有积累”
 assert(result.elapsedMs >= 200, '结算应显示三幕总时间: ' + result.elapsedMs);
 assert.match(result.heading, /契约终结/);
 assert.equal(errors.length, 0, errors.join('; '));
 await page.screenshot({ path: 'docs/p3-三幕通关.png' });
 console.log(JSON.stringify({ observations, resolutions: result.resolutions, errors }));
} finally { await browser.close(); }
