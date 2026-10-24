import { chromium } from 'playwright';
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4173';
const b = await chromium.launch({ channel: 'msedge' });
try {
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  await p.goto(BASE + '/?scene=battle&seed=icons');
  await p.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.phase === 'play');
  await p.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    // 把第一幕 6 格换成新法术，直接看字模在盘面上的可读性
    const ids = ['chain_lightning', 'pierce_lance', 'echo_sigil', 'ember_fan', 'quake_maw', 'meteor_judgment'];
    s.grid.unlockedIds().forEach((cellId, i) => { s.grid.cells[cellId].slot = { kind: 'sigil', defId: ids[i % ids.length] }; });
    s.board.drawBase();
  });
  await p.waitForTimeout(400);
  await p.screenshot({ path: 'docs/spell-icons.png', clip: { x: 1296, y: 688, width: 624, height: 368 } });
  console.log('ok');
} finally { await b.close(); }
