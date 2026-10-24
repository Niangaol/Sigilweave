import { chromium } from 'playwright';
const b = await chromium.launch({ channel: 'msedge' });
try {
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  await p.goto('http://127.0.0.1:4173/?scene=battle&quick=1&seed=live-check2');
  await p.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.phase === 'play', null, { timeout: 30000 });
  await p.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    const pt = s.eventPoints.find(x => x.type === 'npc' && !x.done);
    s.player.x = pt.x; s.player.y = pt.y + 12;
  });
  await p.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.phase === 'encounter', null, { timeout: 25000 });
  await p.waitForTimeout(300);
  await p.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    window.__HITS__ = [];
    const orig = s.encounterPanel.hitTest.bind(s.encounterPanel);
    s.encounterPanel.hitTest = (x, y) => {
      const a = orig(x, y);
      window.__HITS__.push({ x: +x.toFixed(1), y: +y.toFixed(1), hitKind: a ? 'yes' : 'no' });
      return a;
    };
  });
  const idx = await p.evaluate(() => {
    const a = window.__SIGILWEAVE_BATTLE__.run.encounters.active;
    return a.choices.findIndex(c => c.id === a.correctChoiceId);
  });
  await p.mouse.click(240 * 4, (146 + idx * 23 + 10) * 4, { delay: 50 });
  await p.waitForTimeout(250);
  const st1 = await p.evaluate(() => {
    const a = window.__SIGILWEAVE_BATTLE__.run.encounters.active;
    return { phase: a.phase, sel: a.selectedChoiceId };
  });
  await p.mouse.click(396 * 4, 238 * 4, { delay: 50 });
  await p.waitForTimeout(250);
  const st2 = await p.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    return {
      phase: s.run.encounters.active?.phase,
      note: s.encounterPanel.current?.note ?? null,
      hits: window.__HITS__,
      rects: s.encounterPanel.rects.map(r => ({ kind: r.kind, x: r.x, y: r.y, w: r.w, h: r.h })),
    };
  });
  console.log(JSON.stringify({ idx, st1, st2 }));
} finally { await b.close(); }

