import { describe, it, expect } from 'vitest';
import Hud from '../src/ui/Hud.js';
function fixture() {
  const g = new Proxy({}, { get: (target, key) => target[key] ?? (() => g) });
  const scene = { time: { now: 0 }, add: { graphics: () => g, text: (x, y, text) => {
    const t = { x, y, text, setDepth() { return this; }, setOrigin() { return this; }, setResolution() { return this; }, setScrollFactor(n) { this.scrollFactorX = n; this.scrollFactorY = n; return this; }, setText(s) { this.text = s; return this; } };
    return t;
  } } };
  return new Hud(scene);
}
describe('等级经验HUD', () => {
  it('显示当前等级的经验阈值并动态更新', () => {
    const hud = fixture();
    const base = { hp: 100, maxHp: 100, shards: 0, rate: 0, elapsedMs: 0, act: 1 };
    hud.update({ ...base, lv: 1, exp: 3, expNeed: 10 });
    expect(hud.lvText.text).toBe('LV 1');
    expect(hud.expText.text).toBe('EXP 3/10');
    hud.update({ ...base, lv: 2, exp: 1, expNeed: 17 });
    expect(hud.lvText.text).toBe('LV 2');
    expect(hud.expText.text).toBe('EXP 1/17');
  });
  it('幕/场标签按幕显示星名、按场显示场地名，同幕换场也要刷新', () => {
    const hud = fixture();
    const base = { hp: 100, maxHp: 100, shards: 0, rate: 0, elapsedMs: 0 };
    hud.update({ ...base, chapter: 3, stage: 3 });
    expect(hud.actText.text).toBe('第三幕 · 天玑');
    // 幕 4 含场 4/5：缓存键若只存文案（或只按幕），场 4→5 会漏刷新
    hud.update({ ...base, chapter: 4, stage: 4 });
    expect(hud.actText.text).toBe('第四幕 · 沉钟书库');
    hud.update({ ...base, chapter: 4, stage: 5 });
    expect(hud.actText.text).toBe('第四幕 · 衡律法庭');
    hud.update({ ...base, chapter: 5, stage: 7 });
    expect(hud.actText.text).toBe('第五幕 · 破晓之座');
    // 旧数据只有 act 时按第一幕第一场兜底，不显示 undefined
    hud.update({ ...base, act: 1 });
    expect(hud.actText.text).toBe('第一幕 · 天枢');
  });
  it('所有顶栏文字固定于视口', () => {
    const hud = fixture();
    for (const key of ['hpText', 'shardText', 'freqText', 'actText', 'timeText', 'lvText', 'expText']) {
      expect(hud[key].scrollFactorX).toBe(0);
      expect(hud[key].scrollFactorY).toBe(0);
    }
  });
});

describe('顶栏为画框让出 8px', () => {
  it('两行文字都落在 y>=12，不会被画框压住', () => {
    const hud = fixture();
    expect(hud.hpText.y).toBe(13);
    expect(hud.timeText.y).toBe(13);
    expect(hud.lvText.y).toBe(29);
    expect(hud.expText.y).toBe(29);
  });
  it('顶栏底板覆盖到 y=42，画框不再压住任何字', () => {
    const rects = [];
    const g = {
      fillStyle: () => g, lineStyle: () => g, strokePoints: () => g, fillPoints: () => g,
      setDepth: () => g, setScrollFactor: () => g, clear: () => g,
      fillRect: (x, y, w, h) => { rects.push([x, y, w, h]); return g; },
    };
    const scene = {
      time: { now: 0 },
      add: {
        graphics: () => g,
        text: (x, y, s) => {
          const t = { x, y, text: s, setDepth() { return t; }, setOrigin() { return t; }, setResolution() { return t; }, setScrollFactor() { return t; }, setText(v) { t.text = v; return t; } };
          return t;
        },
      },
    };
    new Hud(scene);
    expect(rects.some(([x, y, w, h]) => x === 0 && y === 0 && w === 480 && h === 42)).toBe(true);
  });
});
