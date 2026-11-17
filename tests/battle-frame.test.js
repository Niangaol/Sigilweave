import { describe, it, expect } from 'vitest';
import { FRAME, FRAME_INNER, mixColor, frameTone } from '../src/ui/battle-frame.js';

describe('画框几何', () => {
  it('内开口与框厚自洽，正好覆盖 480×270', () => {
    expect(FRAME_INNER.left).toBe(FRAME.band);
    expect(FRAME_INNER.top).toBe(FRAME.band);
    expect(FRAME_INNER.right).toBe(480 - FRAME.band);
    expect(FRAME_INNER.bottom).toBe(270 - FRAME.band);
    expect(FRAME.band).toBe(8);
  });
  it('8px 框身的五层厚度相加等于框厚', () => {
    const sum = FRAME.outer + FRAME.brassDark + FRAME.brass + FRAME.stone + FRAME.inner;
    expect(sum).toBe(FRAME.band);
  });
});

describe('混色', () => {
  it('t=0 取 a、t=1 取 b、中间按通道线性插值', () => {
    expect(mixColor(0x000000, 0xffffff, 0)).toBe(0x000000);
    expect(mixColor(0x000000, 0xffffff, 1)).toBe(0xffffff);
    expect(mixColor(0x000000, 0xffffff, 0.5)).toBe(0x808080);
  });
  it('t 越界被夹到 0..1，非数值按 0 处理', () => {
    expect(mixColor(0x000000, 0xffffff, -3)).toBe(0x000000);
    expect(mixColor(0x000000, 0xffffff, 7)).toBe(0xffffff);
    expect(mixColor(0x000000, 0xffffff, NaN)).toBe(0x000000);
  });
});

describe('血量档位', () => {
  it('三档边界：>0.6 完好 / 0.3~0.6 陈旧 / <=0.3 破损', () => {
    expect(frameTone(1).tier).toBe('intact');
    expect(frameTone(0.61).tier).toBe('intact');
    expect(frameTone(0.6).tier).toBe('worn');
    expect(frameTone(0.31).tier).toBe('worn');
    expect(frameTone(0.3).tier).toBe('failing');
    expect(frameTone(0).tier).toBe('failing');
  });
  it('档位数值与设计文档一致', () => {
    expect(frameTone(1)).toMatchObject({ breathHz: 0.3, pulseHz: 0, crackCount: 0, debrisPerSec: 0, seep: 0, bloodMix: 0 });
    expect(frameTone(0.5)).toMatchObject({ breathHz: 0.2, pulseHz: 0, crackCount: 3, debrisPerSec: 0, seep: 0.35, bloodMix: 0.35 });
    expect(frameTone(0.1)).toMatchObject({ breathHz: 0, pulseHz: 1.1, crackCount: 6, debrisPerSec: 0.9, seep: 1, bloodMix: 1 });
  });
  it('NaN / Infinity / 负数不抛错，落到确定档位', () => {
    for (const bad of [NaN, Infinity, -Infinity, -1, undefined, null, '0.2']) {
      const tone = frameTone(bad);
      expect(['intact', 'worn', 'failing']).toContain(tone.tier);
    }
    expect(frameTone(NaN).tier).toBe('failing');
    expect(frameTone(-1).tier).toBe('failing');
    expect(frameTone(3).tier).toBe('intact');
  });
});
