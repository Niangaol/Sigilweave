// 符文碎片：击杀掉落，玩家靠近轻微吸附，碰到自动拾取
import { C, pxRect, pxDiamond } from '../ui/Palette.js';

// 吸附参数（纯函数，便于单测）：
// - 默认吸附半径 38px、吸力 34px/s、接触拾取半径 12px；无增益时与旧版逐帧行为一致。
// - 人物宝箱「引晶之手」的 pickupBonus 以「像素」为单位，叠加到吸附半径上。
//   碎片一旦被吸进 38px 圈，就会持续飞向玩家并最终进入 12px 接触圈，
//   所以扩大吸附半径等价于扩大实际拾取范围；不需要再改接触判定。
// - 碎片共鸣的 opts.pullRadius / pullSpeed 仍然优先作为基准值，pickupBonus 在其上叠加。
export function pickupPullParams(player, opts = {}) {
  const baseRadius = Number.isFinite(opts.pullRadius) ? Math.max(0, opts.pullRadius) : 38;
  const baseSpeed = Number.isFinite(opts.pullSpeed) ? Math.max(0, opts.pullSpeed) : 34;
  const bonus = Number.isFinite(player?.pickupBonus) && player.pickupBonus > 0
    ? player.pickupBonus
    : 0;
  return {
    pullRadius: baseRadius + bonus,
    pullSpeed: baseSpeed,
    pickRadius: 12,
  };
}

export default class Shard {
  constructor(scene, x, y) {
    this.scene = scene;
    this.g = scene.add.graphics();
    this.revive(x, y);
  }

  // 池化复用：重置位置与动画相位，重新显示
  revive(x, y) {
    this.x = x;
    this.y = y;
    this.alive = true;
    this.phase = (x * 17 + y * 31) % 100;
    this.time = 0;
    if (this.g) { this.g.setDepth(Math.floor(y)); this.g.setVisible(true); }
  }

  // 返回 true 表示被拾取
  update(dtMs, player, now, opts = {}) {
    if (!this.alive) return false;
    this.time += dtMs;
    const dx = player.x - this.x;
    const dy = player.y - this.y;
    const dist = Math.hypot(dx, dy) || 1;

    // 默认只有很近才吸附；人物增益扩大吸附半径，碎片共鸣再提供更大的基准值与吸力
    const { pullRadius, pullSpeed, pickRadius } = pickupPullParams(player, opts);
    if (dist < pullRadius) {
      const pull = pullSpeed * (dtMs / 1000);
      this.x += (dx / dist) * pull;
      this.y += (dy / dist) * pull;
    }
    if (dist < pickRadius && player.alive) {
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
