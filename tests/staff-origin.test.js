import { describe, it, expect } from 'vitest';
import { staffTipOf } from '../src/entities/Player.js';

describe('法杖起手点', () => {
  it('朝右时杖尖在右侧 +6，朝左时在左侧 -7', () => {
    expect(staffTipOf(100, 100, 1)).toEqual({ x: 106, y: 85 });
    expect(staffTipOf(100, 100, -1)).toEqual({ x: 93, y: 85 });
    expect(staffTipOf(100, 100, 0)).toEqual({ x: 93, y: 85 }); // 非正朝向按左侧处理
  });
  it('尖端在头顶上方 15px，与绘制像素对齐', () => {
    const tip = staffTipOf(50, 60, 1);
    expect(tip.y).toBe(45);
  });
  it('只依赖输入，不修改任何全局状态（可重复调用）', () => {
    const a = staffTipOf(10, 20, 1);
    const b = staffTipOf(10, 20, 1);
    expect(a).toEqual(b);
  });
});
