import { C, pxRect, pxLine, pxDiamond, pxRing } from '../ui/Palette.js';
import { createBossModel, stepBoss } from '../logic/boss.js';

// 小 Boss（守墓傀儡）用石像鬼素材，幕 Boss 用巫妖素材；脚底对齐旧程序化美术的 y+21
const BOSS_TEXTURE = { mini: 'gargoyle', final: 'lich' };
const BOSS_FEET = 21;

export default class Boss {
  constructor(scene, definition, act, id) {
    this.scene = scene; this.definition = definition; this.id = id; this.isBoss = true;
    this.x = 240; this.y = 72; this.radius = 14;
    this.hp = this.maxHp = 80 + act * 40; this.armor = 0;
    this.alive = true; this.rewarded = false; this.damage = 12; this.hitAt = -9999;
    this.model = createBossModel(act);
    this.g = scene.add.graphics().setDepth(200);
    // 素材精灵：tier=mini 的石卫用石像鬼，其余幕 Boss 用巫妖
    const texKey = BOSS_TEXTURE[definition?.tier === 'mini' ? 'mini' : 'final'];
    this.sprite = scene.textures?.exists(texKey) && typeof scene.add?.sprite === 'function'
      ? scene.add.sprite(Math.round(this.x), Math.round(this.y) + BOSS_FEET, texKey).setOrigin(0.5, 1)
      : null;
    if (this.sprite) this.sprite.setDepth(Math.floor(this.y));
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
    const W = this.scene.world ?? { w: 480, h: 270 };
    this.x = Math.max(28, Math.min(W.w - 28, this.x));
    this.y = Math.max(42, Math.min(W.h - 28, this.y));
    for (const shot of stepBoss(this.model, dtMs, this, p)) this.scene.addHostileShot(shot);
    this.draw(now);
    this.g.setDepth(Math.floor(this.y) + 0.5);
    if (this.sprite) this.sprite.setDepth(Math.floor(this.y));
  }
  draw(now) {
    const x = Math.round(this.x), y = Math.round(this.y), flash = now - this.hitAt < 100;
    const g = this.g; g.clear();
    // 预警：读条瞄准线 + 落点环（程序化，保持既有手感）
    if (this.model.windupLeft > 0 && this.model.aim) {
      const aim = this.model.aim;
      pxLine(g, x, y, aim.x, aim.y, C.blood, 0.65);
      pxRing(g, aim.x, aim.y, 14, C.blood, 0.9, 1);
    }
    if (this.sprite) {
      const s = this.sprite;
      s.setPosition(x, y + BOSS_FEET);
      s.setVisible(this.alive);
      if (flash) s.setTintFill(0xffffff); else s.clearTint();
      // 血条（旧版在头顶 -26 处，素材更高，改到精灵头顶上方）
      const top = Math.round(y + BOSS_FEET - s.displayHeight);
      pxRect(g, x - 17, top - 8, 34, 3, C.nightDeep);
      pxRect(g, x - 17, top - 8, Math.max(0, Math.round(34 * this.hp / this.maxHp)), 2, C.blood);
      return;
    }
    // ---------- 程序化回退（素材缺失时，行为与旧版一致） ----------
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
  destroy() { this.sprite?.destroy(); this.g.destroy(); }
}
