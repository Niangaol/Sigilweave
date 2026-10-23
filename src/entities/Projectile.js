// 符印弹丸：从法阵格飞向战场方位目标，带硬边拖尾与轻微上抛弧线
import { C, pxRect, pxDiamond } from '../ui/Palette.js';

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
    this.targetEnemy = targetEnemy;
    this.elapsed = 0;
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
    // 发射时固定落点；移动目标可以躲开，不因玩家或目标移动追踪。
    const k = Math.min(1, this.elapsed / this.duration);
    this.x = this.sx + (this.tx - this.sx) * k;
    this.y = this.sy + (this.ty - this.sy) * k - Math.sin(k * Math.PI) * 10;
    this.trail.push({ x: this.x, y: this.y });
    if (this.trail.length > 5) this.trail.shift();
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
    // 拖尾：由暗到亮的小像素
    for (let i = 0; i < this.trail.length; i++) {
      const p = this.trail[i];
      const a = 0.08 + (i / this.trail.length) * 0.3;
      pxRect(g, p.x - 1, p.y - 1, 2, 2, this.def.color, a);
    }
    // 外晕与弹芯
    pxRect(g, x - 3, y - 3, 7, 7, this.def.color, 0.14);
    pxRect(g, x - 2, y - 2, 5, 5, this.def.color, 0.35);
    pxRect(g, x - 1, y - 1, 3, 3, this.def.color, 1);
    pxRect(g, x - 1, y - 1, 1, 1, C.white, 1);
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
