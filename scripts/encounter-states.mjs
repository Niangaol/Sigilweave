// 问答面板按钮状态回归：禁用态/悬停手型/按下反馈/完整作答链路。
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4173';
const S = 4; // 1920×1080 -> 渲染倍率 4
const browser = await chromium.launch({ channel: 'msedge' });
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const cursor = () => page.evaluate(() => document.querySelector('canvas')?.style.cursor ?? '');
  const click = (lx, ly) => page.mouse.click(lx * S, ly * S, { delay: 40 });
  const move = (lx, ly) => page.mouse.move(lx * S, ly * S);
  const done = {};

  await page.goto(BASE + '/?scene=battle&quick=1&seed=enc-states');
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.phase === 'play', null, { timeout: 30000 });
  await page.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    const pt = s.eventPoints.find(x => x.type === 'npc' && !x.done);
    s.player.x = pt.x; s.player.y = pt.y + 12;
  });
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.phase === 'encounter', null, { timeout: 25000 });
  await page.waitForTimeout(400);

  // 1) 未选答案时确认是禁用态：悬停显示 not-allowed，点击不推进
  await move(396, 238);
  await page.waitForTimeout(120);
  assert.equal(await cursor(), 'not-allowed', '未选答案时确认按钮应为禁用光标');
  await click(396, 238);
  await page.waitForTimeout(250);
  const before = await page.evaluate(() => ({
    sel: window.__SIGILWEAVE_BATTLE__.run.encounters.active.selectedChoiceId,
    phase: window.__SIGILWEAVE_BATTLE__.run.encounters.active.phase,
  }));
  assert.equal(before.sel, null, '禁用态确认不应误选');
  assert.equal(before.phase, 'question', '禁用态确认不应推进');
  done.disabledConfirm = 'not-allowed + no-op';

  // 2) 悬停选项：指针变手型，且悬停高亮层真的可见（防 setVisible(false) 这类静默失效）
  await move(240, 156 + 10);
  await page.waitForTimeout(120);
  assert.equal(await cursor(), 'pointer', '选项悬停应为手型');
  const hoverVisible = await page.evaluate(() => {
    const h = window.__SIGILWEAVE_BATTLE__.encounterPanel.hoverG;
    return { visible: h.visible, alpha: h.alpha, default: h.defaultEmptyCheck ?? null };
  });
  assert.equal(hoverVisible.visible, true, '悬停高亮层必须可见');
  done.hoverChoice = 'pointer + overlay visible';

  // 3) 点选答案后确认变可用
  const idx = await page.evaluate(() => {
    const a = window.__SIGILWEAVE_BATTLE__.run.encounters.active;
    return a.choices.findIndex(c => c.id === a.correctChoiceId);
  });
  await click(240, 156 + idx * 23 + 10);
  await page.waitForTimeout(250);
  await move(396, 238);
  await page.waitForTimeout(120);
  assert.equal(await cursor(), 'pointer', '选中后确认应为手型');

  // 4) 确认进入结果页，继续按钮可用并推进
  await click(396, 238);
  await page.waitForTimeout(250);
  const resultPhase = await page.evaluate(() => window.__SIGILWEAVE_BATTLE__.run.encounters.active.phase);
  assert.equal(resultPhase, 'result', '确认后应进入结果页');
  await move(369, 236);
  await page.waitForTimeout(120);
  assert.equal(await cursor(), 'pointer', '继续按钮应为手型');
  await click(369, 236);
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.phase === 'play', null, { timeout: 8000 });
  done.confirmFlow = 'result -> play';

  assert.equal(errors.length, 0, errors.join('; '));
  console.log('ENCOUNTER_STATES_OK', JSON.stringify({ done, errors }));
} finally { await browser.close(); }
