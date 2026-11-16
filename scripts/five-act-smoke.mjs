// 五幕七场完整回归：幕 chapter 1..5 是叙事单位，场 stage 1..7 是玩法单位。
// 场 1/2/3 各属一幕；场 4+5 同属第四幕、场 6+7 同属第五幕，幕内**原地换场**（不开幕间）。
// 每场：1 个 NPC 问答 + 全部小 Boss（场 1-3 各 4 只、场 4-7 各 2 只）+ 大 Boss 前置问答（答对直接消灭）。
// 通幕（场 1/2/3/5）进幕间构筑共 4 次；场 4→5、6→7 只播 1.6 秒场次卡；场 7 通关胜利。
// 用法：npm run build && node scripts/static-server.mjs dist 4174
//       BASE_URL=http://127.0.0.1:4174 node scripts/five-act-smoke.mjs
import assert from 'node:assert/strict';
import { openBrowser } from './lib/browser.mjs';
import { minorBossIdsOfStage } from '../src/logic/acts.js';

// 大 Boss 触发等级按「场」取，与 src/logic/progression.js 的 MAJOR_BOSS_LEVEL 一致。
const BOSS_LEVEL = { 1: 5, 2: 10, 3: 15, 4: 20, 5: 24, 6: 28, 7: 32 };
// 每场所属幕（src/logic/acts.js 的 chapterOf）。
const STAGE_CHAPTER = { 1: 1, 2: 2, 3: 3, 4: 4, 5: 4, 6: 5, 7: 5 };
// 大 Boss 解决后原地换场的两场；其余非终局场走幕间工作台。
const SWAP_STAGES = new Set([4, 6]);
// HUD 顶栏：前三幕用星名，合并幕用当前场地名（src/ui/Hud.js 的 actLabel）。
const HUD_LABELS = ['第一幕 · 天枢', '第二幕 · 天璇', '第三幕 · 天玑', '第四幕 · 沉钟书库', '第四幕 · 衡律法庭', '第五幕 · 熔星锻炉', '第五幕 · 破晓之座'];

// 沙箱里 Playwright 直接 launch 会因命名管道 EPERM：用 node scripts/with-cdp.mjs scripts/five-act-smoke.mjs 起 Edge 再连 CDP。
const browser = await openBrowser();
try {
 const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
 const errors = [];
 page.on('pageerror', e => errors.push(e.message));
 await page.goto((process.env.BASE_URL ?? 'http://127.0.0.1:5173') + '/?scene=battle&quick=1&cine=0&seed=five-act');
 const click = (x, y) => page.mouse.click(x * 2, y * 2, { delay: 60 });
 const battle = () => page.evaluate(() => {
  const s = window.__SIGILWEAVE_BATTLE__;
  return s ? { stage: s.stage, chapter: s.chapter, phase: s.phase } : null;
 });

 // 答对当前遭遇并点「继续前进」。选项/确认/继续都带重试，避免面板重渲染瞬间丢点击。
 async function answerCorrect() {
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.phase === 'encounter', null, { timeout: 25000 });
  const id = await page.evaluate(() => window.__SIGILWEAVE_BATTLE__.run.encounters.active.id);
  const idx = await page.evaluate(() => {
   const a = window.__SIGILWEAVE_BATTLE__.run.encounters.active;
   return a.choices.findIndex(c => c.id === a.correctChoiceId);
  });
  assert(idx >= 0, '遭遇 ' + id + ' 没有正确选项');
  for (let attempt = 0; attempt < 10; attempt++) {
   await click(240, 156 + idx * 23);
   if (await page.evaluate(() => window.__SIGILWEAVE_BATTLE__.run.encounters.active?.selectedChoiceId ?? null)) break;
   await page.waitForTimeout(300);
  }
  for (let attempt = 0; attempt < 6; attempt++) {
   await click(396, 238);
   if (await page.evaluate(() => window.__SIGILWEAVE_BATTLE__.run.encounters.active?.phase) === 'result') break;
   await page.waitForTimeout(250);
  }
  await click(369, 236);
  return id;
 }

 // 走到某个事件点旁触发遭遇（NPC 与小 Boss 共用）。
 async function answerPoint(pointId) {
  await page.evaluate((pid) => {
   const s = window.__SIGILWEAVE_BATTLE__;
   const p = s.eventPoints.find(p => p.id === pid && !p.done);
   if (!p) throw new Error('事件点不存在或已完成: ' + pid);
   s.player.x = p.x; s.player.y = p.y + 12;
  }, pointId);
  const id = await answerCorrect();
  assert.equal(id, pointId);
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.phase === 'play', null, { timeout: 15000 });
  return id;
 }

 // 大 Boss 用等级强制触发（不必真刷到那个等级）。
 async function answerMajor(stage) {
  await page.evaluate((need) => {
   const s = window.__SIGILWEAVE_BATTLE__;
   while (s.run.progression.level < need) s.run.progression.level++;
  }, BOSS_LEVEL[stage]);
  const id = await answerCorrect();
  assert.equal(id, 'boss-' + stage);
  return id;
 }

 const observations = [];
 let swaps = 0;
 let intermissions = 0;
 for (let stage = 1; stage <= 7; stage++) {
  await page.waitForFunction(n => window.__SIGILWEAVE_BATTLE__?.stage === n && window.__SIGILWEAVE_BATTLE__?.phase === 'play', stage, { timeout: 30000 });
  observations.push(await page.evaluate(() => {
   const s = window.__SIGILWEAVE_BATTLE__;
   if (s.background.world.w !== s.world.w || s.background.world.h !== s.world.h) throw new Error('换场背景尺寸不匹配');
   return {
    stage: s.stage, chapter: s.chapter, count: s.grid.unlockedIds().length, signals: s.engine.signals.size,
    points: s.eventPoints.length, hud: s.hud?.actText?.text ?? '', world: s.world.w + 'x' + s.world.h,
   };
  }));
  assert.equal(observations.at(-1).chapter, STAGE_CHAPTER[stage], '场 ' + stage + ' 的幕号不对');
  assert.equal(observations.at(-1).points, stage <= 3 ? 5 : 3, '场 ' + stage + ' 事件点数不对');

  await answerPoint('npc-' + stage);
  for (const miniId of minorBossIdsOfStage(stage)) await answerPoint(miniId);
  // 小 Boss 不通幕、不换场：答完仍在本场战斗。
  assert.equal((await battle()).stage, stage, '小 Boss 不应推进场次');
  await answerMajor(stage);

  if (stage === 7) break;
  if (SWAP_STAGES.has(stage)) {
   swaps++;
   // 幕内换场：先播 1.6 秒场次卡，再回战斗；不开幕间、不入账。
   await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.phase === 'stageIntro', null, { timeout: 15000 });
   const intro = await page.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    return { stage: s.stage, chapter: s.chapter, reports: s.run.reports.length, workshop: !!window.__SIGILWEAVE_WORKSHOP__ };
   });
   assert.equal(intro.stage, stage + 1);
   assert.equal(intro.chapter, STAGE_CHAPTER[stage], '换场不应改幕号');
   assert.equal(intro.workshop, false, '换场不应开幕间工作台');
   if (swaps === 1) await page.screenshot({ path: 'docs/五幕换场.png' });
   await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.phase === 'play', null, { timeout: 15000 });
  } else {
   intermissions++;
   await page.waitForFunction(() => !!window.__SIGILWEAVE_WORKSHOP__, null, { timeout: 20000 });
   for (let round = 0; round < 3; round++) {
    const old = await page.evaluate(() => window.__SIGILWEAVE_WORKSHOP__.workshop.offer.id);
    await click(86, 45);
    await page.waitForFunction(id => window.__SIGILWEAVE_WORKSHOP__.workshop.offer?.id !== id, old, { timeout: 8000 });
   }
   await click(352, 261);
  }
 }

 await page.waitForFunction(() => window.__SIGILWEAVE__.scene.isActive('GameOverScene'), null, { timeout: 25000 });
 const result = await page.evaluate(() => {
  const s = window.__SIGILWEAVE__.scene.getScene('GameOverScene');
  return {
   victory: s.data.victory, chapter: s.data.chapter, stage: s.data.stage, elapsedMs: s.data.elapsedMs,
   resolutions: structuredClone(s.data.bossResolutions),
   minis: structuredClone(s.data.miniBossResolutions ?? {}),
   heading: s.children.list.filter(x => x.type === 'Text').map(x => x.text).join(' | '),
  };
 });

 // 格数/脉流按幕：幕1 6格2脉流、幕2 12格3、幕3 16格3、幕4 16格4、幕5 16格4（src/logic/constants.js 的 ACTS）。
 const EXPECTED = [
  { stage: 1, chapter: 1, count: 6, signals: 2, points: 5, world: '2400x1800' },
  { stage: 2, chapter: 2, count: 12, signals: 3, points: 5, world: '2600x1900' },
  { stage: 3, chapter: 3, count: 16, signals: 3, points: 5, world: '2800x2000' },
  { stage: 4, chapter: 4, count: 16, signals: 4, points: 3, world: '2800x2100' },
  { stage: 5, chapter: 4, count: 16, signals: 4, points: 3, world: '2800x2100' },
  { stage: 6, chapter: 5, count: 16, signals: 4, points: 3, world: '3000x2200' },
  { stage: 7, chapter: 5, count: 16, signals: 4, points: 3, world: '3000x2200' },
 ];
 assert.deepEqual(observations.map(({ stage, chapter, count, signals, points, world }) => ({ stage, chapter, count, signals, points, world })), EXPECTED);
 assert.deepEqual(observations.map(o => o.hud), HUD_LABELS);
 assert.equal(swaps, 2, '幕内换场应恰好 2 次（场 4→5、6→7）');
 assert.equal(intermissions, 4, '幕间工作台应恰好 4 次（场 1/2/3/5 之后）');
 assert.equal(result.victory, true);
 assert.equal(result.chapter, 5);
 assert.equal(result.stage, 7);
 // 七契：七场各一条大 Boss 收据
 assert.deepEqual(Object.keys(result.resolutions).map(Number).sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7]);
 assert(Object.values(result.resolutions).every(r => r.method === 'quiz' && r.tier === 'major' && r.reward === 12), JSON.stringify(result.resolutions));
 // 二十只小 Boss：场 1-3 各 4、场 4-7 各 2
 const expectedMinis = [];
 for (let s = 1; s <= 7; s++) expectedMinis.push(...minorBossIdsOfStage(s));
 assert.deepEqual(Object.keys(result.minis).sort(), expectedMinis.slice().sort());
 assert(Object.values(result.minis).every(r => r.tier === 'mini' && r.reward === 6), JSON.stringify(result.minis));
 assert(result.elapsedMs >= 200, '结算应显示七场总时间: ' + result.elapsedMs);
 assert.match(result.heading, /契约终结/);
 assert.equal(errors.length, 0, errors.join('; '));
 await page.screenshot({ path: 'docs/五幕通关.png' });
 console.log(JSON.stringify({ observations, swaps, intermissions, resolutions: result.resolutions, minis: Object.keys(result.minis).length, elapsedMs: result.elapsedMs, errors }));
} finally { await browser.close(); }
