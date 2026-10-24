// P4 压测：150 敌 + 300 弹丸 + 200 碎片，20 秒帧时间采样；外加 5 次重开生命周期检查。
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5173';
const browser = await chromium.launch({ channel: 'msedge' });
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const long = process.env.LONG === '1';
  const windowMs = long ? 120000 : 20000;
  await page.goto(BASE + '/?scene=battle&stress=1&stressMs=' + windowMs + '&seed=stress');
  await page.waitForFunction(() => window.__STRESS__, null, { timeout: windowMs + 120000 });
  const stress = await page.evaluate(() => ({ ...window.__STRESS__ }));
  console.log('STRESS', JSON.stringify(stress));
  await page.screenshot({ path: 'docs/p4-压测.png' });
  assert.equal(errors.length, 0, errors.join('; '));
  assert.equal(stress.frames > (long ? 3000 : 600), true, 'should sample enough frames');
  assert(stress.max < 250, 'no freeze over 250ms, max=' + stress.max);
  assert.equal(stress.phase, 'play', '不得采到升级或问答暂停状态');
  assert(stress.simulatedMs >= windowMs * 0.9, '模拟时钟须持续推进，不能用暂停空帧冒充负载');
  assert(stress.enemies >= 100 && stress.projectiles >= 100 && stress.shards >= 100, '采样结束必须仍有高负载实体');
  // 池化：不得超出容量，压测期间应有复用；饱和允许出现但需记录
  assert(stress.pools.projectile.created <= 300, 'projectile pool cap');
  assert(stress.pools.shard.created <= 200, 'shard pool cap');
  assert(stress.pools.projectile.reused + stress.pools.shard.reused > 0, 'pools should reuse objects');
  console.log('POOLS', JSON.stringify(stress.pools));
  // 生命周期：连续重开 5 次，实体与显示对象回到基线附近
  const runs = [];
  for (let i = 0; i < 5; i++) {
    // 记录旧实例，等新实例真正建成后再采样，避免读到重启前的旧场景
    await page.evaluate(() => { window.__OLD_BOOT__ = window.__SIGILWEAVE_BATTLE__.bootCount; window.__SIGILWEAVE_BATTLE__.scene.restart(); });
    try {
      await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.bootCount > window.__OLD_BOOT__ && window.__SIGILWEAVE_BATTLE__.phase === 'play', null, { timeout: 15000 });
    } catch (e) {
      console.log('RESTART_DEBUG', JSON.stringify(await page.evaluate(() => ({
        hasBattle: !!window.__SIGILWEAVE_BATTLE__,
        boot: window.__SIGILWEAVE_BATTLE__?.bootCount, oldBoot: window.__OLD_BOOT__,
        phase: window.__SIGILWEAVE_BATTLE__?.phase,
        active: window.__SIGILWEAVE__.scene.getScenes(true).map(s => s.scene.key),
      }))), JSON.stringify(errors));
      throw e;
    }
    runs.push(await page.evaluate(() => {
      const s = window.__SIGILWEAVE_BATTLE__;
      return { enemies: s.enemies.length, projectiles: s.projectiles.length, shards: s.shards.length, objects: s.children.list.length };
    }));
  }
  // 允许每条脉流自然产生 1 枚在途弹丸
  assert(runs.every(r => r.enemies <= 2 && r.projectiles <= 3 && r.shards <= 2), JSON.stringify(runs));
  assert.equal(errors.length, 0, errors.join('; '));
  console.log(JSON.stringify({ stress, lifecycle: runs, errors }));
  console.log('NOTE 软件渲染的 headless Edge，绝对值偏悲观；用于比较与防冻结，不代表真机上限。');
} finally { await browser.close(); }
