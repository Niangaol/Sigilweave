// 符文碎片：击杀掉落，玩家靠近轻微吸附，碰到自动拾取
import { C, pxRect, pxDiamond } from '../ui/Palette.js';

export default class Shard {
  constructor(scene, x, y) {
    this.scene = scene;
    this.x = x;
    this.y = y;
    this.alive = true;
    this.phase = (x * 17 + y * 31) % 100;
    this.g = scene.add.graphics().setDepth(Math.floor(y));
    this.time = 0;
  }

  // 返回 true 表示被拾取
  update(dtMs, player, now, opts = {}) {
    if (!this.alive) return false;
    this.time += dtMs;
    const dx = player.x - this.x;
    const dy = player.y - this.y;
    const dist = Math.hypot(dx, dy) || 1;

    // 默认只有很近才吸附；碎片共鸣会扩大吸取范围与吸力
    const pullRadius = Number.isFinite(opts.pullRadius) ? opts.pullRadius : 38;
    const pullSpeed = Number.isFinite(opts.pullSpeed) ? opts.pullSpeed : 34;
    if (dist < pullRadius) {
      const pull = pullSpeed * (dtMs / 1000);
      this.x += (dx / dist) * pull;
      this.y += (dy / dist) * pull;
    }
    if (dist < 12 && player.alive) {
      this.alive = false;
      return true;
    }
    this.draw();
    this.g.setDepth(Math.floor(this.y));
    return false;
  }

  draw() {
    const g = this.g;
    g.clear();
    const bob = Math.floor(this.time / 180 + this.phase) % 2;
    const x = Math.round(this.x);
    const y = Math.round(this.y) + bob;
    // 地面微光与碎片本体：秘能青属于增益色，只用在资源上
    pxRect(g, x - 3, y + 3, 7, 1, C.teal, 0.18);
    pxDiamond(g, x, y, 3, C.teal, 0.9, false);
    pxDiamond(g, x, y, 1, C.teal, 1, true);
    pxRect(g, x - 1, y - 4, 1, 1, C.white, 0.9);
  }

  destroy() {
    this.g.destroy();
  }
}
