// 战斗背景音乐：WebAudio 现场合成的快节奏像素 chiptune（参考《元气骑士》热血风格）。
// 与 Sfx 同纪律：不依赖外部音频资源、首次手势前静默降级、任何异常都不抛出页面错误。
// 用 lookahead 调度器按 AudioContext 时钟排 16 分音符，循环 4 小节 Am-F-C-G 推进。
import { isSoundEnabled } from './Sfx.js';

let ctx = null;
let master = null;
let timer = null;
let nextTime = 0;
let step = 0;
let playing = false;
let failed = false;

const BPM = 152;
const STEP = 60 / BPM / 4;          // 一个 16 分音符的秒数
const LOOKAHEAD = 0.15;             // 提前排程窗口（秒）
const TICK_MS = 40;                 // 调度器心跳
const LOOP = 64;                    // 4 小节 × 16 步
const VOL = 0.18;                   // 音乐总音量，压在音效之下

// 每小节的和弦根音与琶音音级（Hz）；Am - F - C - G 是最典型的「热血向上」循环。
const BARS = [
  { bass: 110.00, arp: [440.00, 523.25, 659.25] }, // Am
  { bass: 87.31, arp: [349.23, 440.00, 523.25] },  // F
  { bass: 130.81, arp: [523.25, 659.25, 783.99] }, // C
  { bass: 98.00, arp: [392.00, 493.88, 587.33] },  // G
];

function ensure() {
  if (failed) return null;
  try {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { failed = true; return null; }
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  } catch { failed = true; return null; }
}

// 单个音符：方波/三角波 + 指数衰减包络；可选频率下滑（底鼓）。
function voice(freq, when, dur, type, gain, to = null) {
  if (!ctx || !master) return;
  try {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, when);
    if (to) o.frequency.exponentialRampToValueAtTime(Math.max(30, to), when + dur);
    g.gain.setValueAtTime(gain, when);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    o.connect(g); g.connect(master);
    o.start(when); o.stop(when + dur + 0.02);
  } catch { /* 配乐失败不影响画面 */ }
}

// 一步 = 一个 16 分音符。i 为全局步号（0..63）。
function scheduleStep(i, when) {
  const bar = Math.floor(i / 16);
  const s = i % 16;
  const { bass, arp } = BARS[bar];
  // 底鼓：每拍一下（0/4/8/12）
  if (s % 4 === 0) voice(150, when, 0.14, 'sine', 0.42, 50);
  // 军鼓：2、4 拍
  if (s === 4 || s === 12) voice(190, when, 0.09, 'square', 0.16, 90);
  // 踩镲：每个 8 分音符
  if (s % 2 === 1) voice(5200, when, 0.035, 'square', 0.05);
  // 贝斯：跳跃的推进音型
  if ([0, 3, 6, 8, 11, 14].includes(s)) voice(bass, when, 0.16, 'triangle', 0.26);
  // 主旋琶音：16 分上下行，方波明亮
  const idx = s % 6;
  const note = arp[idx <= 3 ? idx : 5 - idx];
  voice(note, when, 0.085, 'square', 0.13);
}

function applyGain(value) {
  if (!ctx || !master) return;
  try {
    const g = master.gain;
    if (typeof g.cancelScheduledValues === 'function') g.cancelScheduledValues(ctx.currentTime);
    if (typeof g.setValueAtTime === 'function') g.setValueAtTime(Math.max(0.0001, value), ctx.currentTime);
    else g.value = Math.max(0.0001, value);
  } catch { /* 静默 */ }
}

function tick() {
  if (!playing || !ctx || !master) return;
  // 静音：不停调度器，只压低音量并停止排新音符；取消静音时可无缝恢复。
  if (!isSoundEnabled()) { applyGain(0.0001); return; }
  applyGain(VOL);
  try {
    while (nextTime < ctx.currentTime + LOOKAHEAD) {
      scheduleStep(step, nextTime);
      nextTime += STEP;
      step = (step + 1) % LOOP;
    }
  } catch { /* 静默 */ }
}

export function startBattleMusic() {
  if (playing) return;
  const c = ensure();
  if (!c) return;
  try {
    master = c.createGain();
    master.connect(c.destination);
    nextTime = c.currentTime + 0.05;
    step = 0;
    playing = true;
    applyGain(isSoundEnabled() ? VOL : 0.0001);
    tick();
    timer = setInterval(tick, TICK_MS);
  } catch { failed = true; }
}

export function stopBattleMusic() {
  playing = false;
  if (timer) { clearInterval(timer); timer = null; }
  const c = ctx, m = master;
  master = null;
  if (!c || !m) return;
  try {
    const t = c.currentTime;
    if (typeof m.gain.cancelScheduledValues === 'function') m.gain.cancelScheduledValues(t);
    if (typeof m.gain.setValueAtTime === 'function') m.gain.setValueAtTime(Math.max(0.0001, m.gain.value), t);
    if (typeof m.gain.exponentialRampToValueAtTime === 'function') m.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    setTimeout(() => { try { m.disconnect(); } catch { /* 已断开 */ } }, 280);
  } catch { /* 静默 */ }
}

export function isBattleMusicPlaying() {
  return playing;
}
