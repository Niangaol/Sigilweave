// 过场编舞：每类过场只负责「活动件三拍」的调度，布景是 CutsceneScene 预绘制的静态三层。
// CutsceneScene 的状态机（盖场/换场/冻结/揭开/跳过）一行不动。
// 纪律：硬边整数坐标、种子确定、无渐变/模糊/Math.random；单帧四层合计 ≤700 指令。
import { C, pxRect, pxDiamond } from './Palette.js';
import {
  clamp01, easeOutCubic, drawSeal, drawSparkBurst, drawDust,
  drawFlood, drawWhipStreaks, drawIris, drawGlitchSlices, strokeRing,
} from './cinematic-art.js';
import { sfx } from '../audio/Sfx.js';
import { getShortEvent } from './cine-beats/short.js';
import { getBattleEvent } from './cine-beats/battle.js';

const easeOutBack = t => {
  const x = clamp01(t), c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};

export function createChoreo(kind, act) {
  if (kind === 'journey') return null;
  let slamFired = false;
  let shatterFired = false;

  function draw(scene, ctx) {
    const { phase, veil, accent, elapsed, tl } = ctx;
    const { W, H, cx, cy } = scene;
    const anchors = ctx.anchors || {};
    const tint = ctx.tint ?? 0x241c3a;
    const holdT = Math.max(0, elapsed - tl.coverMs);
    // holdP：盖场恒 0，hold 内按 hold 时长推进，揭开恒 1（结果拍残留不消失）
    const holdP = phase.phase === 'hold' ? clamp01(holdT / Math.max(1, tl.holdMs))
      : (phase.phase === 'reveal' || phase.phase === 'done') ? 1 : 0;

    scene.stageG.clear();
    scene.sealG.clear();
    scene.fxG.clear();
    scene.dustG.clear();

    // ---- 事件三拍：布景静态，活动件由事件库画 ----
    const ev = getShortEvent(kind) || getBattleEvent(kind);
    if (ev) {
      ev.draw(scene, {
        w: W, h: H, holdP, phase: phase.phase, anchors, accent, tint,
        seed: 0x51c7 + act * 131, act,
        horizon: ctx.dio?.horizon ?? Math.round(H * 0.44),
      });
    }

    // ---- 类专属的屏幕级叠层（不属于单件道具，放事件之后）----
    if (kind === 'death') {
      if (phase.phase === 'cover') drawIris(scene.stageG, { w: W, h: H, p: phase.p, color: C.bloodDark });
      else if (phase.phase === 'hold') drawGlitchSlices(scene.stageG, { w: W, h: H, t: elapsed, seed: act, color: C.blood });
      else if (phase.phase === 'reveal') drawIris(scene.stageG, { w: W, h: H, p: 1 - phase.p, color: C.bloodDark });
    }
    if (kind === 'clear' && phase.phase === 'reveal') {
      // 12 列硬边百叶擦除，随揭开逐列收起
      const colW = Math.ceil(W / 12);
      for (let i = 0; i < 12; i++) {
        const colH = Math.round(H * clamp01(1 - (phase.p * 1.25 - i * 0.02)));
        if (colH > 0) pxRect(scene.stageG, i * colW, 0, colW, colH, C.void, 0.45 * (1 - phase.p));
      }
    }

    // ---- 大符环：只有 victory 保留（其余类的环交给事件在锚点画小环）----
    if (kind === 'victory' && phase.phase !== 'done') {
      const mp = phase.phase === 'hold' ? clamp01(holdT / 450) : 1;
      if (phase.phase === 'hold' && mp < 1) {
        for (const i of [-1, 0, 1]) {
          const ringCx = Math.round(cx + i * 108 * (1 - mp));
          strokeRing(scene.sealG, ringCx, cy - 20, 40, accent, 0.5 * veil);
          strokeRing(scene.sealG, ringCx, cy - 20, 28, C.brass, 0.4 * veil);
        }
      }
      let radius = 210;
      let sealAlpha = veil;
      if (phase.phase === 'cover') radius = 340 - 130 * easeOutCubic(phase.p);
      else if (phase.phase === 'hold') radius = 210 + Math.sin(elapsed * 0.0022) * 2;
      else if (phase.phase === 'reveal') { radius = 210 + 360 * easeOutCubic(phase.p); sealAlpha = (1 - phase.p) * 0.9; }
      const punch = mp >= 1 && holdT < 670 ? Math.round(24 * Math.sin(((holdT - 450) / 220) * Math.PI)) : 0;
      drawSeal(scene.sealG, {
        cx, cy, r: radius + punch, t: elapsed, accent,
        alpha: sealAlpha * 0.55, core: !scene.cardData, runes: false,
      });
    }

    // 揭开瞬间的白闪（每类一次）
    drawSparkBurst(scene.sealG, { cx, cy, t: elapsed, startT: tl.revealAt, accent, alpha: 1 });
    const revealMs = elapsed - tl.revealAt;
    if (revealMs >= 0 && revealMs < 140) {
      const flash = (1 - revealMs / 140) * (kind === 'victory' ? 0.28 : 0.12);
      pxRect(scene.sealG, 0, 0, W, H, kind === 'victory' ? C.brassLight : C.parchment, flash);
    }

    // ---- 加性辉光层：甩镜/闪洪 ----
    if (kind === 'act' && phase.phase === 'cover') {
      drawWhipStreaks(scene.fxG, { w: W, h: H, p: phase.p, dir: 1, color: accent });
    }
    if (kind === 'act') {
      const landAt = tl.coverMs * 0.55 + 3 * 45 + 200;
      if (!slamFired && elapsed >= landAt) { slamFired = true; sfx.cineSlam?.(); }
      if (elapsed >= landAt && elapsed < landAt + 50) {
        drawFlood(scene.fxG, { w: W, h: H, color: accent, alpha: 0.18 * (1 - (elapsed - landAt) / 50) });
      }
    }
    if (kind === 'victory' && phase.phase === 'hold' && holdT >= 450 && holdT < 520) {
      drawFlood(scene.fxG, { w: W, h: H, color: C.brass, alpha: 0.22 * (1 - (holdT - 450) / 70) });
      pxDiamond(scene.fxG, cx, cy, 30, C.brassLight, 0.5 * (1 - (holdT - 450) / 70), true);
    }
    // 契约钉碎裂的音效落在 clear 事件行动拍起点
    if (kind === 'clear' && phase.phase === 'hold' && !shatterFired && holdT >= 0) {
      shatterFired = true;
      sfx.cineShatter?.();
    }

    // ---- 浮尘基线 ----
    drawDust(scene.dustG, scene.dust, { h: H, t: elapsed, accent, alpha: veil });

    // ---- 卡片动效：旧基线淡入淡出 + 每类动态排版 ----
    if (scene.card) {
      let alpha = 1, dy = 0;
      if (phase.phase === 'cover') {
        const p = easeOutCubic(clamp01((elapsed - tl.coverMs * 0.42) / Math.max(1, tl.coverMs * 0.58)));
        alpha = p; dy = (1 - p) * 12;
      } else if (phase.phase === 'reveal') {
        const p = easeOutCubic(phase.p);
        alpha = Math.max(0, 1 - p * 1.35); dy = -p * 10;
      } else if (phase.phase === 'done') alpha = 0;

      let jitter = 0;
      if (kind === 'act' && scene.card.titleChars) {
        const baseY = scene.card.titleBaseY ?? -58;
        scene.card.titleChars.forEach((ch, i) => {
          const local = elapsed - (tl.coverMs * 0.55 + i * 45);
          const p = clamp01(local / 200);
          ch.setAlpha(clamp01(local / 120));
          ch.setY(Math.round(baseY - 16 * (1 - easeOutBack(p))));
        });
        const landAt = tl.coverMs * 0.55 + 3 * 45 + 200;
        if (elapsed >= landAt && elapsed < landAt + 90) {
          jitter = Math.round(Math.sin(elapsed * 0.3) * 2 * (1 - (elapsed - landAt) / 90));
        }
      }
      if (kind === 'clear' && scene.card.statValues) {
        const baseY = scene.card.statBaseY ?? 64;
        scene.card.statValues.forEach((v, i) => {
          const local = elapsed - (tl.coverMs + 100 + i * 60);
          const p = clamp01(local / 180);
          v.setAlpha(p);
          v.setY(Math.round(baseY + 6 * (1 - easeOutCubic(p))));
        });
      }
      if ((kind === 'sigil' || kind === 'retry' || kind === 'return') && scene.card.titleText) {
        const baseY = scene.card.titleBaseY ?? -9;
        const p = easeOutCubic(clamp01((elapsed - tl.coverMs * 0.5) / 200));
        scene.card.titleText.setY(Math.round(baseY - 8 * (1 - p)));
      }
      scene.card.setAlpha(alpha);
      scene.card.setY(cy + dy + jitter);
    }
  }

  return { draw };
}
