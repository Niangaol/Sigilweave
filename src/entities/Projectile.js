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
    // 目标还活着就跟随它的当前位置：固定落点几乎打不中移动的怪（实测手感问题）
    if (this.targetEnemy && this.targetEnemy.alive) {
      this.tx = this.targetEnemy.x;
      this.ty = this.targetEnemy.y;
    }
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
    const col = this.def.color;

    // 拖尾：离散像素点三档（越旧越小越暗），不用连续 alpha —— 对齐素材的硬色块语言
    const n = this.trail.length;
    for (let i = 0; i < n; i++) {
      const p = this.trail[i];
      const k = n > 1 ? i / (n - 1) : 1;      // 0=最旧 1=最新
      const px = Math.round(p.x);
      const py = Math.round(p.y);
      if (k > 0.66) {
        // 近端：2×2 本体色，带暗描边角
        pxRect(g, px - 1, py - 1, 2, 2, col, 1);
        pxRect(g, px - 2, py, 1, 1, C.outline, 1);
        pxRect(g, px + 1, py, 1, 1, C.outline, 1);
      } else if (k > 0.33) {
        pxRect(g, px, py, 1, 1, col, 1);
      } else {
        // 远端：暗色残影
        pxRect(g, px, py, 1, 1, C.outline, 1);
      }
    }

    // 弹体三层：外菱形描边 → 本体 → 亮芯（与角色素材同一套「描边+本体+高光」）
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
