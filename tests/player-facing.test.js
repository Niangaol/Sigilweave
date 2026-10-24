import { describe, it, expect } from 'vitest';
import { flipXForPlayer, staffTipOf } from '../src/entities/Player.js';

// 回归：精灵原图朝左，所以「向右走才翻转」。
// 旧版写成 facing < 0 才翻转，实机表现是走左却朝右、走右却朝左（用户 2026-10 报的 bug）。
describe('玩家朝向翻转', () => {
  it('向右走（facing = 1）需要水平翻转，向左走（facing = -1）不翻转', () => {
    expect(flipXForPlayer(1)).toBe(true);
    expect(flipXForPlayer(-1)).toBe(false);
  });

  it('静止/非正朝向按朝左处理（与法杖起手的左侧回退一致）', () => {
    expect(flipXForPlayer(0)).toBe(false);
    expect(staffTipOf(100, 100, 0).x).toBeLessThan(100);
  });

  it('翻转方向与法杖所在侧始终一致：朝右杖在右、朝左杖在左', () => {
    for (const facing of [1, -1]) {
      const tip = staffTipOf(100, 100, facing);
      const flips = flipXForPlayer(facing);
      // 未翻转 = 精灵原图朝左 = 杖应在左侧；翻转后朝右 = 杖应在右侧
      expect(tip.x > 100).toBe(flips);
    }
  });
});
