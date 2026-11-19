// 战斗频率统计：5 秒滑窗内每秒触发次数（HUD 频率条用）。
// 从 BattleScene 迁出（2026-11-19 架构重构波 1）：纯函数，无 Phaser、不改入参。
// 非法输入一律回退默认值（times 非数组按空、now 非有限按 0、prev 缺省按 0）。
export const FREQ_WINDOW_MS = 5000;

export function computeFrequency(times, now, prev) {
  const p = prev && typeof prev === 'object' ? prev : {};
  const list = Array.isArray(times) ? times : [];
  const nowMs = Number.isFinite(now) ? now : 0;
  let start = Number.isFinite(p.freqStart) ? Math.max(0, Math.trunc(p.freqStart)) : 0;
  const floor = nowMs - FREQ_WINDOW_MS;
  while (start < list.length && list[start] < floor) start++;
  const buckets = [0, 0, 0, 0, 0];
  for (let i = start; i < list.length; i++) {
    const b = Math.floor((list[i] - floor) / 1000);
    if (b >= 0 && b < 5) buckets[b]++;
  }
  const count = list.length - start;
  const recentRate = count / (FREQ_WINDOW_MS / 1000);
  const prevPeak = Number.isFinite(p.peakRate) ? p.peakRate : 0;
  return {
    freqStart: start,
    buckets,
    recentRate,
    peakRate: Math.max(prevPeak, recentRate),
  };
}
