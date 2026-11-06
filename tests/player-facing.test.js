import { describe, it, expect } from 'vitest';
import { flipXForPlayer, staffTipOf } from '../src/entities/Player.js';

// 2026-11 美术升级包：新立绘是「朝右」画的，所以只在 facing < 0 时翻转。
// 旧 32px 素材朝左，换包时同步翻转过判断（旧版曾因照搬旧判断导致走左却朝右）。
describe('玩家朝向翻转', () => {
  it('向右走（facing = 1）不翻转，向左走（facing = -1）翻转', () => {
    expect(flipXForPlayer(1)).toBe(false);
    expect(flipXForPlayer(-1)).toBe(true);
  });

  it('静止/非正朝向按朝左处理（与法杖起手的左侧回退一致）', () => {
    expect(flipXForPlayer(0)).toBe(true);
    expect(staffTipOf(100, 100, 0).x).toBeLessThan(100);
  });

  it('翻转方向与法杖所在侧始终一致：朝右杖在右、朝左杖在左', () => {
    for (const facing of [1, -1]) {
      const tip = staffTipOf(100, 100, facing);
      const flips = flipXForPlayer(facing);
      // 未翻转 = 原图朝右 = 杖在右侧；翻转后朝左 = 杖在左侧
      expect(tip.x > 100).toBe(!flips);
    }
  });
});
