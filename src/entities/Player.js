// 玩家：手动走位、受击无敌帧。
// 身体用素材精灵表（player_sheet.png，32px，12 帧横排），法杖与地面投影仍走 Graphics：
// 法杖尖端必须与 staffTipOf 严格对齐——所有法术特效从这里起手（见 docs/staff-origin.png）。
import { C, pxRect } from '../ui/Palette.js';
import { PLAYER } from '../data/roster.js';

// 法杖尖端（世界坐标）：所有法术特效的统一出发位置。
// 与 drawStaff() 里的杖身像素严格对齐：杖头在朝向侧 +6/-7，尖端在头顶上方 15px。
export function staffTipOf(x, y, facing) {
  return { x: facing > 0 ? x + 6 : x - 7, y: y - 15 };
}

// 素材角色高 32px，脚底落在逻辑坐标 y+7（与旧程序化美术的脚底一致）
const FEET_OFFSET = 7;

export default class Player {
  constructor(scene, x, y) {
    this.scene = scene;
    this.x = x;
    this.y = y;
    this.hp = PLAYER.hp;
    this.shield = 0;
    this.maxHp = PLAYER.hp;
    this.radius = PLAYER.radius;
    this.alive = true;
    // 人物宝箱增益：额外受击无敌时间，单位「秒」；默认 0 时行为与旧版完全一致。
    this.iframesBonus = 0;
    this.invulnUntil = 0;
    this.hurtAt = -9999;
    this.walkPhase = 0;
    this.facing = 1;
    this.moving = false;
    this.g = scene.add.graphics().setDepth(y);
    // 素材精灵：未就位时保持 null，draw() 自动降级为程序化绘制（接口与手感不变）
    this.sprite = scene.textures?.exists('player') && typeof scene.add?.sprite === 'function'
      ? scene.add.sprite(Math.round(x), Math.round(y) + FEET_OFFSET, 'player').setOrigin(0.5, 1)
      : null;
    if (this.sprite) {
      this.sprite.setDepth(y);
      this.sprite.play('player-idle');
    }
  }

  // dx/dy 为 -1..1 的输入轴；斜向在这里归一化
  update(dtMs, dx, dy, bounds, now) {
    this.moving = dx !== 0 || dy !== 0;
    if (this.moving) {
      const len = Math.hypot(dx, dy) || 1;
      const vx = (dx / len) * PLAYER.speed;
      const vy = (dy / len) * PLAYER.speed;
      this.x += (vx * dtMs) / 1000;
      this.y += (vy * dtMs) / 1000;
      this.walkPhase += dtMs;
      if (dx !== 0) this.facing = dx > 0 ? 1 : -1;
    }
    this.x = Math.min(bounds.right, Math.max(bounds.left, this.x));
    this.y = Math.min(bounds.bottom, Math.max(bounds.top, this.y));
    this.draw(now);
    this.g.setDepth(Math.floor(this.y) + 0.5);
  }

  // 返回是否真的吃到伤害（无敌帧内返回 false）
  takeDamage(amount, now) {
    if (!this.alive) return false;
    if (now < this.invulnUntil) return false;
    // 人物宝箱「坚韧余辉」以秒为单位累加；非法/负数按 0 处理，默认仍是 900ms。
    const bonusMs = Number.isFinite(this.iframesBonus) && this.iframesBonus > 0
      ? this.iframesBonus * 1000
      : 0;
    const shield = Number.isFinite(this.shield) && this.shield > 0 ? this.shield : 0;
    const absorbed = Math.min(shield, Math.max(0, amount));
    this.shield = shield - absorbed;
    this.hp = Math.max(0, this.hp - Math.max(0, amount - absorbed));
    this.invulnUntil = now + PLAYER.iframesMs + bonusMs;
    this.hurtAt = now;
    if (this.hp <= 0) this.alive = false;
    return true;
  }

  // 法杖尖端（世界坐标）：弹丸、光迹、起手微粒都从这里出发
  staffTip() {
    return staffTipOf(this.x, this.y, this.facing);
  }

  draw(now) {
    const flash = now - this.hurtAt < PLAYER.hurtFlashMs;
    const blink = now < this.invulnUntil && Math.floor(now / 90) % 2 === 0;
    const x = Math.round(this.x);
    const y = Math.round(this.y);
    if (this.sprite) {
      this.drawSprite(now, x, y, flash, blink);
    } else {
      this.drawProcedural(now, x, y, flash, blink);
    }
  }

  // ---------- 素材表现 ----------
  drawSprite(now, x, y, flash, blink) {
    const s = this.sprite;
    s.setPosition(x, y + FEET_OFFSET);
    s.setDepth(Math.floor(y));
    s.setFlipX(this.facing < 0);
    s.setAlpha(blink ? 0.45 : 1);
    if (!this.alive) {
      // 死亡：停在受击末帧并压暗，读作“倒下”
      s.anims.stop();
      s.setFrame(11);
      s.setTintFill(0x241f33);
    } else if (flash) {
      s.setTintFill(0xffffff);
      if (s.anims.currentAnim?.key !== 'player-hurt') s.play('player-hurt', true);
    } else {
      s.clearTint();
      if (now < this.invulnUntil) {
        // 无敌帧：冲刺姿势 + 明暗闪烁，把“撞不动”演出来
        s.anims.stop();
        s.setFrame(7);
      } else if (this.moving) {
        if (s.anims.currentAnim?.key !== 'player-walk') s.play('player-walk', true);
      } else if (s.anims.currentAnim?.key !== 'player-idle') {
        s.play('player-idle', true);
      }
    }
    this.drawStaff(x, y);
  }

  // 地面投影 + 法杖：像素与 staffTipOf 严格对齐，材质路径两条都走这里
  drawStaff(x, y) {
    const g = this.g;
    g.clear();
    pxRect(g, x - 4, y + 7, 9, 1, C.void, 0.5);
    pxRect(g, x - 3, y + 8, 7, 1, C.void, 0.35);
    if (!this.alive) return;
    const bob = this.moving ? (Math.floor(this.walkPhase / 110) % 2) : 0;
    const staffX = this.facing > 0 ? x + 6 : x - 7;
    pxRect(g, staffX, y - 12 - bob, 1, 19, 0x6b4a24, 1);
    pxRect(g, staffX - 1, y - 14 - bob, 3, 2, C.brass, 1);
    pxRect(g, staffX, y - 15 - bob, 1, 1, C.teal, 1);
  }

  // ---------- 程序化回退（素材缺失时） ----------
  drawProcedural(now, x, y, flash, blink) {
    const g = this.g;
    g.clear();
    const bob = this.moving ? (Math.floor(this.walkPhase / 110) % 2) : 0;
    const step = this.moving ? (Math.floor(this.walkPhase / 110) % 2) : 0;

    pxRect(g, x - 4, y + 7, 9, 1, C.void, 0.5);
    pxRect(g, x - 3, y + 8, 7, 1, C.void, 0.35);

    if (!this.alive) {
      pxRect(g, x - 4, y - 2, 9, 5, C.stoneDark, 0.8);
      pxRect(g, x - 2, y - 6, 5, 4, C.stoneDark, 0.8);
      return;
    }

    const staffX = this.facing > 0 ? x + 6 : x - 7;
    pxRect(g, staffX, y - 12 - bob, 1, 17, 0x6b4a24, 1);
    pxRect(g, staffX - 1, y - 14 - bob, 3, 2, C.brass, 1);
    pxRect(g, staffX, y - 15 - bob, 1, 1, C.teal, 1);

    const legL = step ? 1 : 0;
    pxRect(g, x - 3, y + 3, 2, 4 - legL, 0x6b4a24, 1);
    pxRect(g, x + 1, y + 3, 2, 4 - (1 - legL), 0x6b4a24, 1);
    pxRect(g, x - 4, y + 6, 3, 1, C.brassDark, 1);
    pxRect(g, x + 1, y + 6, 3, 1, C.brassDark, 1);

    pxRect(g, x - 5, y - 6 - bob, 10, 11, C.void, 1);
    pxRect(g, x - 4, y - 5 - bob, 8, 9, C.brass, 1);
    pxRect(g, x - 4, y - 5 - bob, 8, 1, C.brassLight, 1);
    pxRect(g, x - 1, y - 4 - bob, 2, 8, C.parchment, 1);
    pxRect(g, x - 4, y + 1 - bob, 8, 1, C.bloodDark, 1);
    pxRect(g, x - 4, y + 4 - bob, 2, 1, C.brassDark, 1);
    pxRect(g, x, y + 4 - bob, 2, 1, C.brassDark, 1);
    pxRect(g, x + 3, y + 4 - bob, 1, 1, C.brassDark, 1);

    pxRect(g, x - 4, y - 11 - bob, 8, 5, C.void, 1);
    pxRect(g, x - 3, y - 10 - bob, 6, 4, C.stone, 1);
    pxRect(g, x - 2, y - 9 - bob, 4, 3, C.parchment, 1);
    pxRect(g, x - 2, y - 8 - bob, 1, 1, C.ink, 1);
    pxRect(g, x + 1, y - 8 - bob, 1, 1, C.ink, 1);
    pxRect(g, x - 3, y - 11 - bob, 6, 1, C.stoneLight, 1);

    if (flash) {
      pxRect(g, x - 4, y - 10 - bob, 8, 15, C.white, 0.7);
      pxRect(g, x - 3, y - 5 - bob, 6, 9, C.white, 0.4);
    }
    g.setAlpha(blink ? 0.45 : 1);
  }

  destroy() {
    this.sprite?.destroy();
    this.g.destroy();
  }
}
