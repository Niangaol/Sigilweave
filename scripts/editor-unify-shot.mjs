// 两处法阵编辑器统一后的对比截图：战斗内 E 编辑 / 幕间构筑台。
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5173';
const OUT = process.env.OUT_DIR ?? 'docs/editor-unify';
await mkdir(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ channel: 'msedge' });
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(BASE + '/?scene=battle&seed=editor-unify');
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.phase === 'play');
  await sleep(1200);

  // 给一张手牌，方便拍「选牌 → 放位」的引导态
  await page.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    s.run.hand['sigil:starfall'] = (s.run.hand['sigil:starfall'] ?? 0) + 1;
  });

  // 1) 战斗内暂停改阵
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.menuOpen === true);
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.editOpen === true);
  await sleep(300);
  await page.screenshot({ path: OUT + '/1-战斗内编辑.png' });

  // 选中一张手牌：步骤条走到「放位」，空格位亮起可放置
  const selected = await page.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    const key = Object.keys(s.editHand).find(k => (s.editHand[k] ?? 0) > 0);
    if (key) {
      const name = s.editNames()[key.split(':')[1]]?.name ?? key;
      s.editSelected = key;
      s.editNote = '已选 ' + name + '：点左侧空符位放置';
      s.editFocus = 5;
      s.drawGridEdit();
    }
    return key;
  });
  await sleep(250);
  await page.screenshot({ path: OUT + '/2-战斗内-选牌引导.png' });

  // 2) 幕间构筑台：直接从当前 run 起场景，避免跑完整通幕流程
  await page.evaluate(() => {
    const b = window.__SIGILWEAVE_BATTLE__;
    const run = structuredClone(b.run);
    if (b.menuOpen) b.menuOpen = false;
    window.__SIGILWEAVE__.scene.start('IntermissionScene', { run, report: { triggers: 12, blocked: 1, kills: 26 }, __cine: false });
  });
  await page.waitForFunction(() => !!window.__SIGILWEAVE_WORKSHOP__?.workshop, null, { timeout: 15000 });
  await sleep(500);
  await page.screenshot({ path: OUT + '/3-幕间构筑台.png' });

  const selected2 = await page.evaluate(() => {
    const s = window.__SIGILWEAVE_WORKSHOP__;
    s.workshop.hand['sigil:starfall'] = (s.workshop.hand['sigil:starfall'] ?? 0) + 1;
    const key = Object.keys(s.workshop.hand).find(k => (s.workshop.hand[k] ?? 0) > 0);
    if (key) {
      const name = key === 'sigil:starfall' ? '星陨' : key.split(':')[1];
      s.selectedCard = key;
      s.note = '已选 ' + name + '：点左侧空符位放置';
      s.paint();
    }
    return key;
  });
  await sleep(250);
  await page.screenshot({ path: OUT + '/4-幕间-选牌引导.png' });

  console.log(JSON.stringify({ selected, selected2, errors }));
} finally { await browser.close(); }
