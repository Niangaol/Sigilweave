import { C, pxRect, pxLine, pxDiamond, pxRing } from '../ui/Palette.js';
import { createBossModel, stepBoss } from '../logic/boss.js';

export default class Boss {
  constructor(scene, definition, act, id) {
    this.scene = scene; this.definition = definition; this.id = id; this.isBoss = true;
    this.x = 240; this.y = 72; this.radius = 14;
    this.hp = this.maxHp = 80 + act * 40; this.armor = 0;
    this.alive = true; this.rewarded = false; this.damage = 12; this.hitAt = -9999;
    this.model = createBossModel(act);
    this.g = scene.add.graphics().setDepth(200);
    this.draw(0);
  }
  update(dtMs, now) {
    if (!this.alive) return;
    const p = this.scene.player;
    const dx = p.x - this.x, dy = p.y - this.y, d = Math.hypot(dx, dy);
    let factor = now < (this.slowUntil ?? 0) ? (this.slowFactor ?? 1) : 1;
    if (this.scene.grid.cells.some(c => c.unlocked && c.slot?.defId === 'slow_field') && d <= 90) factor = Math.min(factor, 0.6);
    if (now < (this.rootUntil ?? 0)) factor = 0;
    if (d > 55 && this.model.windupLeft <= 0) {
      this.x += dx / d * 14 * factor * dtMs / 1000;
      this.y += dy / d * 14 * factor * dtMs / 1000;
    }
    this.x = Math.max(28, Math.min(452, this.x)); this.y = Math.max(42, Math.min(246, this.y));
    for (const shot of stepBoss(this.model, dtMs, this, p)) this.scene.addHostileShot(shot);
    this.draw(now);
    this.g.setDepth(Math.floor(this.y));
  }
  draw(now) {
    const g = this.g; g.clear();
    const x = Math.round(this.x), y = Math.round(this.y), flash = now - this.hitAt < 100;
    if (this.model.windupLeft > 0 && this.model.aim) {
      const aim = this.model.aim;
      pxLine(g, x, y, aim.x, aim.y, C.blood, 0.65);
      pxRing(g, aim.x, aim.y, 14, C.blood, 0.9, 1);
    }
    pxRect(g, x - 14, y + 12, 28, 3, C.void, 0.6);
    pxRect(g, x - 11, y - 9, 22, 21, flash ? C.white : C.stoneLight);
    pxRect(g, x - 8, y - 15, 16, 8, flash ? C.white : C.bone);
    pxRect(g, x - 7, y - 12, 4, 3, C.rot); pxRect(g, x + 3, y - 12, 4, 3, C.rot);
    for (const dx of [-10, -3, 4]) pxRect(g, x + dx, y - 19, 3, 5, C.brassDark);
    pxRect(g, x - 16, y - 5, 5, 15, C.stone); pxRect(g, x + 11, y - 5, 5, 15, C.stone);
    pxRect(g, x - 9, y + 9, 6, 9, C.stoneDark); pxRect(g, x + 3, y + 9, 6, 9, C.stoneDark);
    pxDiamond(g, x, y, 4, C.rot, 1, true); pxRect(g, x - 1, y - 1, 2, 2, C.teal);
    pxRect(g, x - 17, y - 26, 34, 3, C.nightDeep);
    pxRect(g, x - 17, y - 26, Math.max(0, Math.round(34 * this.hp / this.maxHp)), 2, C.blood);
  }
  destroy() { this.g.destroy(); }
}
