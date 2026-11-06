import { describe, it, expect } from 'vitest';
import { staffTipOf } from '../src/entities/Player.js';

describe('法杖起手点', () => {
  it('朝右时杖尖在右侧 +10，朝左时在左侧 -11', () => {
    expect(staffTipOf(100, 100, 1)).toEqual({ x: 110, y: 73 });
    expect(staffTipOf(100, 100, -1)).toEqual({ x: 89, y: 73 });
    expect(staffTipOf(100, 100, 0)).toEqual({ x: 89, y: 73 }); // 非正朝向按左侧处理
  });
  it('尖端在 42px 立绘的头顶上方 27px，与绘制像素对齐', () => {
    const tip = staffTipOf(50, 60, 1);
    expect(tip.y).toBe(33);
  });
  it('只依赖输入，不修改任何全局状态（可重复调用）', () => {
    const a = staffTipOf(10, 20, 1);
    const b = staffTipOf(10, 20, 1);
    expect(a).toEqual(b);
  });
});
