// 幕间工作台的同类验收：换卡导致辅助目标失效后，界面要进绑定模式而不是只弹错误码。
import { chromium } from 'playwright';
const BASE = process.env.BASE_URL ?? 'http://localhost:5180';
const browser = await chromium.launch({ channel: 'msedge' });
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.setDefaultTimeout(30000);
  await page.goto(BASE + '/?scene=battle&quick=1&seed=aux-ws');
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.phase === 'play');
  // 先答对沿途 NPC 与 Boss 前置问答，进入幕间工作台
  for (let n = 0; n < 2; n++) {
    if (n === 0) await page.evaluate(() => {
      const s = window.__SIGILWEAVE_BATTLE__;
      const p = s.eventPoints.find(ep => ep.type === 'npc' && !ep.done);
      s.player.x = p.x; s.player.y = p.y + 12;
    });
    else await page.evaluate(() => {
      const s = window.__SIGILWEAVE_BATTLE__;
      const need = { 1: 5, 2: 8, 3: 11 }[s.act];
      while (s.run.progression.level < need) s.run.progression.level++;
    });
    await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.phase === 'encounter', null, { timeout: 25000 });
    const idx = await page.evaluate(() => {
      const a = window.__SIGILWEAVE_BATTLE__.run.encounters.active;
      return a.choices.findIndex(c => c.id === a.correctChoiceId);
    });
    // 画布按 480×270 逻辑坐标渲染：1920 宽视口下 1 逻辑像素 = 4 屏幕像素
    const z = page.viewportSize().width / 480;
    await page.mouse.click(240 * z, (156 + idx * 23) * z, { delay: 60 });
    await page.mouse.click(396 * z, 238 * z, { delay: 60 });
    await page.mouse.click(369 * z, 236 * z, { delay: 60 });
  }
  await page.waitForFunction(() => window.__SIGILWEAVE_WORKSHOP__?.workshop, { timeout: 30000 });

  // 造一个「沙漏指向某格符印」的局面，再把那格换成辅助卡（= 玩家更改法术）
  const setup = await page.evaluate(() => {
    const s = window.__SIGILWEAVE_WORKSHOP__;
    const draft = s.workshop.draft;
    // 找一格装着符印、且有一个正交相邻已解封空格的位置
    const sigilCell = draft.unlocked.find(id => draft.slots[id]?.kind === 'sigil');
    const src = [1, -1, 4, -4].map(d => sigilCell + d)
      .find(id => draft.unlocked.includes(id) && !draft.slots[id]);
    if (sigilCell === undefined || src === undefined) return { ok: false };
    draft.slots[src] = { kind: 'auxiliary', defId: 'hourglass' };
    draft.auxTargets = { ...(draft.auxTargets ?? {}), [src]: sigilCell };
    s.workshop.hand['auxiliary:resonance_stone'] = 2;
    s.selectedCard = 'auxiliary:resonance_stone';
    s.paint();
    return { ok: true, src, sigilCell };
  });
  if (!setup.ok) { console.log(JSON.stringify({ skipped: '找不到合适的格子', errors })); process.exit(0); }

  // 真实路径：把沙漏指向的符印格换成辅助卡
  const after = await page.evaluate((cellId) => {
    const s = window.__SIGILWEAVE_WORKSHOP__;
    s.clickCell(cellId);
    return { note: s.note, pending: s.auxPending, targets: { ...s.workshop.draft.auxTargets } };
  }, setup.sigilCell);
  await page.screenshot({ path: 'docs/编辑校验/3-幕间-目标失效也进绑定.png' });

  // 出发按钮不该再吐内部错误码
  const depart = await page.evaluate(() => {
    const s = window.__SIGILWEAVE_WORKSHOP__;
    s.clickCell(s.auxPending);   // 先退出绑定模式（再点自己=取消）
    const msg = s.note;
    s.depart();
    return { cancelNote: msg, departNote: s.note, departed: s.departed };
  });
  console.log(JSON.stringify({ setup, after, depart, errors }, null, 1));
} finally { await browser.close(); }