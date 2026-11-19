// 压测：真实实体堆到 150 敌 / 300 弹丸 / 200 碎片，采样 20 秒帧时间。
// 从 BattleScene 迁出（2026-11-19 架构重构收尾）。场景方法保留一行委托。
import { cardVisual } from '../data/roster.js';

export function startStress(scene) {
  if (scene.phase !== 'play') return;
  scene.stressRunning = true;
  const simulationBegin = scene.engine.now;
  scene.player.invulnUntil = Number.MAX_SAFE_INTEGER;
  const spawnWave = () => {
    if (scene.phase !== 'play') return;
    for (let i = 0; i < 25 && scene.enemies.length < 150; i++) scene.spawnEnemy({ hp: 10, speed: 30, damage: 8, maxAlive: 999 });
    while (scene.shards.length < 200) scene.spawnShard(scene.player.x - 220 + scene.combatRng.next() * 440, scene.player.y - 105 + scene.combatRng.next() * 210);
    while (scene.projectiles.length < 300) {
      const def = cardVisual({ kind: 'sigil', defId: 'arcane_bolt' });
      const o = scene.player.staffTip();
      if (!scene.fireProjectile(o.x, o.y, scene.player.x - 220 + scene.combatRng.next() * 440, scene.player.y - 105 + scene.combatRng.next() * 210, def, null)) break;
    }
  };
  for (let i = 0; i < 6; i++) spawnWave();
  const topUp = scene.time.addEvent({ delay: 250, loop: true, callback: spawnWave });
  scene.stressTopUp = topUp;
  const deltas = [];
  const begin = performance.now();
  const windowMs = Math.min(180000, Math.max(20000, Number(scene.debugParams?.get('stressMs')) || 20000));
  let last = begin;
  const tick = (t) => {
    deltas.push(t - last); last = t;
    if (t - begin < windowMs) { requestAnimationFrame(tick); return; }
    topUp.remove();
    const sorted = [...deltas].slice(2).sort((a, b) => a - b);
    const pick = (q) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] ?? 0;
    window.__STRESS__ = {
      frames: sorted.length,
      simulatedMs: +(scene.engine.now - simulationBegin).toFixed(2),
      phase: scene.phase,
      p50: +pick(0.5).toFixed(2), p95: +pick(0.95).toFixed(2), p99: +pick(0.99).toFixed(2),
      max: +(sorted[sorted.length - 1] ?? 0).toFixed(2),
      enemies: scene.enemies.length, projectiles: scene.projectiles.length, shards: scene.shards.length,
      objects: scene.children.list.length,
      pools: { projectile: scene.projectilePool.stats(), shard: scene.shardPool.stats(), expMote: scene.expMotePool.stats() },
      errors: [],
    };
  };
  requestAnimationFrame(tick);
}

