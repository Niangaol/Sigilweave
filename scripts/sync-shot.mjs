// 画风同步前后对比截图：一次抓齐 标题/战斗/罗盘/幕间/结算 五个场景。
// 用法：node scripts/sync-shot.mjs <输出目录>   （BASE_URL 默认 http://localhost:5180）
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const OUT = process.argv[2] ?? 'docs/素材加工/同步/out';
const BASE = process.env.BASE_URL ?? 'http://localhost:5180';
await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge' });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.on('pageerror', (e) => errors.push(e.message));

  // 1) 标题
  await page.goto(BASE + '/');
  await page.waitForFunction(() => window.__SIGILWEAVE__?.scene.isActive('TitleScene'));
  await page.waitForTimeout(700);
  await page.screenshot({ path: OUT + '/1-标题.png' });

  // 2) 战斗（中后期敌人分布 + 特效）
  await page.goto(BASE + '/?scene=battle&seed=sync-shot');
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.phase === 'play');
  await page.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    s.player.invulnUntil = Number.MAX_SAFE_INTEGER;
    s.engine.now = 150000;
    for (let i = 0; i < 22; i++) s.spawnEnemy({ hp: 30, speed: 12, damage: 6, maxAlive: 999 });
  });
  await page.waitForTimeout(2600);
  if (await page.evaluate(() => window.__SIGILWEAVE_BATTLE__?.phase === 'levelup')) {
    await page.keyboard.press('Digit1');
  }
  await page.waitForTimeout(2200);
  await page.screenshot({ path: OUT + '/2-战斗.png' });

  // 3) 罗盘盘面特写（逻辑坐标 326..478 / 174..262，4 倍后 1304..1912 / 696..1048）
  await page.screenshot({ path: OUT + '/3-罗盘.png', clip: { x: 1296, y: 688, width: 624, height: 368 } });

  // 4) 幕间工作台（走一次大 Boss 问答流程）
  await page.evaluate(() => { window.__SIGILWEAVE_BATTLE__.run.progression.level = 5; });
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.phase === 'encounter', null, { timeout: 15000 });
  const idx = await page.evaluate(() => {
    const a = window.__SIGILWEAVE_BATTLE__.run.encounters.active;
    return a.choices.findIndex((c) => c.id === a.correctChoiceId);
  });
  await page.evaluate((i) => {
    const s = window.__SIGILWEAVE_BATTLE__;
    s.selectEncounterAnswer(s.run.encounters.active.choices[i].id);
  }, idx);
  await page.waitForTimeout(300);
  await page.evaluate(() => window.__SIGILWEAVE_BATTLE__.confirmEncounterAnswer());
  await page.waitForTimeout(500);
  await page.evaluate(() => window.__SIGILWEAVE_BATTLE__.continueEncounter());
  await page.waitForFunction(() => !!window.__SIGILWEAVE_WORKSHOP__, null, { timeout: 20000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: OUT + '/4-幕间工作台.png' });

  // 5) 结算页
  await page.goto(BASE + '/?scene=gameover');
  await page.waitForFunction(() => window.__SIGILWEAVE__?.scene.isActive('GameOverScene'));
  await page.waitForTimeout(700);
  await page.screenshot({ path: OUT + '/5-结算.png' });

  console.log('SHOTS_DONE errors=' + JSON.stringify(errors));
} finally {
  await browser.close();
}
