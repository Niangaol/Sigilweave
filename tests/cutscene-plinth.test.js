import { describe, expect, it } from 'vitest';
import { plinthLayout, toLocal, plinthMarks, PLINTH } from '../src/ui/cutscene-plinth.js';

describe('碑座版面', () => {
  it('横屏通栏：y0=186、高 84，铭文与统计各就各位', () => {
    const L = plinthLayout({ w: 480, h: 270, card: { compact: false, kind: 'act', stats: [] } });
    expect(L.panel).toEqual({ x: 0, y: 186, w: 480, h: 84 });
    expect(L.shadowY).toBe(185);
    expect(L.eyebrow).toMatchObject({ x: 14, y: 192, size: 7 });
    expect(L.title).toMatchObject({ x: 14, y: 202, size: 20, step: 26, align: 'left' });
    expect(L.rule).toEqual({ x1: 14, x2: 300, y: 228 });
    expect(L.subtitle).toMatchObject({ x: 14, y: 230, size: 8, width: 300 });
    expect(L.hint).toMatchObject({ y: 256, size: 6, align: 'right' });
    expect(L.watermark).toEqual({ x: 450, y: 130, size: 46, alpha: 0.18 });
  });

  it('带统计时副标题收窄、四列落在 306/346/386/426 并有分隔线', () => {
    const stats = [0, 1, 2, 3].map(i => ({ label: 'L' + i, value: String(i) }));
    const L = plinthLayout({ w: 480, h: 270, card: { kind: 'clear', stats } });
    expect(L.subtitle.width).toBe(286);
    expect(L.stats.map(s => s.x)).toEqual([306, 346, 386, 426]);
    expect(L.stats[0].divider).toBeNull();
    expect(L.stats[1].divider).toBe(326);
    expect(L.stats[3].divider).toBe(406);
    expect(L.stats[0].labelY).toBe(200);
    expect(L.stats[0].valueY).toBe(210);
    expect(L.watermark).toEqual({ x: 450, y: 206, size: 28, alpha: 0.12 });
  });

  it('竖屏加高到 104，标题字号 22', () => {
    const L = plinthLayout({ w: 480, h: 760, card: { kind: 'act', stats: [] } });
    expect(L.panel).toEqual({ x: 0, y: 656, w: 480, h: 104 });
    expect(L.title.size).toBe(22);
    expect(L.title.y).toBe(672);
    expect(L.hint.y).toBe(726);
  });

  it('紧凑碑 176×44 居中，标题垂直居中 y=172', () => {
    const L = plinthLayout({ w: 480, h: 270, card: { compact: true } });
    expect(L.panel).toEqual({ x: 152, y: 156, w: 176, h: 44 });
    expect(L.title).toEqual({ x: 240, y: 172, size: 13, align: 'center' });
    expect(L.stats).toEqual([]);
    expect(L.watermark).toBeNull();
  });

  it('竖屏紧凑碑下移到 0.74H，不压触控台', () => {
    const L = plinthLayout({ w: 480, h: 760, card: { compact: true } });
    expect(L.panel.y).toBe(540);
  });

  it('toLocal 取整；刻痕固定种子确定且在面板内', () => {
    expect(toLocal({ x: 240, y: 200 }, 240, 135)).toEqual({ x: 0, y: 65 });
    const a = plinthMarks(7);
    const b = plinthMarks(7);
    expect(a).toEqual(b);
    for (const m of a.marks) {
      expect(Number.isInteger(m.x) && Number.isInteger(m.y) && Number.isInteger(m.len)).toBe(true);
      expect(m.y).toBeLessThan(PLINTH.full.short);
    }
    expect(a.moss).toHaveLength(4);
  });
});
