// 特效层：方位光迹（设计稿 2.3 核心）、冷却折线、消散、联组链带、受击红边
// 所有特效按内部时钟推进，暂停时 dt=0 即冻结，不依赖 Phaser tween。
import { C, HEX, addText, pxRect, pxLine, pxDiamond } from './Palette.js';

const BATTLE = { top: 20, bottom: 158, left: 2, right: 478 };

function clampRect(r) {
  const x1 = Math.max(BATTLE.left, r.x);
  const y1 = Math.max(BATTLE.top, r.y);
  const x2 = Math.min(BATTLE.right, r.x + r.w);
  const y2 = Math.min(BATTLE.bottom, r.y + r.h);
  if (x2 <= x1 + 1 || y2 <= y1 + 1) return null;
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

export default class EffectsLayer {
  constructor(scene) {
    this.scene = scene;
    this.g = scene.add.graphics().setDepth(900);          // 世界层：弹着、爆点（随镜头滚动）
    this.sg = scene.add.graphics().setDepth(905).setScrollFactor(0); // 屏幕层：光迹、联组链带
    this.vg = scene.add.graphics().setDepth(940).setScrollFactor(0);
    this.comboLabel = addText(scene, 240, 143, '', 9, HEX.brassLight)
      .setOrigin(0.5, 0.5).setDepth(910).setVisible(false).setScrollFactor(0);
    this.items = [];
    this.texts = [];
    this.clock = 0;
  }

  push(item) {
    item.t = 0;
    this.items.push(item);
    return item;
  }

  directionTrace(from, to, sector, color, empty) {
    this.push({
      kind: 'trace', dur: 820, from, to, sector, color, empty,
    });
  }

  reroute(from, to) {
    const mx = (from.x + to.x) / 2 + 9;
    const my = (from.y + to.y) / 2 - 9;
    this.push({ kind: 'reroute', dur: 480, from, to, mid: { x: mx, y: my } });
  }

  fallback(from, to) {
    this.push({ kind: 'fallback', dur: 700, from, to });
  }

  dissipate(x, y, color) {
    this.push({ kind: 'dissipate', dur: 540, x, y, color: color ?? C.groove });
  }

  combo(centers, label) {
    this.push({ kind: 'combo', dur: 1200, centers, label });
  }

  impact(x, y, color, empty) {
    this.push({ kind: 'impact', dur: 260, x, y, color, empty: !!empty });
  }

  burst(x, y, color, count = 10) {
    const particles = [];
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + 0.35;
      const sp = 10 + ((i * 37) % 14);
      particles.push({ dx: Math.cos(a) * sp, dy: Math.sin(a) * sp, s: i % 3 === 0 ? 2 : 1 });
    }
    this.push({ kind: 'burst', dur: 560, x, y, color, particles });
  }

  deathBurst(x, y) {
    this.burst(x, y, C.bone, 16);
    this.burst(x, y, C.arcane, 8);
    this.push({ kind: 'dissipate', dur: 700, x, y, color: C.blood });
  }

  hurt() {
    this.push({ kind: 'hurt', dur: 320 });
  }

  text(x, y, str, color, fixed = false) {
    const obj = addText(this.scene, x, y, str, 8, color).setOrigin(0.5, 0.5).setDepth(915);
    if (fixed) obj.setScrollFactor(0);
    this.texts.push({ obj, y0: y, t: 0, dur: 760 });
  }

  drawSectorBrackets(g, rect, color, alpha, sx = null, sy = null) {
    const r = clampRect(rect);
    if (!r) return;
    const X = (v) => (sx ? sx(v) : v);
    const Y = (v) => (sy ? sy(v) : v);
    // 只画四角括号，避免在战场上糊出一个大框
    const L = 6;
    const x0 = X(r.x), y0 = Y(r.y), x1 = X(r.x + r.w), y1 = Y(r.y + r.h);
    pxLine(g, x0, y0, x0 + L, y0, color, alpha, 1);
    pxLine(g, x0, y0, x0, y0 + L, color, alpha, 1);
    pxLine(g, x1, y0, x1 - L, y0, color, alpha, 1);
    pxLine(g, x1, y0, x1, y0 + L, color, alpha, 1);
    pxLine(g, x0, y1, x0 + L, y1, color, alpha, 1);
    pxLine(g, x0, y1, x0, y1 - L, color, alpha, 1);
    pxLine(g, x1, y1, x1 - L, y1, color, alpha, 1);
    pxLine(g, x1, y1, x1, y1 - L, color, alpha, 1);
    pxRect(g, x0, y0, x1 - x0, y1 - y0, color, alpha * 0.045);
  }

  update(dtMs) {
    this.clock += dtMs;
    const g = this.g;
    const sg = this.sg;
    const vg = this.vg;
    g.clear();
    sg.clear();
    vg.clear();
    // 世界坐标 -> 屏幕坐标：光迹目标端贴住世界区域，起点罗盘固定屏幕
    // 世界坐标 -> 逻辑屏幕坐标：用 worldView（已含 zoom）换算，不再假设 zoom=1。
    const cam = this.scene.cameras.main;
    const sx = (wx) => wx - cam.worldView.x;
    const sy = (wy) => wy - cam.worldView.y;

    // 联组标签单独管理
    let comboActive = null;

    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.t += dtMs;
      const k = Math.min(1, it.t / it.dur);
      const a = 1 - k;

      if (it.kind === 'trace') {
        const color = it.color ?? C.arcane;
        const tx = sx(it.to.x); const ty = sy(it.to.y);
        // 格子上方 22px 的垂直光柱（2.5D 的第二根视觉支柱）
        pxRect(g, Math.round(it.from.x) - 1, Math.round(it.from.y) - 24, 3, 24, color, 0.28 * a);
        pxRect(g, Math.round(it.from.x), Math.round(it.from.y) - 28, 1, 6, color, 0.55 * a);
        // 主光迹：从格指向战场方位。空区也画，只是终点是区域中心。
        pxLine(sg, it.from.x, it.from.y, tx, ty, color, 0.42 * a, 1);
        // 流动亮段：让「哪一格在打」有明确的指向感
        const flow = (this.clock / 420) % 1;
        for (let s = 0; s < 5; s++) {
          const u = (flow + s * 0.035) % 1;
          const px = it.from.x + (tx - it.from.x) * u;
          const py = it.from.y + (ty - it.from.y) * u;
          pxRect(sg, Math.round(px) - 1, Math.round(py) - 1, 3, 3, color, 0.7 * a);
        }
        // 终点标记：命中目标为实心菱形，空射为空心加十字
        pxDiamond(sg, tx, ty, 5, color, 0.95 * a, false);
        if (it.empty) {
          pxLine(sg, tx - 2, ty - 2, tx + 2, ty + 2, C.mute, 0.6 * a, 1);
          pxLine(sg, tx + 2, ty - 2, tx - 2, ty + 2, C.mute, 0.6 * a, 1);
        } else {
          pxDiamond(sg, tx, ty, 2, color, 0.9 * a, true);
        }
        // 所在方位扇区的四角括号（世界矩形按镜头换算到屏幕）
        this.drawSectorBrackets(sg, it.sector, color, 0.7 * a, sx, sy);
      } else if (it.kind === 'reroute') {
        // 冷却改道：短折线，青绿色属于「运行层」，不和伤害/联组抢色
        pxLine(sg, it.from.x, it.from.y, it.mid.x, it.mid.y, C.teal, 0.75 * a, 1);
        pxLine(sg, it.mid.x, it.mid.y, it.to.x, it.to.y, C.teal, 0.75 * a, 1);
        pxRect(sg, Math.round(it.mid.x) - 1, Math.round(it.mid.y) - 1, 2, 2, C.teal, a);
        pxDiamond(sg, it.to.x, it.to.y, 3, C.teal, a, false);
      } else if (it.kind === 'fallback') {
        // 探索保底传送：断续的虚线弧
        const steps = 12;
        for (let s = 0; s < steps; s += 2) {
          const u0 = s / steps;
          const u1 = (s + 1) / steps;
          const x0 = it.from.x + (it.to.x - it.from.x) * u0;
          const y0 = it.from.y + (it.to.y - it.from.y) * u0 - Math.sin(u0 * Math.PI) * 16;
          const x1 = it.from.x + (it.to.x - it.from.x) * u1;
          const y1 = it.from.y + (it.to.y - it.from.y) * u1 - Math.sin(u1 * Math.PI) * 16;
          pxLine(sg, x0, y0, x1, y1, C.teal, 0.8 * a, 1);
        }
        pxDiamond(sg, it.to.x, it.to.y, 4, C.teal, a, false);
      } else if (it.kind === 'dissipate') {
        for (let ring = 0; ring < 3; ring++) {
          const rk = Math.max(0, Math.min(1, k - ring * 0.12));
          if (rk <= 0) continue;
          pxDiamond(sg, it.x, it.y, 3 + rk * (12 + ring * 3), it.color, (1 - rk) * 0.85, false);
        }
        for (let s = 0; s < 6; s++) {
          const ang = (s / 6) * Math.PI * 2;
          const dist = 6 + k * 18;
          pxRect(sg, Math.round(it.x + Math.cos(ang) * dist), Math.round(it.y + Math.sin(ang) * dist) - Math.round(k * 10), 1, 1, it.color, a * 0.7);
        }
      } else if (it.kind === 'combo') {
        comboActive = it;
        const bright = it.t < 220;
        for (let s = 0; s < it.centers.length - 1; s++) {
          const p0 = it.centers[s];
          const p1 = it.centers[s + 1];
          pxLine(sg, p0.x, p0.y, p1.x, p1.y, C.brass, 0.9 * a, 3);
          if (bright) pxLine(sg, p0.x, p0.y, p1.x, p1.y, C.white, 0.95, 2);
        }
        for (const p of it.centers) {
          pxDiamond(sg, p.x, p.y, 4, C.brass, a, false);
          pxDiamond(sg, p.x, p.y, 1, bright ? C.white : C.arcaneLight, a, true);
        }
        if (bright) {
          // 暗角收缩：四边硬边黑框，不用渐变
          pxRect(vg, 0, 20, 480, 5, C.void, 0.35);
          pxRect(vg, 0, 265, 480, 5, C.void, 0.35);
          pxRect(vg, 0, 20, 5, 250, C.void, 0.35);
          pxRect(vg, 475, 20, 5, 250, C.void, 0.35);
        }
      } else if (it.kind === 'impact') {
        const rr = 2 + k * 5;
        pxDiamond(g, it.x, it.y, rr, it.color, 0.9 * a, false);
        pxRect(g, Math.round(it.x) - 1, Math.round(it.y) - 1, 2, 2, it.color, a);
        for (let s = 0; s < 4; s++) {
          const ang = (s / 4) * Math.PI * 2 + Math.PI / 4;
          const dist = 3 + k * 12;
          pxRect(g, Math.round(it.x + Math.cos(ang) * dist), Math.round(it.y + Math.sin(ang) * dist), 1, 1, it.color, a * 0.8);
        }
      } else if (it.kind === 'burst') {
        for (const p of it.particles) {
          const px = it.x + p.dx * k * 2.2;
          const py = it.y + p.dy * k * 2.2 + k * k * 8;
          pxRect(g, Math.round(px), Math.round(py), p.s, p.s, it.color, a);
        }
      } else if (it.kind === 'hurt') {
        // 受击红边：分段硬边，不闪全屏
        const aa = a * 0.8;
        pxRect(vg, 0, 20, 480, 4, C.blood, aa);
        pxRect(vg, 0, 266, 480, 4, C.blood, aa);
        pxRect(vg, 0, 20, 4, 250, C.blood, aa);
        pxRect(vg, 476, 20, 4, 250, C.blood, aa);
        pxRect(vg, 0, 20, 8, 250, C.bloodDark, aa * 0.4);
        pxRect(vg, 472, 20, 8, 250, C.bloodDark, aa * 0.4);
      }

      if (k >= 1) {
        this.items.splice(i, 1);
      }
    }

    // 联组字幕
    if (comboActive) {
      const k = Math.min(1, comboActive.t / comboActive.dur);
      this.comboLabel.setText('联组 · ' + comboActive.label).setVisible(true).setAlpha(1 - k);
    } else {
      this.comboLabel.setVisible(false);
    }

    // 漂浮文字（拾取、起点迁移等）
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const tx = this.texts[i];
      tx.t += dtMs;
      const k = Math.min(1, tx.t / tx.dur);
      tx.obj.y = tx.y0 - 12 * k;
      tx.obj.setAlpha(1 - k);
      if (k >= 1) {
        tx.obj.destroy();
        this.texts.splice(i, 1);
      }
    }
  }
}
