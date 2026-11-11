// 特效层：方位光迹（设计稿 2.3 核心）、冷却折线、消散、联组链带、受击红边
// 所有特效按内部时钟推进，暂停时 dt=0 即冻结，不依赖 Phaser tween。
import { C, HEX, addText, pxRect, pxLine, pxDiamond, pxRing } from './Palette.js';
import { drawCastFx, drawImpactFx, drawWardFx, drawLinkFx } from './spell-fx.js';
import { drawMeteorStrike, drawQuakeStrike, METEOR_STRIKE_DUR, QUAKE_STRIKE_DUR } from './strike-fx.js';

// 演出层分派：只有这两个高级法术有整套演出，其它 defId 不进来
const STRIKE_DRAW = { meteor_judgment: drawMeteorStrike, quake_maw: drawQuakeStrike };
const STRIKE_DUR = { meteor_judgment: METEOR_STRIKE_DUR, quake_maw: QUAKE_STRIKE_DUR };

const BATTLE = { top: 20, bottom: 158, left: 2, right: 478 };

// 命中特效寿命（毫秒）：轻 360~420 / 中 520~640 / 重 760~980
const IMPACT_DUR = {
  frost_arrow: 380,
  arcane_bolt: 400,
  chain_lightning: 420,
  echo_sigil: 520,
  mana_siphon: 520,
  flame_burst: 560,
  ember_fan: 560,
  thorn_vine: 600,
  soul_lance: 560,
  holy_ward: 640,
  aegis_ring: 640,
  pierce_lance: 620,
  starfall: 680,
  judgment_hammer: 780,
  quake_maw: 860,
  meteor_judgment: 980,
};

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
    // 连斩字幕：割草的即时反馈。战斗层只上报连斩数，1.5 秒没有新击杀就自然断掉。
    this.streakLabel = addText(scene, 240, 46, '', 10, HEX.brassLight)
      .setOrigin(0.5, 0.5).setDepth(912).setVisible(false).setScrollFactor(0);
    this.streak = { n: 0, until: -1, shown: -1 };
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

  // 屏幕内没有可选目标时的「待机」提示：法杖端点一圈淡环，表示这一格在等怪进屏（不出手）。
  hold(x, y, color) {
    this.push({ kind: 'hold', dur: 300, x, y, color: color ?? C.arcane });
  }

  // 受击火花：沿「命中来向」的反方向喷出的定向火星 + 白核 + 小冲击环。
  // power 0~1 决定火星长度（重击更炸）；纯绘制，不做粒子系统，同屏几十只也扛得住。
  hitSpark(x, y, dx, dy, color, power = 0.6) {
    const len = Math.hypot(dx, dy) || 1;
    const p = Number.isFinite(power) ? Math.max(0, Math.min(1, power)) : 0.6;
    this.push({ kind: 'hitSpark', dur: 220, x, y, nx: dx / len, ny: dy / len, power: p, color: color ?? C.arcane });
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

  // ---------- 法术专属特效：全部按 defId 分派给 spell-fx ----------
  // 起手：法杖尖端的小爆发，让「是谁打出去的」有落点
  spellCast(defId, x, y, angle = 0) {
    this.push({ kind: 'spellCast', defId, x, y, angle, dur: 320 });
  }

  // 命中/落点：16 个法术各自的爆点图案。
  // 寿命按「重量」分档：轻法术干脆利落（短），重击留足余韵（长），
  // 这样同屏几十发齐射时短特效快速让位，重击还能在屏幕上停住。
  // angle 供贯穿/回声/噬魂/余烬这类有方向的命中图案用（不传＝0，朝右）
  spellImpact(defId, x, y, radius = 14, angle = 0) {
    const dur = IMPACT_DUR[defId] ?? 480;
    this.push({ kind: 'spellImpact', defId, x, y, radius, angle, dur });
  }

  // 护盾类：光圈跟着玩家走，不在施法点留残影
  spellWard(defId, radius = 40) {
    const p = this.scene.player;
    this.push({
      kind: 'spellWard', defId, radius, dur: 640,
      x: p?.x ?? 240, y: p?.y ?? 135,
    });
  }

  // 连锁/回声/噬魂的连接线：世界坐标，两端都是实体
  spellLink(defId, from, to, index = 0) {
    this.push({
      kind: 'spellLink', defId, index, dur: 240,
      from: { x: from.x, y: from.y }, to: { x: to.x, y: to.y },
    });
  }

  // 高级法术的多段演出（1.4~1.6s）：和 spellImpact 的瞬发图案并行，一个管「打到了」，一个管「后果」
  spellStrike(defId, x, y, radius = 90, angle = 0) {
    const dur = STRIKE_DUR[defId];
    if (!dur) return;
    this.push({ kind: 'spellStrike', defId, x, y, radius, angle, dur });
  }

  // 屏幕级演出反馈：四边压暗再回弹（不闪全屏，避免挡住战场）
  vignette(strength = 1, dur = 460) {
    this.push({ kind: 'vignette', dur, strength });
  }

  // 割草死亡反馈：比 deathBurst 轻得多，同屏几十个也不掉帧
  killBurst(x, y, color) {
    this.push({ kind: 'killBurst', x, y, color: color ?? C.bone, dur: 420 });
  }

  // 小怪爆散：首帧白闪 + 冲击环 + 10/16 块身体碎片（抛物线飞散）+ 骨屑尘。
  // 纯绘制、不用粒子系统；碎片方向/速度由击杀位置确定性推导，同一位置重播一致。
  deathScatter(x, y, color, opts = {}) {
    const elite = !!opts.elite;
    const count = elite ? 18 : 12;
    const seed = ((x * 0.37 + y * 0.11) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
    const shards = [];
    for (let i = 0; i < count; i++) {
      const a = seed + (i / count) * Math.PI * 2;
      // 前 3 块是「大块身体」：慢、大、带描边，读作确实被打碎了一块；
      // 剩下的才是细骨屑。没有大块的话，远看只是一圈白烟。
      const big = i < 3;
      const speed = big ? 34 + ((i * 19) % 24) : (elite ? 74 : 50) + ((i * 29) % 52);
      shards.push({
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed - (big ? 22 : elite ? 58 : 38),
        size: big ? 4 : i % 4 === 0 ? 3 : i % 2 === 0 ? 2 : 1,
        color: big ? (i === 0 ? (color ?? C.bone) : C.bone) : i % 3 === 0 ? C.stoneLight : C.bone,
        gravity: big ? 120 : 140 + (i % 3) * 32,
      });
    }
    this.push({
      kind: 'deathScatter', x, y, elite,
      color: color ?? C.bone, shards,
      dur: elite ? 760 : 560,
    });
  }

  // 经验粒子被吸收：极短的青色小环，给「吸进去了」一个落点，不刷文字。
  expPop(x, y) {
    this.push({ kind: 'expPop', x, y, dur: 180 });
  }

  // 连斩上报：n>=2 才显示，1.5 秒内没有新击杀自动消失
  killStreak(n) {
    if (!Number.isFinite(n) || n < 2) { this.streak.n = 0; return; }
    this.streak.n = n;
    this.streak.until = this.clock + 1500;
  }

  // 轻量死亡爆点：白闪菱形 + 6 枚骨屑，方向用坐标做确定性抖动（不用 Math.random）
  drawKillBurst(g, it, k, a) {
    const x = Math.round(it.x);
    const y = Math.round(it.y);
    if (k < 0.35) {
      const s = 2 + Math.round(k * 6);
      pxDiamond(g, x, y, s + 1, C.outline, a * 0.9, false);
      pxDiamond(g, x, y, s, it.color, a, false);
      pxRect(g, x - 1, y, 3, 1, C.white, a);
      pxRect(g, x, y - 1, 1, 3, C.white, a);
    }
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2 + (it.x * 0.013) % 1;
      const dist = 3 + k * 13;
      pxRect(g, Math.round(x + Math.cos(ang) * dist), Math.round(y + Math.sin(ang) * dist) - Math.round(k * k * 4), 1, 1, it.color, a * 0.85);
    }
  }

  // 伤害数字：小字号上浮，重击用黄铜色并放大一点。
  // 只给 ≤3 目标的单体命中用，避免范围法术一次糊满屏数字。
  damageNumber(x, y, amount, color = HEX.white, heavy = false) {
    const n = Math.max(0, Math.round(Number(amount) || 0));
    if (!n) return;
    const jitter = ((n * 37) % 7) - 3;
    const obj = addText(this.scene, Math.round(x) + jitter, Math.round(y), String(n), heavy ? 9 : 8, color)
      .setOrigin(0.5, 1).setDepth(916);
    this.texts.push({ obj, y0: Math.round(y), t: 0, dur: 620, rise: heavy ? 18 : 14, pop: true });
  }

  // 受击火花：白核 + 沿命中来向反向喷出的 4 条定向火星 + 扩散冲击环。
  drawHitSpark(g, it, k, a) {
    const x = Math.round(it.x);
    const y = Math.round(it.y);
    const { nx, ny, power } = it;
    const tx = -ny;
    const ty = nx;
    if (k < 0.55) {
      pxDiamond(g, x, y, 3 + Math.round(2 * a), C.outline, a * 0.9, false);
      pxDiamond(g, x, y, 2 + Math.round(2 * a), C.white, a, true);
    }
    for (let i = 0; i < 4; i++) {
      const off = (i - 1.5) * 0.55;
      const dirX = -nx + tx * off;
      const dirY = -ny + ty * off;
      const dl = Math.hypot(dirX, dirY) || 1;
      const ux = dirX / dl;
      const uy = dirY / dl;
      const d0 = 2 + 12 * k;
      const len = (3 + 8 * power) * (1 - k * 0.35);
      const x0 = Math.round(x + ux * d0);
      const y0 = Math.round(y + uy * d0);
      const x1 = Math.round(x + ux * (d0 + len));
      const y1 = Math.round(y + uy * (d0 + len));
      pxLine(g, x0, y0 + 1, x1, y1 + 1, C.outline, a * 0.85, 1);
      pxLine(g, x0, y0, x1, y1, i === 0 ? C.white : it.color, a, 1);
    }
    pxRing(g, x, y, 2 + Math.round(9 * k), it.color, a * 0.75, 2);
  }

  // 爆散：首帧白闪十字 + 扩散冲击环 + 抛物线碎片 + 贴地骨屑。
  drawDeathScatter(g, it, k, a) {
    const x = Math.round(it.x);
    const y = Math.round(it.y);
    const t = k * (it.dur / 1000);
    // 首帧白闪只留 ~70ms：够亮，但不盖住后面飞出来的碎片
    if (k < 0.12) {
      const f = 1 - k / 0.12;
      pxDiamond(g, x, y, 4 + Math.round(8 * k), C.outline, 0.8 * f, false);
      pxDiamond(g, x, y, 3 + Math.round(6 * k), C.white, 0.95 * f, true);
      pxRect(g, x - 11, y, 23, 1, C.white, 0.7 * f);
      pxRect(g, x, y - 11, 1, 23, C.white, 0.7 * f);
    }
    const ring = Math.min(1, Math.max(0, (k - 0.03) / 0.5));
    if (ring > 0 && ring < 1) {
      pxDiamond(g, x, y, 5 + Math.round(26 * ring), it.elite ? C.brassLight : C.white, (1 - ring) * 0.4, false);
    }
    for (const s of it.shards) {
      const px = x + s.vx * t;
      const py = y + s.vy * t + 0.5 * s.gravity * t * t;
      if (py > y + 52) continue; // 沉到地面线以下就不画
      const sx = Math.round(px);
      const sy = Math.round(py);
      pxRect(g, sx, sy, s.size, s.size, C.outline, a * 0.9);
      pxRect(g, sx, sy, Math.max(1, s.size - 1), Math.max(1, s.size - 1), s.color, a);
    }
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2 + 0.4;
      const dist = 3 + 20 * k;
      pxRect(g, Math.round(x + Math.cos(ang) * dist), Math.round(y + 6 + Math.sin(ang) * dist * 0.35), 1, 1, C.fog, a * 0.35);
    }
  }

  // 经验吸收：小环从 2px 扩到 7px 后消失。
  drawExpPop(g, it, k, a) {
    const x = Math.round(it.x);
    const y = Math.round(it.y);
    pxDiamond(g, x, y, 2 + Math.round(5 * k), C.teal, a * 0.8, false);
    pxRect(g, x, y, 1, 1, C.white, a);
  }

  // 待机环：不指向任何方向，只说明这一格「看到目标前不出手」。
  drawHold(g, it, k, a) {
    const x = Math.round(it.x);
    const y = Math.round(it.y);
    pxRing(g, x, y, 3 + Math.round(7 * k), it.color, 0.5 * a, 2);
    pxDiamond(g, x, y, 3, C.outline, 0.5 * a, false);
    pxDiamond(g, x, y, 2, it.color, 0.45 * a, false);
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
        // 起点法杖、终点目标：两端都是世界坐标，统一按镜头换算到屏幕
        const fx = sx(it.from.x); const fy = sy(it.from.y);
        const tx = sx(it.to.x); const ty = sy(it.to.y);
        // 法杖上方的施法光柱（世界层直接画，随镜头滚动）
        // 施法光柱：暗描边槽 + 本色芯（硬边双线，替代旧柔光叠层）
        const bx = Math.round(it.from.x);
        const by = Math.round(it.from.y);
        pxRect(g, bx - 1, by - 26, 3, 26, C.outline, 0.85 * a);
        pxRect(g, bx, by - 24, 1, 22, color, a);
        pxRect(g, bx, by - 29, 1, 4, C.white, 0.9 * a);
        // 主光迹：从法杖指向目标方位。空区也画，只是终点是区域中心。
        // 主光迹：暗描边底 + 本色主线（双线硬边）
        pxLine(sg, fx, fy + 1, tx, ty + 1, C.outline, 0.75 * a, 1);
        pxLine(sg, fx, fy, tx, ty, color, 0.95 * a, 1);
        // 流动亮段：让「哪一下在飞」有明确的指向感
        const flow = (this.clock / 420) % 1;
        for (let s = 0; s < 5; s++) {
          const u = (flow + s * 0.035) % 1;
          const px = fx + (tx - fx) * u;
          const py = fy + (ty - fy) * u;
          pxRect(sg, Math.round(px) - 1, Math.round(py) - 1, 3, 3, C.outline, 0.9 * a);
          pxRect(sg, Math.round(px), Math.round(py), 2, 2, color, a);
        }
        // 终点标记：命中目标为实心菱形，空射为空心加十字
        pxDiamond(sg, tx, ty, 5, C.outline, 0.95 * a, false);
        pxDiamond(sg, tx, ty, 4, color, a, false);
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
        pxLine(sg, it.from.x, it.from.y + 1, it.mid.x, it.mid.y + 1, C.outline, 0.8 * a, 1);
        pxLine(sg, it.mid.x, it.mid.y + 1, it.to.x, it.to.y + 1, C.outline, 0.8 * a, 1);
        pxLine(sg, it.from.x, it.from.y, it.mid.x, it.mid.y, C.teal, a, 1);
        pxLine(sg, it.mid.x, it.mid.y, it.to.x, it.to.y, C.teal, a, 1);
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
          pxLine(sg, x0, y0 + 1, x1, y1 + 1, C.outline, 0.85 * a, 1);
          pxLine(sg, x0, y0, x1, y1, C.teal, a, 1);
        }
        pxDiamond(sg, it.to.x, it.to.y, 4, C.teal, a, false);
      } else if (it.kind === 'dissipate') {
        for (let ring = 0; ring < 3; ring++) {
          const rk = Math.max(0, Math.min(1, k - ring * 0.12));
          if (rk <= 0) continue;
          const rr = 3 + rk * (12 + ring * 3);
          pxDiamond(sg, it.x, it.y, rr + 1, C.outline, (1 - rk) * 0.9, false);
          pxDiamond(sg, it.x, it.y, rr, it.color, (1 - rk) * 0.85, false);
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
          // 联组链带：brassDark 3px 底 + brass 1px 亮线（硬边双线，与素材描边语言一致）
          pxLine(sg, p0.x, p0.y, p1.x, p1.y, C.brassDark, a, 3);
          pxLine(sg, p0.x, p0.y, p1.x, p1.y, C.brass, a, 1);
          if (bright) pxLine(sg, p0.x, p0.y, p1.x, p1.y, C.white, 0.95, 1);
        }
        for (const p of it.centers) {
          pxDiamond(sg, p.x, p.y, 5, C.outline, a, false);
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
      } else if (it.kind === 'spellCast') {
        drawCastFx(g, it.defId, { x: it.x, y: it.y, angle: it.angle, k, clock: this.clock });
      } else if (it.kind === 'spellImpact') {
        drawImpactFx(g, it.defId, {
          x: it.x, y: it.y, k, clock: this.clock, radius: it.radius, angle: it.angle ?? 0,
        });
      } else if (it.kind === 'spellWard') {
        const p = this.scene.player;
        drawWardFx(g, it.defId, {
          x: p?.x ?? it.x, y: p?.y ?? it.y, k, clock: this.clock, radius: it.radius,
        });
      } else if (it.kind === 'spellLink') {
        drawLinkFx(g, it.defId, { from: it.from, to: it.to, k, clock: this.clock, index: it.index });
      } else if (it.kind === 'spellStrike') {
        const fn = STRIKE_DRAW[it.defId];
        if (fn) fn(g, { x: it.x, y: it.y, k, clock: this.clock, radius: it.radius, angle: it.angle });
      } else if (it.kind === 'vignette') {
        // 暗角脉冲：四边硬边黑框，先压力后回弹（峰值在 k≈0.18）
        const s = it.strength * Math.sin(Math.min(1, k / 0.55) * Math.PI * 0.5) * (1 - k * 0.55);
        const vh = Math.round(26 * s);
        const vw = Math.round(34 * s);
        if (vh > 0) {
          pxRect(vg, 0, 0, 480, vh, C.void, 0.42 * s);
          pxRect(vg, 0, 270 - vh, 480, vh, C.void, 0.42 * s);
        }
        if (vw > 0) {
          pxRect(vg, 0, 0, vw, 270, C.void, 0.34 * s);
          pxRect(vg, 480 - vw, 0, vw, 270, C.void, 0.34 * s);
        }
        // 四角加重，读作「镜头收了一下」
        const cs = Math.round(18 * s);
        pxRect(vg, 0, 0, cs, cs, C.void, 0.3 * s);
        pxRect(vg, 480 - cs, 0, cs, cs, C.void, 0.3 * s);
        pxRect(vg, 0, 270 - cs, cs, cs, C.void, 0.3 * s);
        pxRect(vg, 480 - cs, 270 - cs, cs, cs, C.void, 0.3 * s);
      } else if (it.kind === 'killBurst') {
        this.drawKillBurst(g, it, k, a);
      } else if (it.kind === 'deathScatter') {
        this.drawDeathScatter(g, it, k, a);
      } else if (it.kind === 'expPop') {
        this.drawExpPop(g, it, k, a);
      } else if (it.kind === 'hitSpark') {
        this.drawHitSpark(g, it, k, a);
      } else if (it.kind === 'hold') {
        this.drawHold(g, it, k, a);
      } else if (it.kind === 'impact') {
        const rr = 2 + k * 5;
        // 命中：描边菱形扩张 + 本色环 + 白核十字
        pxDiamond(g, it.x, it.y, rr + 1, C.outline, 0.9 * a, false);
        pxDiamond(g, it.x, it.y, rr, it.color, a, false);
        const hx = Math.round(it.x);
        const hy = Math.round(it.y);
        pxRect(g, hx - 1, hy, 3, 1, C.white, a);
        pxRect(g, hx, hy - 1, 1, 3, C.white, a);
        for (let s = 0; s < 4; s++) {
          const ang = (s / 4) * Math.PI * 2 + Math.PI / 4;
          const dist = 3 + k * 12;
          pxRect(g, Math.round(it.x + Math.cos(ang) * dist), Math.round(it.y + Math.sin(ang) * dist), 1, 1, it.color, a * 0.8);
        }
      } else if (it.kind === 'burst') {
        for (const p of it.particles) {
          const px = it.x + p.dx * k * 2.2;
          const py = it.y + p.dy * k * 2.2 + k * k * 8;
          const qx = Math.round(px);
          const qy = Math.round(py);
          pxRect(g, qx - 1, qy - 1, 3, 3, C.outline, a);
          pxRect(g, qx, qy, 1, 1, it.color, a);
        }
      } else if (it.kind === 'hurt') {
        // 受击红边：分段硬边，不闪全屏
        const aa = a * 0.8;
        // 受击红边：blood 4px 外带 + bloodDark 2px 内衬（双线硬边，不闪全屏）
        pxRect(vg, 0, 20, 480, 4, C.blood, aa);
        pxRect(vg, 0, 266, 480, 4, C.blood, aa);
        pxRect(vg, 0, 20, 4, 250, C.blood, aa);
        pxRect(vg, 476, 20, 4, 250, C.blood, aa);
        pxRect(vg, 0, 24, 480, 2, C.bloodDark, aa);
        pxRect(vg, 0, 264, 480, 2, C.bloodDark, aa);
        pxRect(vg, 4, 20, 2, 250, C.bloodDark, aa);
        pxRect(vg, 474, 20, 2, 250, C.bloodDark, aa);
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

    // 连斩字幕
    const st = this.streak;
    if (st.n >= 2 && this.clock < st.until) {
      if (st.shown !== st.n) {
        st.shown = st.n;
        this.streakLabel.setText('连斩 ×' + st.n);
        this.streakLabel.setColor(st.n >= 40 ? HEX.white : st.n >= 20 ? HEX.arcaneLight : HEX.brassLight);
      }
      this.streakLabel.setVisible(true).setAlpha(Math.min(1, (st.until - this.clock) / 380));
      this.streakLabel.setScale(st.n >= 20 ? 1.12 : 1);
    } else if (st.shown !== -1) {
      st.shown = -1;
      this.streakLabel.setVisible(false);
    }

    // 漂浮文字（拾取、起点迁移等）
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const tx = this.texts[i];
      tx.t += dtMs;
      const k = Math.min(1, tx.t / tx.dur);
      tx.obj.y = tx.y0 - (tx.rise ?? 12) * k;
      tx.obj.setAlpha(1 - k);
      if (tx.pop) tx.obj.setScale(1 + 0.28 * Math.max(0, 1 - k * 4));
      if (k >= 1) {
        tx.obj.destroy();
        this.texts.splice(i, 1);
      }
    }
  }
}
