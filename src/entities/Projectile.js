// 符印弹丸：运动学在本地，外观全部交给 src/ui/spell-fx.js 的每法术描述。
// 16 个法术各有自己的飞行体形状、拖尾材质与主色；未知 id 回退旧菱形，保证不会白屏。
import { C, pxRect, pxDiamond } from '../ui/Palette.js';
import { fxFor, drawProjectileFx, drawTrailFx } from '../ui/spell-fx.js';

export default class Projectile {
  constructor(scene, fromX, fromY, aimX, aimY, def, targetEnemy) {
    this.scene = scene;
    this.g = scene.add.graphics().setDepth(850);
    this.revive(fromX, fromY, aimX, aimY, def, targetEnemy);
  }

  // 池化复用：重置所有运行时字段并重新显示
  revive(fromX, fromY, aimX, aimY, def, targetEnemy) {
    this.x = fromX;
    this.y = fromY;
    this.sx = fromX;
    this.sy = fromY;
    this.tx = aimX;
    this.ty = aimY;
    this.def = def;
    this.defId = def?.id ?? null;
    this.fx = fxFor(this.defId);
    this.trailMax = this.fx?.trail?.max ?? 5;
    this.targetEnemy = targetEnemy;
    this.elapsed = 0;
    this.clock = 0;
    this.k = 0;
    this.angle = Math.atan2(aimY - fromY, aimX - fromX);
    this.distance = Math.max(8, Math.hypot(aimX - fromX, aimY - fromY));
    this.duration = Math.max(160, (this.distance / def.speed) * 1000);
    this.alive = true;
    this.trail = [];
    if (this.g) { this.g.setVisible(true); this.draw(); }
  }

  // 返回 true 表示已经抵达落点
  update(dtMs) {
    if (!this.alive) return false;
    this.elapsed += dtMs;
    this.clock += dtMs;
    // 目标还活着就跟随它的当前位置：固定落点几乎打不中移动的怪（实测手感问题）
    if (this.targetEnemy && this.targetEnemy.alive) {
      this.tx = this.targetEnemy.x;
      this.ty = this.targetEnemy.y;
    }
    const prevX = this.x;
    const prevY = this.y;
    const k = Math.min(1, this.elapsed / this.duration);
    this.k = k;
    this.x = this.sx + (this.tx - this.sx) * k;
    this.y = this.sy + (this.ty - this.sy) * k - Math.sin(k * Math.PI) * 10;
    const dx = this.x - prevX;
    const dy = this.y - prevY;
    if (dx * dx + dy * dy > 0.02) this.angle = Math.atan2(dy, dx);
    this.trail.push({ x: this.x, y: this.y });
    if (this.trail.length > this.trailMax) this.trail.shift();
    this.draw();
    if (k >= 1) {
      this.alive = false;
      return true;
    }
    return false;
  }

  draw() {
    const g = this.g;
    g.clear();
    const x = Math.round(this.x);
    const y = Math.round(this.y);
    const col = this.def?.color ?? C.arcane;

    // 已知法术：交给 spell-fx 画拖尾 + 飞行体（形状/材质各法术不同）
    if (this.fx?.id && this.defId) {
      const ctx = { x, y, angle: this.angle, k: this.k, clock: this.clock, trail: this.trail };
      drawTrailFx(g, this.defId, ctx);
      drawProjectileFx(g, this.defId, ctx);
      return;
    }

    // 兜底：旧版菱形 + 离散拖尾（辅助卡或未来新 id 不会变成空白弹丸）
    const n = this.trail.length;
    for (let i = 0; i < n; i++) {
      const p = this.trail[i];
      const k = n > 1 ? i / (n - 1) : 1;
      const px = Math.round(p.x);
      const py = Math.round(p.y);
      if (k > 0.66) {
        pxRect(g, px - 1, py - 1, 2, 2, col, 1);
        pxRect(g, px - 2, py, 1, 1, C.outline, 1);
        pxRect(g, px + 1, py, 1, 1, C.outline, 1);
      } else if (k > 0.33) {
        pxRect(g, px, py, 1, 1, col, 1);
      } else {
        pxRect(g, px, py, 1, 1, C.outline, 1);
      }
    }
    pxDiamond(g, x, y, 3, C.outline, 1, false);
    pxDiamond(g, x, y, 2, col, 1, true);
    pxRect(g, x - 1, y - 1, 1, 1, C.white, 1);
    pxRect(g, x, y, 1, 1, C.arcaneLight, 1);
  }

  deactivate() {
    this.alive = false;
    this.g.clear();
    this.g.setVisible(false);
  }

  destroy() {
    this.deactivate();
    this.g.destroy();
  }
}
