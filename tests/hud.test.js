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
  it('所有顶栏文字固定于视口', () => {
    const hud = fixture();
    for (const key of ['hpText', 'shardText', 'freqText', 'actText', 'timeText', 'lvText', 'expText']) {
      expect(hud[key].scrollFactorX).toBe(0);
      expect(hud[key].scrollFactorY).toBe(0);
    }
  });
});
