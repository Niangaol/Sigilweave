// 经验粒子：击杀小怪时从爆散中心飞出来的青色能量点，炸散一小段后主动扑向玩家，
// 碰到玩家才把经验记到账上（替代旧版「击杀瞬间直接加经验」和抽象的经验珠）。
// 关键约束：
// - 坐标、方向、相位全部用击杀位置确定性推导，不用 Math.random，回放/截图可复现；
// - 追踪阶段从任意距离都朝玩家飞，不会出现「走远了经验捡不到」；
// - 只负责运动与绘制，经验入账由 BattleScene 在 updateExpMotes 里结算。
import { C, pxRect, pxDiamond } from '../ui/Palette.js';

export const EXP_MOTE = Object.freeze({
  scatterMs: 260,     // 先像碎片一样向外炸散
  homingAccel: 900,   // 追踪阶段加速度（px/s²）
  homingSpeed: 260,   // 追踪阶段速度上限（px/s）
  pickRadius: 11,     // 进入这个半径算被玩家吸收
  drag: 2.2,          // 炸散阶段空气阻力
  gravity: 120,       // 炸散阶段轻微下坠
});

export default class ExpMote {
  constructor(scene, x, y, value = 1, mul = 1) {
    this.scene = scene;
    this.g = scene.add.graphics();
    this.revive(x, y, value, mul);
  }

  // 池化复用：重置位置/速度/阶段
  revive(x, y, value = 1, mul = 1) {
    this.x = Number.isFinite(x) ? x : 0;
    this.y = Number.isFinite(y) ? y : 0;
    this.value = Number.isFinite(value) && value > 0 ? value : 1;
    this.mul = Number.isFinite(mul) && mul > 0 ? mul : 1;
    this.alive = true;
    this.t = 0;
    this.homing = false;
    // 确定性炸散方向：相邻坐标也会错开，但同一只怪重播结果一致
    this.phase = (this.x * 13 + this.y * 7) % 100;
    const ang = ((this.x * 7 + this.y * 11 + this.value * 37) % 360) * (Math.PI / 180);
    const speed = 55 + ((Math.abs(this.x) + Math.abs(this.y)) % 40);
    this.vx = Math.cos(ang) * speed;
    this.vy = Math.sin(ang) * speed - 22; // 略微上抛，读作「爆出来的」
    if (this.g) { this.g.setVisible(true); this.draw(); }
  }

  // 返回 true 表示被玩家吸收
  update(dtMs, player) {
    if (!this.alive) return false;
    const dt = Math.max(0, Number.isFinite(dtMs) ? dtMs : 0) / 1000;
    this.t += dt * 1000;
    if (this.t < EXP_MOTE.scatterMs) {
      // 炸散：阻尼 + 重力，像碎片一样先飞出去
      const k = Math.exp(-EXP_MOTE.drag * dt);
      this.vx *= k;
      this.vy = this.vy * k + EXP_MOTE.gravity * dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
    } else {
      this.homing = true;
      const px = Number.isFinite(player?.x) ? player.x : this.x;
      const py = Number.isFinite(player?.y) ? player.y : this.y;
      const dx = px - this.x;
      const dy = py - this.y;
      const dist = Math.hypot(dx, dy) || 1;
      this.vx += (dx / dist) * EXP_MOTE.homingAccel * dt;
      this.vy += (dy / dist) * EXP_MOTE.homingAccel * dt;
      const speed = EXP_MOTE.homingSpeed;
      const mag = Math.hypot(this.vx, this.vy) || 1;
      if (mag > speed) {
        this.vx = (this.vx / mag) * speed;
        this.vy = (this.vy / mag) * speed;
      }
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      if (dist < EXP_MOTE.pickRadius && player?.alive) {
        this.alive = false;
        return true;
      }
    }
    this.draw();
    return false;
  }

  draw() {
    const g = this.g;
    g.clear();
    const x = Math.round(this.x);
    const y = Math.round(this.y);
    const pulse = Math.floor(this.t / 70 + this.phase) % 2;
    // 拖尾：沿速度反方向两段残影，读作「在飞」
    const sp = Math.hypot(this.vx, this.vy) || 1;
    const ux = this.vx / sp;
    const uy = this.vy / sp;
    for (let i = 1; i <= 2; i++) {
      pxRect(g, Math.round(x - ux * i * 2), Math.round(y - uy * i * 2), 1, 1, C.teal, 0.4 / i);
    }
    // 外圈微光 + 青绿本体 + 白核：比碎片更亮，和掉落碎片区分
    pxDiamond(g, x, y, pulse ? 4 : 3, C.teal, 0.22, false);
    pxDiamond(g, x, y, pulse ? 2 : 1, C.teal, 0.95, true);
    pxRect(g, x, y, 1, 1, C.white, 1);
    g.setDepth(Math.floor(this.y) + 0.6);
  }

  deactivate() {
    this.alive = false;
    this.g?.clear();
    this.g?.setVisible(false);
  }

  destroy() {
    this.deactivate();
    this.g?.destroy();
  }
}
