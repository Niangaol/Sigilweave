// 确定性接线回归：逐个宝箱增益、Boss双层掉落防重复、跨场景保留。
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5173';
const browser = await chromium.launch({ channel: 'msedge' });
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE + '/?scene=battle&seed=rewards-acceptance');
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.phase === 'play');
  const result = await page.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    s.openPause();
    const rng = s.combatRng.next;
    const chest = i => {
      s.combatRng.next = () => (i + 0.1) / 5;
      s.spawnChest(s.player.x, s.player.y);
      s.updateChests(0);
    };
    chest(0); chest(0); // +20生命两次，不能重复累加已计入maxHp的bonus
    chest(1); chest(2); chest(3); chest(4);
    const character = { ...s.run.characterStats };
    const x = s.player.x;
    s.readMoveAxis = () => ({ dx: 1, dy: 0 });
    s.updatePlayer(1000);
    const moved = s.player.x - x;
    const cd = s.grid.cells[5].effCooldownMs;
    s.combatRng.next = () => 2.1 / 6; // 冷凝回路
    s.defeatBoss('combat', 'miniboss-1', 'mini');
    const cooled = s.grid.cells[5].effCooldownMs;
    const hand = s.run.hand['sigil:frost_arrow'];
    const shards = s.shardCount;
    s.defeatBoss('combat', 'miniboss-1', 'mini');
    const duplicate = { hand: s.run.hand['sigil:frost_arrow'], shards: s.shardCount, cd: s.grid.cells[5].effCooldownMs };
    s.combatRng.next = () => 4.1 / 6; // 延续之链
    s.defeatBoss('quiz', 'boss-1', 'major');
    const combo = { actual: s.engine.combos.windowMul, expected: s.run.compassBuffs.comboWindowMul };
    const majorHand = s.run.hand['sigil:frost_arrow'];
    s.combatRng.next = rng;
    window.__REWARD_OLD_BOOT__ = s.bootCount;
    return { character, moved, cd, cooled, hand, shards, duplicate, combo, majorHand };
  });
  assert.equal(result.character.maxHp, 140);
  assert.equal(result.character.shieldCap, 50);
  assert.equal(result.character.pickupBonus, 12);
  assert.equal(result.character.iframesBonus, 0.15);
  assert.equal(result.character.speedMult, 1.08);
  assert(result.moved > 86, '移速增益须真正作用于移动');
  assert.equal(result.cooled, result.cd * 0.9);
  assert.equal(result.hand, 1, '小Boss掉一张法术');
  assert.deepEqual(result.duplicate, { hand: 1, shards: result.shards, cd: result.cooled });
  assert.equal(result.majorHand, 2, '大Boss额外掉一张法术');
  assert.equal(result.combo.actual, result.combo.expected);
  assert.equal(result.combo.actual, 1.25);
  await page.evaluate(() => { const s = window.__SIGILWEAVE_BATTLE__; s.scene.restart({ run: s.run }); });
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.bootCount > window.__REWARD_OLD_BOOT__);
  const restored = await page.evaluate(() => { const p = window.__SIGILWEAVE_BATTLE__.player; return { maxHp: p.maxHp, shieldCap: p.shieldCap, speedMult: p.speedMult, pickupBonus: p.pickupBonus, iframesBonus: p.iframesBonus }; });
  for (const [key, value] of Object.entries(restored)) assert.equal(value, result.character[key], '跨场景保留人物增益：' + key);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ result, restored, errors }));
} finally { await browser.close(); }
