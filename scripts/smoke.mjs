import { chromium } from 'playwright';

const errors = [];
const logs = [];
const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); else logs.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));

await page.goto('http://127.0.0.1:5173/', { waitUntil: 'load' });
await page.waitForTimeout(1500);
await page.screenshot({ path: 'docs/p1-标题.png' });

const beforeScene = await page.evaluate(() => {
  const g = window.__SIGILWEAVE__;
  if (!g) return "no-game";
  return g.scene.getScenes(true).map((s) => s.scene.key).join(",");
});

await page.keyboard.press('Space');
await page.waitForTimeout(1200);

const afterScene = await page.evaluate(() => {
  const g = window.__SIGILWEAVE__;
  if (!g) return "no-game";
  return g.scene.getScenes(true).map((s) => s.scene.key).join(",");
});

// 让战斗跑 6 秒，观察是否有运行时异常
await page.keyboard.down('KeyD');
await page.waitForTimeout(3000);
await page.keyboard.up('KeyD');
await page.waitForTimeout(3000);

const battle = await page.evaluate(() => {
  const s = window.__SIGILWEAVE_BATTLE__;
  if (!s) return { note: 'no-battle-ref' };
  const st = s.engine ? s.engine.stats : null;
  return {
    phase: s.phase,
    simNow: s.engine ? Math.round(s.engine.now) : -1,
    triggers: st ? st.triggers : -1,
    blocked: st ? st.blocked : -1,
    combos: st ? st.combos : -1,
    dissipations: st ? st.dissipations : -1,
    alive: s.enemies ? s.enemies.filter((e) => e.alive).length : -1,
    hp: s.player ? Math.round(s.player.hp) : -1,
    shardCount: Array.isArray(s.shards) ? s.shards.length : -1,
    kills: s.kills ?? -1,
  };
});

await page.screenshot({ path: 'docs/p1-战斗.png' });
await browser.close();

console.log(JSON.stringify({ beforeScene, afterScene, battle, errors, logCount: logs.length }, null, 2));
