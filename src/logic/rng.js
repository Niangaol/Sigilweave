// 确定性随机源：同一 seed 结果完全一致，便于回放与测试
export function hashSeed(seed) {
  let h = 2166136261 >>> 0;
  const s = String(seed);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export class Rng {
  constructor(seed) {
    this.state = hashSeed(seed);
    this.calls = 0;
  }

  nextUint32() {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    this.calls++;
    return (t ^ (t >>> 14)) >>> 0;
  }

  next() {
    return this.nextUint32() / 4294967296;
  }

  // [0, n) 的整数
  int(n) {
    if (n <= 0) return 0;
    return this.nextUint32() % n;
  }

  pick(arr) {
    if (!arr || arr.length === 0) return null;
    return arr[this.int(arr.length)];
  }

  snapshot() {
    return { state: this.state, calls: this.calls };
  }

  restore(snap) {
    this.state = snap.state >>> 0;
    this.calls = snap.calls | 0;
  }
}
