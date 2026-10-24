import { describe, it, expect } from 'vitest';
import { hitRowAt } from '../src/ui/PauseMenu.js';

// 与 PauseMenu 里一致的四个行矩形（240 居中、220 宽、16 高、y=108/124/140/156）
const rows = [108, 124, 140, 156].map((y) => ({ y, x: 130, w: 220, h: 16 }));

describe('暂停菜单点击命中', () => {
  it('四行都能点中，且落回正确动作序号', () => {
    expect(hitRowAt(rows, 240, 108)).toBe(0);
    expect(hitRowAt(rows, 240, 124)).toBe(1);
    expect(hitRowAt(rows, 240, 140)).toBe(2);
    expect(hitRowAt(rows, 240, 156)).toBe(3);
  });
  it('点在文字两端也能命中（整行都是热区）', () => {
    expect(hitRowAt(rows, 131, 108)).toBe(0);
    expect(hitRowAt(rows, 349, 156)).toBe(3);
  });
  it('行外、面板外、标题区都不误触', () => {
    expect(hitRowAt(rows, 240, 90)).toBe(-1);
    expect(hitRowAt(rows, 240, 175)).toBe(-1);
    expect(hitRowAt(rows, 100, 108)).toBe(-1);
    expect(hitRowAt(rows, 380, 124)).toBe(-1);
  });
  it('非法输入安全返回 -1', () => {
    expect(hitRowAt(null, 240, 108)).toBe(-1);
    expect(hitRowAt([], 240, 108)).toBe(-1);
  });
});
