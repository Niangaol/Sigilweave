// 过场编舞：每类过场的视觉编排。CutsceneScene 的状态机（盖场/换场/冻结/揭开/跳过）
// 一行不动，这里只接管「画什么」：旧视觉基线 + 每类大胆层（运镜/碎裂/闪洪/动态排版）。
// 纪律：硬边整数坐标、种子确定、无渐变/模糊/Math.random；单帧四层合计 ≤700 指令。
// 符环 runes 在编舞里关闭（8×drawGlyph 约 250 指令），把预算让给巨号/闪洪/碎裂等冲击层。
import { C, pxRect, pxDiamond } from './Palette.js';
import {
  clamp01, easeOutCubic, drawStage, drawSeal, drawSparkBurst, drawDust,
  drawShatter, drawFlood, drawWhipStreaks, drawIris, drawGlitchSlices, drawNumeral, strokeRing,
} from './cinematic-art.js';
import { sfx } from '../audio/Sfx.js';

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
    const stageA = clamp01((veil - 0.42) / 0.58);
    const holdT = Math.max(0, elapsed - tl.coverMs);

    // ---- 舞台基线 + 舞台层大胆元素 ----
    drawStage(scene.stageG, { w: W, h: H, kind, act, veil, t: elapsed, accent });
    if (kind === 'act') {
      drawNumeral(scene.stageG, { cx, cy, act, accent, alpha: 0.14 * stageA });
    } else if (kind === 'death') {
      if (phase.phase === 'cover') drawIris(scene.stageG, { w: W, h: H, p: phase.p, color: C.bloodDark });
      else if (phase.phase === 'hold') drawGlitchSlices(scene.stageG, { w: W, h: H, t: elapsed, seed: act, color: C.blood });
      else if (phase.phase === 'reveal') drawIris(scene.stageG, { w: W, h: H, p: 1 - phase.p, color: C.bloodDark });
    } else if (kind === 'clear' && phase.phase === 'reveal') {
      // 12 列硬边百叶擦除，随揭开逐列收起
      const colW = Math.ceil(W / 12);
      for (let i = 0; i < 12; i++) {
        const colH = Math.round(H * clamp01(1 - (phase.p * 1.25 - i * 0.02)));
        if (colH > 0) pxRect(scene.stageG, i * colW, 0, colW, colH, C.void, 0.45 * (1 - phase.p));
      }
    }

    // ---- 中央符环：旧基线半径/透明度 + 每类冲击 ----
    let radius = 210;
    let sealAlpha = veil;
    if (phase.phase === 'cover') radius = 340 - 130 * easeOutCubic(phase.p);
    else if (phase.phase === 'hold') radius = 210 + Math.sin(elapsed * 0.0022) * 2;
    else if (phase.phase === 'reveal') { radius = 210 + 360 * easeOutCubic(phase.p); sealAlpha = (1 - phase.p) * 0.9; }
    else sealAlpha = 0;

    if (phase.phase === 'hold') {
      if (kind === 'act' && holdT < 220) radius += Math.round(22 * Math.sin((holdT / 220) * Math.PI));
      if ((kind === 'boot' || kind === 'sigil' || kind === 'retry' || kind === 'return') && holdT < 160) {
        radius += Math.round(16 * Math.sin((holdT / 160) * Math.PI));
      }
      if (kind === 'death') {
        const beat = (elapsed % 900) / 900;
        const thump = beat < 0.12 ? 1 : beat < 0.24 ? 0.35 : beat < 0.36 ? 0.8 : 0.25;
        sealAlpha *= 0.6 + 0.4 * thump;
      }
    }

    scene.sealG.clear();
    if (kind === 'clear' && phase.phase === 'hold') {
      const sp = clamp01(holdT / 500);
      if (!shatterFired && sp > 0) { shatterFired = true; sfx.cineShatter?.(); }
      drawSeal(scene.sealG, { cx, cy, r: 70, t: elapsed, accent, alpha: sealAlpha * (1 - sp) * 0.8, core: false, runes: false });
      drawShatter(scene.sealG, { cx, cy, r: 70, p: sp, accent, seed: 0x51c7 + act * 131 });
    } else if (kind === 'victory' && phase.phase === 'hold') {
      const mp = clamp01(holdT / 450);
      for (const i of [-1, 0, 1]) {
        const ringCx = Math.round(cx + i * 108 * (1 - mp));
        strokeRing(scene.sealG, ringCx, cy - 20, 40, accent, 0.5 * veil);
        strokeRing(scene.sealG, ringCx, cy - 20, 28, C.brass, 0.4 * veil);
      }
      if (!shatterFired && mp >= 1) { shatterFired = true; sfx.cineShatter?.(); }
      const punch = mp >= 1 && holdT < 670 ? Math.round(24 * Math.sin(((holdT - 450) / 220) * Math.PI)) : 0;
      drawSeal(scene.sealG, { cx, cy, r: radius + punch, t: elapsed, accent, alpha: sealAlpha * 0.55, core: !scene.cardData, runes: false });
    } else {
      drawSeal(scene.sealG, {
        cx, cy, r: radius, t: elapsed, accent,
        alpha: sealAlpha * (kind === 'victory' ? 0.55 : 0.8),
        core: !scene.cardData, runes: false, spokes: kind === 'death' ? 8 : 12,
      });
    }
    drawSparkBurst(scene.sealG, { cx, cy, t: elapsed, startT: tl.revealAt, accent, alpha: 1 });
    const revealMs = elapsed - tl.revealAt;
    if (revealMs >= 0 && revealMs < 140) {
      const flash = (1 - revealMs / 140) * (kind === 'victory' ? 0.28 : 0.12);
      pxRect(scene.sealG, 0, 0, W, H, kind === 'victory' ? C.brassLight : C.parchment, flash);
    }

    // ---- 加性辉光层：甩镜/闪洪/合并核心 ----
    scene.fxG.clear();
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
    if ((kind === 'sigil' || kind === 'retry' || kind === 'return') && phase.phase === 'hold' && holdT < 40) {
      drawFlood(scene.fxG, { w: W, h: H, color: accent, alpha: 0.1 * (1 - holdT / 40) });
    }

    // ---- 浮尘基线 ----
    scene.dustG.clear();
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