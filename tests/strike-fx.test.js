import { describe, it, expect } from 'vitest';
import { drawMeteorStrike, drawQuakeStrike, METEOR_STRIKE_DUR, QUAKE_STRIKE_DUR } from '../src/ui/strike-fx.js';

// 演出层是独立模块，用与 spell-fx 相同的口径验：预算 / 整数顶点 / alpha / 确定性 / 首尾都有内容
const KINDS = [
  { name: 'meteor', fn: drawMeteorStrike, dur: METEOR_STRIKE_DUR, radius: 95 },
  { name: 'quake', fn: drawQuakeStrike, dur: QUAKE_STRIKE_DUR, radius: 80 },
];
const PHASES = [0.02, 0.1, 0.25, 0.45, 0.7, 0.92, 0.99];
const CAP = 220;

function fakeG() {
  const log = [];
  return {
    log,
    fillStyle(c, a) { log.push(['f', c, a]); },
    fillRect(x, y, w, h) { log.push(['r', x, y, w, h]); },
    fillPoints(p) { log.push(['p', p]); },
    lineStyle() { throw new Error('strike-fx 不得用 lineStyle'); },
    strokePoints() { throw new Error('strike-fx 不得用 strokePoints'); },
  };
}
const count = (g) => g.log.filter((c) => c[0] !== 'clear').length;

const ctxFor = (radius, k, clock = 900) => ({ x: 300, y: 200, k, clock, radius, angle: 0.5 });

describe('演出层契约', () => {
  it('两个演出时长固定：陨星 1600ms、地裂 1400ms', () => {
    expect(METEOR_STRIKE_DUR).toBe(1600);
    expect(QUAKE_STRIKE_DUR).toBe(1400);
  });

  it('每个相位都能画、且单次不超过 220 条指令', () => {
    for (const { name, fn, radius } of KINDS) {
      for (const k of PHASES) {
        const g = fakeG();
        expect(() => fn(g, ctxFor(radius, k)), name + ' k=' + k).not.toThrow();
        expect(count(g), name + ' k=' + k).toBeGreaterThan(0);
        expect(count(g), name + ' k=' + k + ' 超预算').toBeLessThanOrEqual(CAP);
      }
    }
  });

  it('顶点整数、alpha 在 [0,1]', () => {
    for (const { name, fn, radius } of KINDS) {
      for (const k of PHASES) {
        const g = fakeG();
        fn(g, ctxFor(radius, k));
        for (const c of g.log) {
          if (c[0] === 'f') {
            expect(Number.isFinite(c[2]) && c[2] >= 0 && c[2] <= 1, name + ' alpha=' + c[2]).toBe(true);
          } else if (c[0] === 'p') {
            expect(c[1].length).toBeGreaterThanOrEqual(3);
            for (const p of c[1]) {
              expect(Number.isFinite(p.x) && Number.isFinite(p.y), name + ' 顶点非有限').toBe(true);
              expect(Number.isInteger(p.x) && Number.isInteger(p.y), name + ' 顶点非整数').toBe(true);
            }
          }
        }
      }
    }
  });

  it('确定性：同一 ctx 两次调用完全一致；clock 只改相位不改数量', () => {
    for (const { name, fn, radius } of KINDS) {
      for (const k of PHASES) {
        const a = fakeG(); const b = fakeG();
        fn(a, ctxFor(radius, k));
        fn(b, ctxFor(radius, k));
        expect(a.log, name + ' k=' + k).toEqual(b.log);
        const c = fakeG();
        fn(c, ctxFor(radius, k, 12345));
        expect(count(c), name + ' clock 改变了绘制数量').toBe(count(a));
      }
    }
  });

  it('出现与消失都有内容：首帧（k=0.02）和尾帧（k=0.99）都不是空的', () => {
    for (const { name, fn, radius } of KINDS) {
      const head = fakeG(); fn(head, ctxFor(radius, 0.02));
      const tail = fakeG(); fn(tail, ctxFor(radius, 0.99));
      expect(count(head), name + ' 出现帧为空').toBeGreaterThan(0);
      expect(count(tail), name + ' 消失帧为空（余韵丢了）').toBeGreaterThan(0);
    }
  });

  it('尺寸受控：主剪影最大边不超过 3.2R', () => {
    for (const { name, fn, radius } of KINDS) {
      const g = fakeG();
      fn(g, ctxFor(radius, 0.35));
      const xs = []; const ys = [];
      for (const c of g.log) {
        if (c[0] === 'p') for (const p of c[1]) { xs.push(p.x); ys.push(p.y); }
        else if (c[0] === 'r') { xs.push(c[1], c[1] + c[3]); ys.push(c[2], c[2] + c[4]); }
      }
      const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
      expect(span, name + ' 演出尺寸').toBeLessThanOrEqual(radius * 3.2);
    }
  });
});
