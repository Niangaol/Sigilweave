// 合成音效：不依赖外部音频资源，首次用户交互后创建 AudioContext。
// 失败时静默降级，绝不抛出页面错误。
let ctx = null;
let failed = false;
let enabled = true;
let lastKillAt = 0;

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

function tone({ freq = 440, dur = 0.08, type = 'square', gain = 0.02, to = null }) {
  if (!enabled) return;
  const c = ensure();
  if (!c) return;
  try {
    const o = c.createOscillator();
    const g = c.createGain();
    const t = c.currentTime;
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(Math.max(30, to), t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(c.destination);
    o.start(t); o.stop(t + dur + 0.02);
  } catch { /* 音效失败不影响玩法 */ }
}

export function setSoundEnabled(value) { enabled = !!value; return enabled; }
export function isSoundEnabled() { return enabled; }
export function toggleSound() { enabled = !enabled; if (enabled) tone({ freq: 720, dur: 0.06 }); return enabled; }

export const sfx = {
  bossRoar: () => { tone({ freq: 130, dur: 0.5, type: 'sawtooth', gain: 0.028, to: 55 }); setTimeout(() => tone({ freq: 90, dur: 0.4, type: 'square', gain: 0.02, to: 50 }), 180); },
  bossShatter: () => { tone({ freq: 520, dur: 0.28, type: 'triangle', gain: 0.02, to: 90 }); setTimeout(() => tone({ freq: 140, dur: 0.35, type: 'sine', gain: 0.018, to: 60 }), 120); },
  trigger: () => tone({ freq: 520, dur: 0.05, gain: 0.014 }),
  blocked: () => tone({ freq: 190, dur: 0.07, type: 'triangle', gain: 0.018 }),
  reroute: () => tone({ freq: 360, dur: 0.05, type: 'triangle', gain: 0.012 }),
  combo: () => { tone({ freq: 640, dur: 0.08, gain: 0.018 }); setTimeout(() => tone({ freq: 880, dur: 0.1, gain: 0.016 }), 55); },
  comboBreak: () => tone({ freq: 300, dur: 0.1, type: 'sawtooth', gain: 0.01, to: 150 }),
  dissipate: () => tone({ freq: 240, dur: 0.12, type: 'sine', gain: 0.012, to: 120 }),
  enemyShot: () => tone({ freq: 210, dur: 0.14, type: 'sawtooth', gain: 0.012, to: 140 }),
  hurt: () => tone({ freq: 150, dur: 0.12, gain: 0.022, to: 90 }),
  pick: () => tone({ freq: 900, dur: 0.04, gain: 0.01 }),
  // 割草击杀：短促骨裂声，连斩越高音越亮；内部按 45ms 节流，
  // 同帧扫掉一片怪时不会叠成噪音墙。
  kill: (streak = 0) => {
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    if (now - lastKillAt < 45) return;
    lastKillAt = now;
    const step = Math.min(6, Math.floor((streak ?? 0) / 8));
    tone({ freq: 300 + step * 26, dur: 0.045, type: 'square', gain: 0.009, to: 150 + step * 18 });
  },
  tick: () => tone({ freq: 1100, dur: 0.025, gain: 0.008 }),
  tick: () => tone({ freq: 1100, dur: 0.025, gain: 0.008 }),
  quiz: () => tone({ freq: 460, dur: 0.16, type: 'triangle', gain: 0.018 }),
  correct: () => { tone({ freq: 620, dur: 0.1, gain: 0.018 }); setTimeout(() => tone({ freq: 930, dur: 0.16, gain: 0.016 }), 80); },
  wrong: () => tone({ freq: 220, dur: 0.2, type: 'sawtooth', gain: 0.016, to: 120 }),
  bossDown: () => { tone({ freq: 320, dur: 0.12, type: 'triangle', gain: 0.02 }); setTimeout(() => tone({ freq: 180, dur: 0.3, type: 'sine', gain: 0.02, to: 80 }), 90); },
  // 过场：盖场 / 换场 / 揭开各一记短音，不抢戏，只把三段节奏点出来；
  // 首屏没有用户手势时 AudioContext 起不来，tone() 自己静默降级。
  cineIn: (kind = '') => {
    if (kind === 'death') {
      tone({ freq: 120, dur: 0.5, type: 'sawtooth', gain: 0.02, to: 55 });
      setTimeout(() => tone({ freq: 80, dur: 0.4, type: 'sine', gain: 0.016, to: 42 }), 140);
      return;
    }
    if (kind === 'victory') {
      [392, 523, 659].forEach((freq, i) => setTimeout(() => tone({ freq, dur: 0.6, type: 'triangle', gain: 0.012 }), i * 90));
      return;
    }
    tone({ freq: 190, dur: 0.22, type: 'triangle', gain: 0.016, to: 120 });
    setTimeout(() => tone({ freq: 430, dur: 0.16, type: 'sine', gain: 0.01, to: 300 }), 90);
  },
  cineSwap: () => tone({ freq: 250, dur: 0.1, type: 'square', gain: 0.009, to: 160 }),
  // 编舞冲击点：标题砸落一记低音，符环碎裂一记高音扫落（增益压在 ≤0.018，不抢配乐）
  cineSlam: () => { tone({ freq: 90, dur: 0.09, type: 'square', gain: 0.02, to: 50 }); setTimeout(() => tone({ freq: 140, dur: 0.12, type: 'triangle', gain: 0.012, to: 70 }), 60); },
  cineShatter: () => { tone({ freq: 520, dur: 0.28, type: 'triangle', gain: 0.018, to: 90 }); setTimeout(() => tone({ freq: 140, dur: 0.35, type: 'sine', gain: 0.016, to: 60 }), 120); },
  cineReveal: (kind = '') => tone({
    freq: kind === 'death' ? 180 : kind === 'victory' ? 660 : 520,
    dur: 0.18, type: 'triangle', gain: 0.013,
    to: kind === 'death' ? 90 : kind === 'victory' ? 990 : 780,
  }),
};
