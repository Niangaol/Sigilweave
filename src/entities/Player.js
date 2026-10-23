// 玩家：手动走位、受击无敌帧、像素法师绘制
import { C, pxRect, pxDiamond } from '../ui/Palette.js';
import { PLAYER } from '../data/roster.js';

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
    this.invulnUntil = 0;
    this.hurtAt = -9999;
    this.walkPhase = 0;
    this.facing = 1;
    this.moving = false;
    this.g = scene.add.graphics().setDepth(y);
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
    this.g.setDepth(Math.floor(this.y));
  }

  // 返回是否真的吃到伤害（无敌帧内返回 false）
  takeDamage(amount, now) {
    if (!this.alive) return false;
    if (now < this.invulnUntil) return false;
    const absorbed = Math.min(this.shield, Math.max(0, amount));
    this.shield -= absorbed;
    this.hp = Math.max(0, this.hp - Math.max(0, amount - absorbed));
    this.invulnUntil = now + PLAYER.iframesMs;
    this.hurtAt = now;
    if (this.hp <= 0) this.alive = false;
    return true;
  }

  draw(now) {
    const g = this.g;
    g.clear();
    const x = Math.round(this.x);
    const y = Math.round(this.y);
    const bob = this.moving ? (Math.floor(this.walkPhase / 110) % 2) : 0;
    const step = this.moving ? (Math.floor(this.walkPhase / 110) % 2) : 0;
    const flash = now - this.hurtAt < PLAYER.hurtFlashMs;
    const blink = now < this.invulnUntil && Math.floor(now / 90) % 2 === 0;

    // 地面投影：硬边两行，不用渐变
    pxRect(g, x - 4, y + 7, 9, 1, C.void, 0.5);
    pxRect(g, x - 3, y + 8, 7, 1, C.void, 0.35);

    if (!this.alive) {
      // 死亡：只剩一枚熄灭的披风轮廓
      pxRect(g, x - 4, y - 2, 9, 5, C.stoneDark, 0.8);
      pxRect(g, x - 2, y - 6, 5, 4, C.stoneDark, 0.8);
      return;
    }

    // 法杖：随朝向换边
    const staffX = this.facing > 0 ? x + 6 : x - 7;
    pxRect(g, staffX, y - 12 - bob, 1, 17, 0x6b4a24, 1);
    pxRect(g, staffX - 1, y - 14 - bob, 3, 2, C.brass, 1);
    pxRect(g, staffX, y - 15 - bob, 1, 1, C.teal, 1);

    // 双腿：两帧交替
    const legL = step ? 1 : 0;
    pxRect(g, x - 3, y + 3, 2, 4 - legL, 0x6b4a24, 1);
    pxRect(g, x + 1, y + 3, 2, 4 - (1 - legL), 0x6b4a24, 1);
    pxRect(g, x - 4, y + 6, 3, 1, C.brassDark, 1);
    pxRect(g, x + 1, y + 6, 3, 1, C.brassDark, 1);

    // 披风主体：黑边 + 暖金 + 羊皮纸内衬
    pxRect(g, x - 5, y - 6 - bob, 10, 11, C.void, 1);
    pxRect(g, x - 4, y - 5 - bob, 8, 9, C.brass, 1);
    pxRect(g, x - 4, y - 5 - bob, 8, 1, C.brassLight, 1);
    pxRect(g, x - 1, y - 4 - bob, 2, 8, C.parchment, 1);
    pxRect(g, x - 4, y + 1 - bob, 8, 1, C.bloodDark, 1);
    // 下摆锯齿
    pxRect(g, x - 4, y + 4 - bob, 2, 1, C.brassDark, 1);
    pxRect(g, x, y + 4 - bob, 2, 1, C.brassDark, 1);
    pxRect(g, x + 3, y + 4 - bob, 1, 1, C.brassDark, 1);

    // 兜帽与脸
    pxRect(g, x - 4, y - 11 - bob, 8, 5, C.void, 1);
    pxRect(g, x - 3, y - 10 - bob, 6, 4, C.stone, 1);
    pxRect(g, x - 2, y - 9 - bob, 4, 3, C.parchment, 1);
    pxRect(g, x - 2, y - 8 - bob, 1, 1, C.ink, 1);
    pxRect(g, x + 1, y - 8 - bob, 1, 1, C.ink, 1);
    pxRect(g, x - 3, y - 11 - bob, 6, 1, C.stoneLight, 1);

    // 受击白闪
    if (flash) {
      pxRect(g, x - 4, y - 10 - bob, 8, 15, C.white, 0.7);
      pxRect(g, x - 3, y - 5 - bob, 6, 9, C.white, 0.4);
    }
    g.setAlpha(blink ? 0.45 : 1);
  }

  destroy() {
    this.g.destroy();
  }
}
