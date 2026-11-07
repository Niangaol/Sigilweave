// 过场配乐：WebAudio 现场合成，双正弦 detune 低音铺底 + 镜头 cue 乐音。
// 与 Sfx 同纪律：首次用户手势前 AudioContext 可能 suspended，静默降级；任何异常都不抛出。
import { isSoundEnabled } from './Sfx.js';

let ctx = null;
let master = null;
let drone = [];
let failed = false;

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

function note(freq, dur, gain, when = 0) {
  if (!ctx || !master) return;
  try {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const t0 = ctx.currentTime + when;
    o.type = 'sine';
    o.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + dur + 0.05);
  } catch { /* 配乐失败不影响画面 */ }
}

export function startMusic(kind = 'opening') {
  if (!isSoundEnabled()) return;
  const c = ensure();
  if (!c) return;
  stopMusic();
  try {
    master = c.createGain();
    master.gain.setValueAtTime(0.0001, c.currentTime);
    master.gain.exponentialRampToValueAtTime(kind === 'journey' ? 0.5 : 0.9, c.currentTime + 1.2);
    master.connect(c.destination);
    const base = kind === 'journey' ? 73.4 : 55;
    for (const [freq, gain] of [[base, 0.018], [base * 1.005, 0.014], [base * 2, 0.006]]) {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(freq, c.currentTime);
      g.gain.setValueAtTime(gain, c.currentTime);
      o.connect(g); g.connect(master);
      o.start();
      drone.push({ o });
    }
  } catch { failed = true; }
}

const CUES = Object.freeze({
  bell:   [[440, 1.6]],
  chime:  [[523, 1.2], [659, 1.4]],
  arp:    [[220, 0.5], [277, 0.5], [330, 0.5], [440, 0.9]],
  finale: [[392, 1.2], [523, 1.4], [659, 2.0]],
});

export function musicCue(cue) {
  if (!isSoundEnabled() || !ctx || !master) return;
  const seq = CUES[cue];
  if (!seq) return;
  seq.forEach(([freq, dur], i) => note(freq, dur, 0.04, i * 0.14));
}

export function stopMusic() {
  const c = ctx, m = master, d = drone;
  master = null;
  drone = [];
  if (!c || !m) return;
  try {
    const t0 = c.currentTime;
    m.gain.cancelScheduledValues(t0);
    m.gain.setValueAtTime(Math.max(0.0001, m.gain.value), t0);
    m.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.25);
    for (const { o } of d) { try { o.stop(t0 + 0.3); } catch { /* 已停 */ } }
    setTimeout(() => { try { m.disconnect(); } catch { /* 已断开 */ } }, 350);
  } catch { /* 静默 */ }
}