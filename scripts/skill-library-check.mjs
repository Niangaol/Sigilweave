// 真机回归：技能库只来自升级三选一玩家所选的卡。
// 用法：BASE_URL=http://127.0.0.1:5173 node scripts/skill-library-check.mjs
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const base = process.env.BASE_URL || 'http://127.0.0.1:5173';
const url = base + '/?scene=battle&seed=skillcheck&guide=0';
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
const checks = [];

try {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  page.on('pageerror', e => console.log('PAGEERROR', e.message));
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.phase === 'play', null, { timeout: 15000 });

  // 1. 开局技能库为空，不预置任何固定技能
  let lib = await page.evaluate(() => window.__SIGILWEAVE_BATTLE__.run.skillLibrary ?? []);
  assert.equal(lib.length, 0, '开局技能库应为空');
  checks.push('开局无预置技能');

  // 2. 三选一选哪张，哪张就成为技能
  await page.evaluate(() => window.__SIGILWEAVE_BATTLE__.queueLevelPicks(1));
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.phase === 'levelup', null, { timeout: 5000 });
  const picked = await page.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    // 辅助卡没有主动法术、不进技能库（设计如此），所以挑一张符印卡来验证「选啥得啥」
    const cards = s.levelupRects.map(r => r.card);
    const card = cards.find(c => c.kind === 'sigil') ?? cards[0];
    s.pickLevelupCard(card);
    return card;
  });
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.phase === 'play', null, { timeout: 5000 });
  lib = await page.evaluate(() => window.__SIGILWEAVE_BATTLE__.run.skillLibrary);
  assert.equal(lib.length, 1, '选一张卡后技能库应有 1 格');
  assert.equal(lib[0].defId, picked.defId, '技能应来自所选卡 ' + picked.defId);
  checks.push('三选一所选卡成为技能：' + picked.defId);

  // 3. 防御卡成为 ward 护盾技能
  await page.evaluate(() => window.__SIGILWEAVE_BATTLE__.queueLevelPicks(1));
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.phase === 'levelup', null, { timeout: 5000 });
  await page.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    s.pickLevelupCard({ kind: 'sigil', defId: 'holy_ward' });
  });
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.phase === 'play', null, { timeout: 5000 });
  const ward = await page.evaluate(() => window.__SIGILWEAVE_BATTLE__.run.skillLibrary.find(s => s.defId === 'holy_ward'));
  assert.ok(ward, '护盾卡应进入技能库');
  assert.equal(ward.kind, 'ward', '护盾卡技能类型应为 ward');
  checks.push('防御卡成为 ward 护盾技能');

  // 4. 换场后技能库清零，只留本场选到的技能
  await page.evaluate(() => window.__SIGILWEAVE_BATTLE__.swapStage(2));
  await page.waitForTimeout(200);
  lib = await page.evaluate(() => window.__SIGILWEAVE_BATTLE__.run.skillLibrary);
  assert.equal(lib.length, 0, '换场后技能库应清零');
  checks.push('换场后技能库清零');

  console.log('技能库真机验证通过：' + checks.length + '/' + checks.length);
  checks.forEach((c, i) => console.log('  ' + (i + 1) + '. ' + c));
} finally {
  await browser.close();
}
