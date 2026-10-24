import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ channel: 'msedge' });
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto((process.env.BASE_URL ?? 'http://127.0.0.1:5173') + '/?scene=battle&quick=1&seed=p2-smoke');
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.phase === 'play');
  // 先答对沿途NPC与Boss前置问答（答对直接消灭Boss），才能进入幕间。
  const triggerEncounter = async (n) => {
    if (n === 0) {
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
  };
  for (let n = 0; n < 2; n++) {
    await triggerEncounter(n);
    await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.phase === 'encounter', null, { timeout: 25000 });
    const idx = await page.evaluate(() => {
      const a = window.__SIGILWEAVE_BATTLE__.run.encounters.active;
      return a.choices.findIndex(c => c.id === a.correctChoiceId);
    });
    await page.mouse.click(480, (156 + idx * 23) * 2, { delay: 60 });
    await page.mouse.click(792, 476, { delay: 60 });
    await page.mouse.click(738, 472, { delay: 60 });
  }
  await page.waitForFunction(() => window.__SIGILWEAVE_WORKSHOP__?.workshop, { timeout: 30000 });
  const first = await page.evaluate(() => {
    const s = window.__SIGILWEAVE_WORKSHOP__;
    return { act: s.workshop.draft.act, count: s.workshop.draft.unlocked.length, reports: s.run.reports.length };
  });
  assert.deepEqual(first, { act: 2, count: 12, reports: 1 });
  const click = (x, y) => page.mouse.click(x * 2, y * 2, { delay: 60 });
  // 出发按钮在未领完奖励时只能提示，不得越过。
  await click(352, 261);
  assert.equal(await page.evaluate(() => !!window.__SIGILWEAVE_WORKSHOP__), true);
  async function takeRewards() {
    for (let round = 0; round < 3; round++) {
      const old = await page.evaluate(() => window.__SIGILWEAVE_WORKSHOP__.workshop.offer.id);
      await click(86, 45);
      try {
        await page.waitForFunction(id => window.__SIGILWEAVE_WORKSHOP__.workshop.offer?.id !== id, old, { timeout: 4000 });
      } catch (e) {
        console.log('REWARD_TIMEOUT', JSON.stringify(await page.evaluate(() => {
          const s = window.__SIGILWEAVE_WORKSHOP__;
          return { offer: s?.workshop.offer, note: s?.note, departed: s?.departed, scenes: window.__SIGILWEAVE__.scene.getScenes(true).map(x => x.scene.key), width: window.innerWidth, errors: [] };
        })), JSON.stringify(errors));
        await page.screenshot({ path: 'docs/p2-调试.png' });
        throw e;
      }
    }
  }
  await takeRewards();
  const hand = await page.evaluate(() => Object.entries(window.__SIGILWEAVE_WORKSHOP__.workshop.hand).filter(([, n]) => n > 0).map(([k]) => k));
  const key = hand[0];
  await click(352, 85); // 第一张手牌（82行起）
  await click(201, 118); // 8号空位
  const placed = await page.evaluate(() => window.__SIGILWEAVE_WORKSHOP__.workshop.draft.slots[7]);
  assert.equal(placed.kind + ':' + placed.defId, key);
  await page.screenshot({ path: 'docs/p2-幕间编辑.png' });
  // 出口编辑：第7格关掉右出口，出发后应保留单向配置
  await click(201, 118);
  await click(425, 70);
  await click(168, 243);
  await click(117, 258);
  await click(352, 261);
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.act === 2 && window.__SIGILWEAVE_BATTLE__.phase === 'play');
  const resumed = await page.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    return { act: s.act, count: s.grid.unlockedIds().length, slot: s.grid.cells[7].slot, exits: [...s.grid.cells[7].exits] };
  });
  assert.equal(resumed.count, 12);
  assert.deepEqual(resumed.slot, placed);
  assert.deepEqual(resumed.exits, ['up', 'down', 'left'], '出口编辑应生效');
  await page.keyboard.press('KeyM');
  await page.keyboard.press('KeyM'); // 静音开关往返，不应产生页面错误
  // 交易专项使用明确的16碎片测试夹具，不冒充正常击杀获得资源。
  await page.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    const run = structuredClone(s.run); run.shards = 16;
    s.scene.start('IntermissionScene', { run, report: { triggers: 12, blocked: 0, kills: 3 } });
  });
  await page.waitForFunction(() => !!window.__SIGILWEAVE_WORKSHOP__);
  await takeRewards();
  await click(93, 131); // 6号符位
  await click(296, 199); // 装熔炉
  assert.equal(await page.evaluate(() => window.__SIGILWEAVE_WORKSHOP__.workshop.shards), 8);
  await click(296, 233); // 拆槽1，返4
  assert.equal(await page.evaluate(() => window.__SIGILWEAVE_WORKSHOP__.workshop.shards), 12);
  await click(407, 199); // 中继
  assert.equal(await page.evaluate(() => window.__SIGILWEAVE_WORKSHOP__.workshop.shards), 4);
  await click(352, 261);
  await page.waitForFunction(() => !!window.__SIGILWEAVE_BATTLE__ && !window.__SIGILWEAVE_WORKSHOP__);
  assert.equal(await page.evaluate(() => window.__SIGILWEAVE_BATTLE__.grid.cells[5].mutedOutput), true);
  assert.equal(await page.evaluate(() => window.__SIGILWEAVE_BATTLE__.shardCount), 4);
  assert.equal(errors.length, 0, errors.join('; '));
  console.log(JSON.stringify({ first, resumed, transactions: '16→8→12→4', errors }));
} finally { await browser.close(); }
