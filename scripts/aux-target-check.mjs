// 验收「编辑界面改法术报 aux needs target」的修复：全程真实鼠标点击。
// 复现路径：5 号放时之沙漏 → 指向 6 号符印 → 把 6 号换成辅助卡（目标被连清）→ 点完成。
import { chromium } from 'playwright';
const BASE = process.env.BASE_URL ?? 'http://localhost:5180';
const browser = await chromium.launch({ channel: 'msedge' });
const log = {};
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.setDefaultTimeout(20000);
  await page.goto(BASE + '/?scene=battle&seed=aux-check');
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.phase === 'play');
  await page.evaluate(() => { window.__SIGILWEAVE_BATTLE__.player.invulnUntil = Number.MAX_SAFE_INTEGER; });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(220);
  await page.keyboard.press('e');
  await page.waitForTimeout(220);

  const state = () => page.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    return {
      editOpen: s.editOpen, note: s.editNote, pending: s.editAuxPending,
      targets: { ...(s.editDraft.auxTargets ?? {}) },
      editNoteRaw: s.editNote,
    };
  });
  const clickLogical = async (lx, ly) => {
    const scale = await page.evaluate(() => window.__SIGILWEAVE__.scale.width / 480);
    await page.mouse.click(lx * scale + 2, ly * scale + 2);
    await page.waitForTimeout(130);
  };
  const rectOf = (pred) => page.evaluate((p) => {
    const s = window.__SIGILWEAVE_BATTLE__;
    const r = s.editRects.find(eval(p));
    return r ? { x: r.x, y: r.y, w: r.w, h: r.h, done: !!r.done } : null;
  }, pred);
  const cell = (id) => ({ x: 14 + (id % 4) * 54, y: 56 + Math.floor(id / 4) * 29 });
  const handY = new Map();

  // 准备：5/6 号解封，6 号装符印，手牌备齐
  await page.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    for (const id of [5, 6]) if (!s.editDraft.unlocked.includes(id)) s.editDraft.unlocked.push(id);
    s.editDraft.slots[6] = { kind: 'sigil', defId: 'arcane_bolt' };
    delete s.editDraft.slots[5];
    if (s.editDraft.auxTargets) delete s.editDraft.auxTargets[5];
    s.editHand = { 'auxiliary:hourglass': 1, 'auxiliary:resonance_stone': 1, 'sigil:arcane_bolt': 2 };
    s.editSelected = null;
    s.drawGridEdit();
  });
  // 手牌只留一张，避免顺序变化点错卡
  const onlyCard = async (key) => {
    await page.evaluate((k) => {
      const s = window.__SIGILWEAVE_BATTLE__;
      s.editHand = { [k]: 3 };
      s.editSelected = null;
      s.drawGridEdit();
    }, key);
    const rows = await page.evaluate(() => {
      const s = window.__SIGILWEAVE_BATTLE__;
      return s.editRects.filter(r => r.x === 244 && r.w === 216 && r.h === 15).map(r => r.y);
    });
    await clickLogical(352, rows[0] + 7);
  };

  // 1) 选沙漏 → 放 5 号
  await onlyCard('auxiliary:hourglass');
  await clickLogical(cell(5).x + 10, cell(5).y + 10);
  log.step1 = await state();

  // 2) 点 6 号绑定
  await clickLogical(cell(6).x + 10, cell(6).y + 10);
  log.step2 = await state();

  // 3) 把 6 号换成共鸣石（触发目标失效）
  await onlyCard('auxiliary:resonance_stone');
  await clickLogical(cell(6).x + 10, cell(6).y + 10);
  log.step3 = await state();
  await page.screenshot({ path: 'docs/编辑校验/1-目标失效-自动进入绑定.png' });

  // 4) 点完成：不应该再出现内部错误码，也不应该静默退出
  const done = await rectOf('(e) => e.done === true');
  await clickLogical(done.x + 20, done.y + 8);
  log.step4 = await state();

  // 5) 把符印放回 6 号 → 应自动进入绑定模式
  await onlyCard('sigil:arcane_bolt');
  await clickLogical(cell(6).x + 10, cell(6).y + 10);
  log.step5 = await state();
  await page.screenshot({ path: 'docs/编辑校验/2-待绑定-高亮当前格.png' });

  // 6) 点 6 号重新绑上
  await clickLogical(cell(6).x + 10, cell(6).y + 10);
  log.step6 = await state();

  // 7) 点完成：这次应该真的关掉编辑回到暂停菜单
  await clickLogical(done.x + 20, done.y + 8);
  log.step7 = await state();

  log.errors = errors;
  console.log(JSON.stringify(log, null, 1));
} finally { await browser.close(); }