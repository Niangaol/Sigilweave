// 刷怪落点与拥挤控制（纯逻辑，可单测）。
// 目标：同屏数量可以多一点，但落点必须散开，不能让怪堆成一坨。

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// 以玩家为中心的环上取点：带最小间距与边界钳制，永不返回界外/贴脸的点。
// rng 只被按固定顺序调用，保证同一 seed 的落点序列可复现。
export function pickSpawnPoint({
  rng, player, world, enemies = [],
  minDist = 230, maxDist = 430, minGap = 36, attempts = 14,
  nearDist = 140, farDist = 560, edge = 28,
}) {
  const bounds = { left: edge, top: edge + 20, right: world.w - edge, bottom: world.h - edge };
  let fallback = null;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const angle = rng() * Math.PI * 2;
    const dist = minDist + rng() * (maxDist - minDist);
    const x = clamp(player.x + Math.cos(angle) * dist, bounds.left, bounds.right);
    const y = clamp(player.y + Math.sin(angle) * dist, bounds.top, bounds.bottom);
    const dp = Math.hypot(x - player.x, y - player.y);
    if (dp < nearDist || dp > farDist) continue;
    let gap = Infinity;
    for (const e of enemies) {
      const d = Math.hypot(e.x - x, e.y - y);
      if (d < gap) gap = d;
    }
    const point = { x, y, gap };
    if (gap >= minGap) return point;
    // 全都不够散时，退而求其次选「离最近的怪最远」的那个候选点
    if (!fallback || gap > fallback.gap) fallback = point;
  }
  if (fallback) return fallback;
  // 极端情况（世界比环还小）：朝地图中心方向落一个点，仍受边界钳制
  const cx = world.w / 2 - player.x, cy = world.h / 2 - player.y;
  const len = Math.hypot(cx, cy) || 1;
  return {
    x: clamp(player.x + (cx / len) * 280, bounds.left, bounds.right),
    y: clamp(player.y + (cy / len) * 280, bounds.top, bounds.bottom),
    gap,
  };
}

// 轻量分离：把互相挤在一起的杂兵各推开一半，避免长期叠成一坨。
// - 不动 Boss（Boss 有自己的站位逻辑）
// - 玩家身边即将接触的一对不推开（接触碎灭由战斗层处理，推开会让人打不到）
// - 完全重合时按 id 顺序给一个确定方向，保证可复现
export function separateEnemies(list, { gap = 22, player = null, contactDist = 30 } = {}) {
  let pushes = 0;
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (!a?.alive || a.isBoss) continue;
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j];
      if (!b?.alive || b.isBoss) continue;
      if (player) {
        const da = Math.hypot(a.x - player.x, a.y - player.y);
        const db = Math.hypot(b.x - player.x, b.y - player.y);
        if (da < contactDist && db < contactDist) continue;
      }
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      if (d >= gap) continue;
      let ux, uy, push;
      if (d === 0) {
        const ang = ((a.id ?? 0) * 2.399) % (Math.PI * 2);
        ux = Math.cos(ang); uy = Math.sin(ang); push = gap / 2;
      } else {
        ux = dx / d; uy = dy / d; push = (gap - d) / 2;
      }
      a.x -= ux * push; a.y -= uy * push;
      b.x += ux * push; b.y += uy * push;
      pushes++;
    }
  }
  return pushes;
}
