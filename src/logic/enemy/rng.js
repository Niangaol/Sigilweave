// 确定性伪随机（mulberry32）：状态只是一个整数，便于序列化/回放。
// 从 logic/enemy-ai.js 拆出（2026-11-19 架构重构波 4）。

export function seedText(seed) {
  if (typeof seed === 'string') return seed;
  try { return String(seed); } catch { return '0'; }
}

export function hashSeed(seed) {
  let h = 2166136261 >>> 0;
  const s = seedText(seed);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export function nextRandom(brain) {
  brain.rngState = (brain.rngState + 0x6d2b79f5) >>> 0;
  let t = brain.rngState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

