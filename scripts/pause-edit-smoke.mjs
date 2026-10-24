// 暂停改阵冒烟：Esc暂停 → E编辑 → 手牌放置 → 完成 → 格位变更且冷却保留。
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5173';
const browser = await chromium.launch({ channel: 'msedge' });
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE + '/?scene=battle&seed=pause-edit');
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.phase === 'play');
  const click = (x, y) => page.mouse.click(x * 2, y * 2, { delay: 60 });

  // 让玩家获得一张手牌（模拟升级三选一的第一张）
  await page.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    s.run.hand['sigil:starfall'] = (s.run.hand['sigil:starfall'] ?? 0) + 1;
  });

  // Esc 暂停 → E 编辑
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.menuOpen === true);
  const before = await page.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    s.grid.cells.forEach((c, i) => { c.cooldownUntil = s.engine.now + 10000 + i * 100; });
    return { now: s.engine.now, cooldowns: s.grid.cells.map(c => c.cooldownUntil) };
  });
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.editOpen === true);
  await page.screenshot({ path: 'docs/p6-暂停编辑.png' });

  // 点手牌选中（星陨卡在手牌列表第一行 398,52+10）
  await click(434, 62);
  const sel = await page.evaluate(() => window.__SIGILWEAVE_BATTLE__.editSelected);
  assert.equal(sel, 'sigil:starfall', '手牌卡应被选中');
  // 点 7 号空格（画布 40+3*92=316..400, 34+46=80..118 → 中心 358,99）
  await click(358, 99);
  const placed = await page.evaluate(() => window.__SIGILWEAVE_BATTLE__.editDraft.slots?.[7]);
  assert.equal(placed.defId, 'starfall', '星陨应放入7号');
  await page.screenshot({ path: 'docs/p6-暂停编辑放置.png' });
  // 完成
  await click(434, 243);
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.editOpen === false, null, { timeout: 5000 });
  const applied = await page.evaluate(() => window.__SIGILWEAVE_BATTLE__.grid.cells[7].slot);
  assert.equal(applied.defId, 'starfall', '法阵7号应实时变为星陨');

  // 冷却保留：读当前冷却，编辑后再确认未被清零（选一个在冷却中的时刻很难，改为验证改阵前后冷却字段一致）
  const firstState = await page.evaluate(() => ({ now: window.__SIGILWEAVE_BATTLE__.engine.now, cooldowns: window.__SIGILWEAVE_BATTLE__.grid.cells.map(c => c.cooldownUntil) }));
  assert.deepEqual(firstState, before, '改阵不能推进时钟或重置非零冷却');
  // Done 后 closeGridEdit 会调 openPause('menu')，菜单已开，直接再进编辑
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.menuOpen === true, null, { timeout: 5000 });
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.editOpen === true);
  await click(154, 99); // 5号格收回
  await page.waitForTimeout(200);
  await click(434, 243);
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.editOpen === false, null, { timeout: 5000 });
  const after2 = await page.evaluate(() => ({
    now: window.__SIGILWEAVE_BATTLE__.engine.now,
    cooldowns: window.__SIGILWEAVE_BATTLE__.grid.cells.map(c => c.cooldownUntil),
    slot5: window.__SIGILWEAVE_BATTLE__.grid.cells[5].slot,
    slot7: window.__SIGILWEAVE_BATTLE__.grid.cells[7].slot,
    handArcane: window.__SIGILWEAVE_BATTLE__.run.hand['sigil:arcane_bolt'] ?? 0,
  }));
  assert.equal(after2.slot5, null, '5号应被收回');
  assert.equal(after2.handArcane, 1, '奥术飞弹应回手牌');
  assert.equal(after2.slot7.defId, 'starfall', '7号星陨仍在法阵');
  assert.deepEqual({ now: after2.now, cooldowns: after2.cooldowns }, before, '收回也不能洗掉格冷却');
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.editOpen);
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => window.__SIGILWEAVE_BATTLE__.editOpen), false);
  assert.equal(await page.evaluate(() => window.__SIGILWEAVE_BATTLE__.paused), true, '退出编辑仍保持菜单暂停');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !window.__SIGILWEAVE_BATTLE__?.paused);
  assert.equal(errors.length, 0, errors.join('; '));
  console.log(JSON.stringify({ applied, after2, errors }));
} finally { await browser.close(); }
