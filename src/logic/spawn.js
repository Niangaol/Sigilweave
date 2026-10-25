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
    // 兜底点没有参与过间距采样，按「未知间距」处理（旧版这里引用了循环外的 gap，会抛异常）
    gap: Infinity,
  };
}

// ---------- 一波多点：同一次刷怪塞 2~4 只 ----------
// 同屏上限抬上去之后，逐只慢刷还是会显得稀；每波抽 count 个点时
// 先把已抽到的点当成「已有点」喂给 pickSpawnPoint，保证同波点之间也满足 minGap。
// 单波上限 8 是防御值：wave 曲线最多 3，给外部误传留一点余量又不至于一帧抽几十个点。
export const MAX_WAVE_POINTS = 8;

export function pickWavePoints({
  rng, player, world, enemies = [], count = 1,
  minDist, maxDist, minGap, attempts, nearDist, farDist, edge,
} = {}) {
  // 非法 count（NaN / 字符串 / Infinity）一律当 1；0 与负数表示本波不刷
  const asked = Number.isFinite(count) ? Math.floor(count) : 1;
  if (asked <= 0) return [];
  const total = Math.min(asked, MAX_WAVE_POINTS);
  // 已有敌人只借坐标用，不改动原对象；非法条目直接丢掉，避免把 NaN 带进间距计算
  const taken = Array.isArray(enemies)
    ? enemies
      .filter((e) => e && Number.isFinite(e.x) && Number.isFinite(e.y))
      .map((e) => ({ x: e.x, y: e.y }))
    : [];
  const points = [];
  for (let i = 0; i < total; i++) {
    // 其余参数原样透传，缺省值由 pickSpawnPoint 自己兜；rng 的调用顺序因此完全可复现
    const point = pickSpawnPoint({
      rng, player, world, enemies: taken,
      minDist, maxDist, minGap, attempts, nearDist, farDist, edge,
    });
    points.push(point);
    taken.push({ x: point.x, y: point.y });
  }
  return points;
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

// ---------- 大规模拥挤分离：空间哈希分桶 ----------
// 同屏上限 78+（第三幕约 101）时，O(n²) 每帧要做约 5000 次配对，手机上不划算。
// 桶边长取 gap：任意一对欧氏距离 < gap 的杂兵，|dx|、|dy| 都必然 < gap，
// 所以一定落在同桶或相邻桶里（3×3 邻域是欧氏邻域的严格超集），不会漏配。
// 小规模（<= 48）仍然直通 O(n²) 原实现，结果与旧版逐字节一致。
export const SEPARATE_BRUTE_LIMIT = 48;

// 邻域顺序固定，配合后面的下标升序排序，保证同一输入的结果完全可复现
const BUCKET_NEIGHBORS = [
  [0, 0], [-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1],
];

const bucketKey = (bx, by) => `${bx},${by}`;

export function separateEnemiesBucketed(list, { gap = 22, player = null, contactDist = 30 } = {}) {
  if (!Array.isArray(list)) return 0;
  const total = list.length;
  if (total <= 1) return 0;
  if (total <= SEPARATE_BRUTE_LIMIT) return separateEnemies(list, { gap, player, contactDist });

  const cell = gap > 0 ? gap : 22;            // 桶边长 = gap（gap 非法时退回默认值，避免除零）
  const buckets = new Map();                  // 桶 key -> 下标数组
  const home = new Array(total).fill(null);   // 每个元素当前所在的桶 key

  const drop = (i) => {
    const key = home[i];
    if (key === null) return;
    const arr = buckets.get(key);
    if (arr) {
      const at = arr.indexOf(i);
      if (at >= 0) arr.splice(at, 1);
      if (arr.length === 0) buckets.delete(key);
    }
    home[i] = null;
  };
  const place = (i) => {
    home[i] = null;
    const e = list[i];
    // 死怪 / Boss / 非有限坐标一律不进桶：它们不参与推挤，也不会污染桶坐标
    if (!e || !e.alive || e.isBoss) return;
    if (!Number.isFinite(e.x) || !Number.isFinite(e.y)) return;
    const key = bucketKey(Math.floor(e.x / cell), Math.floor(e.y / cell));
    home[i] = key;
    const arr = buckets.get(key);
    if (arr) arr.push(i); else buckets.set(key, [i]);
  };
  const relocate = (i) => { drop(i); place(i); };

  for (let i = 0; i < total; i++) place(i);

  let pushes = 0;
  for (let i = 0; i < total; i++) {
    const a = list[i];
    if (!a || !a.alive || a.isBoss) continue;
    if (!Number.isFinite(a.x) || !Number.isFinite(a.y)) continue;

    // 候选只取 a 所在桶 + 相邻 8 桶里「下标更大」的杂兵，再按下标升序结算，
    // 这样配对顺序与 O(n²) 版一致，推挤方向与次数也一致。
    const candidates = [];
    const bx = Math.floor(a.x / cell);
    const by = Math.floor(a.y / cell);
    for (const [ox, oy] of BUCKET_NEIGHBORS) {
      const arr = buckets.get(bucketKey(bx + ox, by + oy));
      if (!arr) continue;
      for (const j of arr) if (j > i) candidates.push(j);
    }
    candidates.sort((p, q) => p - q);

    for (const j of candidates) {
      const b = list[j];
      if (!b || !b.alive || b.isBoss) continue;
      if (!Number.isFinite(b.x) || !Number.isFinite(b.y)) continue;
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
        // 完全重合：按 id 给一个确定方向（与 O(n²) 版同一条公式），保证可复现
        const ang = ((a.id ?? 0) * 2.399) % (Math.PI * 2);
        ux = Math.cos(ang); uy = Math.sin(ang); push = gap / 2;
      } else {
        ux = dx / d; uy = dy / d; push = (gap - d) / 2;
      }
      a.x -= ux * push; a.y -= uy * push;
      b.x += ux * push; b.y += uy * push;
      pushes++;
      // 坐标变了就要换桶，否则后续配对会拿到过期位置
      relocate(i);
      relocate(j);
    }
  }
  return pushes;
}
