// 新循环冒烟：经验升级三选一、宝箱人物增益、大Boss等级触发、小Boss事件点双路径。
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5173';
const browser = await chromium.launch({ channel: 'msedge' });
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE + '/?scene=battle&seed=prog-smoke');
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.phase === 'play');
  const click = (x, y) => page.mouse.click(x * 2, y * 2, { delay: 60 });

  // 1) 经验升级三选一：灌经验到升 2 级 → 队列两个三选一
  await page.evaluate(() => { const s = window.__SIGILWEAVE_BATTLE__; s.pendingPicks = 0; });
  await page.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    s.queueLevelPicks(2);
  });
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.phase === 'levelup');
  const uiVisible = await page.evaluate(() => !!window.__SIGILWEAVE_BATTLE__.levelupUI);
  assert.equal(uiVisible, true);
  await page.screenshot({ path: 'docs/p6-升级三选一.png' });
  // 数字键选第一张
  await page.keyboard.press('Digit1');
  // 两连升：第一张选完立刻开第二级面板，再选一张才回 play
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.phase === 'levelup');
  await page.keyboard.press('Digit1');
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.phase === 'play');
  const handAfter = await page.evaluate(() => Object.entries(window.__SIGILWEAVE_BATTLE__.run.hand).filter(([, n]) => n > 0));
  assert.equal(handAfter.length, 2, '两张升级卡都进手牌');

  // 2) 宝箱：在玩家脚下生成一个，走近开启
  await page.evaluate(() => { const s = window.__SIGILWEAVE_BATTLE__; s.spawnChest(s.player.x + 30, s.player.y); });
  await page.keyboard.down('ArrowRight');
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.chests.length === 0, null, { timeout: 8000 });
  await page.keyboard.up('ArrowRight');
  const hpBuffed = await page.evaluate(() => window.__SIGILWEAVE_BATTLE__.player.maxHpBonus >= 20 || window.__SIGILWEAVE_BATTLE__.player.speedMult > 1 || window.__SIGILWEAVE_BATTLE__.player.pickupBonus > 0 || window.__SIGILWEAVE_BATTLE__.player.iframesBonus > 0);
  assert.equal(hpBuffed, true, '宝箱应给人物本体增益');

  // 3) 小Boss门：走近触发，答错进入实战，实战击败后不通幕
  await page.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    const gate = s.eventPoints.find(p => p.type === 'miniboss' && !p.done);
    s.player.x = gate.x; s.player.y = gate.y + 12;
  });
  try {
    await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.phase === 'encounter', null, { timeout: 8000 });
  } catch {
    console.log('GATE_DEBUG', JSON.stringify(await page.evaluate(() => {
      const s = window.__SIGILWEAVE_BATTLE__;
      return { phase: s.phase, px: Math.round(s.player.x), py: Math.round(s.player.y), lv: s.run.progression.level,
        points: s.eventPoints.map(p => ({ id: p.id, done: p.done, type: p.type })),
        pending: s.pendingPicks ?? 0, chests: s.chests.length, errors: [] };
    })), JSON.stringify(errors));
    throw new Error('gate not triggered');
  }
  const miniId = await page.evaluate(() => window.__SIGILWEAVE_BATTLE__.run.encounters.active.id);
  assert(miniId.startsWith('miniboss-'), miniId);
  await page.screenshot({ path: 'docs/p6-小Boss门.png' });
  const wrongIdx = await page.evaluate(() => {
    const a = window.__SIGILWEAVE_BATTLE__.run.encounters.active;
    return a.choices.findIndex(c => c.id !== a.correctChoiceId);
  });
  await click(240, 156 + wrongIdx * 23);
  await click(396, 238);
  await click(369, 236);       // 准备战斗 → 进场演出
  try {
    await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.phase === 'intro', null, { timeout: 8000 });
  } catch {
    console.log('INTRO_DEBUG', JSON.stringify(await page.evaluate(() => {
      const s = window.__SIGILWEAVE_BATTLE__;
      return { phase: s.phase, boss: s.boss ? { alive: s.boss.alive, y: Math.round(s.boss.y) } : null,
        history: s.run.encounters.history.map(h => ({ id: h.encounterId, action: h.action })),
        completed: Object.keys(s.run.encounters.completed), errors: [] };
    })), JSON.stringify(errors));
    throw new Error('intro not played');
  }
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.phase === 'play', null, { timeout: 8000 });
  const miniFight = await page.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    return { bossAlive: s.boss?.alive, tier: s.boss?.definition?.tier, enemies: s.enemies.length };
  });
  assert.equal(miniFight.bossAlive, true);
  assert.equal(miniFight.tier, 'mini');
  // 实战击败：清血后由下一发命中/收敛完成处决
  await page.evaluate(() => { const s = window.__SIGILWEAVE_BATTLE__; s.boss.hp = 0; s.boss.alive = false; });
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.phase === 'play' && window.__SIGILWEAVE_BATTLE__.run.miniBossResolutions && Object.keys(window.__SIGILWEAVE_BATTLE__.run.miniBossResolutions).length === 1, null, { timeout: 8000 });
  const stillPlay = await page.evaluate(() => ({ phase: window.__SIGILWEAVE_BATTLE__.phase, mini: Object.values(window.__SIGILWEAVE_BATTLE__.run.miniBossResolutions)[0] }));
  assert.equal(stillPlay.phase, 'play', '小Boss击败不通幕');
  assert.equal(stillPlay.mini.tier, 'mini');
  assert.equal(stillPlay.mini.method, 'combat');

  // 4) 大Boss等级触发：直接把等级拉到阈值
  await page.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    const need = { 1: 5, 2: 8, 3: 11 }[s.act];
    while (s.run.progression.level < need) s.run.progression.level++;
  });
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.phase === 'encounter', null, { timeout: 8000 });
  const majorId = await page.evaluate(() => window.__SIGILWEAVE_BATTLE__.run.encounters.active.id);
  assert.equal(majorId, 'boss-1');
  // 答对：直接处决
  const idx = await page.evaluate(() => {
    const a = window.__SIGILWEAVE_BATTLE__.run.encounters.active;
    return a.choices.findIndex(c => c.id === a.correctChoiceId);
  });
  await click(240, 156 + idx * 23);
  await click(396, 238);
  const quizKilled = await page.evaluate(() => window.__SIGILWEAVE_BATTLE__.bossDefeated);
  assert.equal(quizKilled, true, '答对直接处决大Boss');
  await click(369, 236);
  await page.waitForFunction(() => !!window.__SIGILWEAVE_WORKSHOP__, null, { timeout: 15000 });
  const res = await page.evaluate(() => ({
    major: window.__SIGILWEAVE_WORKSHOP__.run.bossResolutions['1'],
    lv: window.__SIGILWEAVE_WORKSHOP__.run.progression.level,
    buffs: window.__SIGILWEAVE_WORKSHOP__.run.compassBuffs,
  }));
  assert.equal(res.major.tier, 'major');
  assert.equal(res.major.method, 'quiz');
  assert(res.buffs.damageMul > 1 || res.buffs.intervalMul < 1 || res.buffs.cooldownMul < 1 || res.buffs.hitBonus > 0 || res.buffs.comboWindowMul > 1 || res.buffs.expMul > 1, 'Boss应掉罗盘增益');
  assert.equal(errors.length, 0, errors.join('; '));
  console.log(JSON.stringify({ handAfter, res, errors }));
} finally { await browser.close(); }
