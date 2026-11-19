// 震屏预算：只放大事件，同类事件之间有最小间隔。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SHAKE_KINDS, createShakeGate, admitShake, shakeKindOf, shakeCamera, DEFAULT_SHAKE_KIND } from '../src/ui/camera-shake.js';

const root = resolve(import.meta.dirname, '..');

describe('震屏预算', () => {
  it('四类事件的门槛与幅度就是设计值', () => {
    // B6 新增 phase（Boss 转阶段）。这条是全量形状断言：新增 kind 必须同步补进来，
    // 而不是把 toEqual 放成 toMatchObject 把清单测松——预算清单宁可手动维护。
    expect(SHAKE_KINDS).toEqual({
      hurt: { gapMs: 900, ampScale: 0.8 },
      strike: { gapMs: 800, ampScale: 1 },
      major: { gapMs: 250, ampScale: 1 },
      phase: { gapMs: 150, ampScale: 1 },
    });
    expect(DEFAULT_SHAKE_KIND).toBe('major');
  });

  it('phase kind 不被 hurt 的 900ms 节流吞掉', () => {
    // 转阶段常常紧接一次受击演出：phase 的门槛必须显著小于 hurt，
    // 否则玩家看到的是「Boss 换招了但屏幕没反应」。
    expect(SHAKE_KINDS.phase.gapMs).toBeLessThanOrEqual(150);
    const gate = createShakeGate();
    expect(admitShake(gate, 'hurt', 1000)).toBe(true);
    expect(admitShake(gate, 'phase', 1050)).toBe(true);
  });

  it('同类事件在 gapMs 内只放行一次，过了就能再震', () => {
    const gate = createShakeGate();
    expect(admitShake(gate, 'hurt', 1000)).toBe(true);
    expect(admitShake(gate, 'hurt', 1899)).toBe(false);
    expect(admitShake(gate, 'hurt', 1900)).toBe(true);
    expect(admitShake(gate, 'strike', 1900)).toBe(true);   // 不同类互不占用
    expect(admitShake(gate, 'strike', 2600)).toBe(false);
    expect(admitShake(gate, 'strike', 2700)).toBe(true);
  });

  it('大事件只防同帧叠加（250ms），不额外稀释', () => {
    const gate = createShakeGate();
    expect(admitShake(gate, 'major', 0)).toBe(true);
    expect(admitShake(gate, 'major', 200)).toBe(false);
    expect(admitShake(gate, 'major', 250)).toBe(true);
  });

  it('未知 kind 归到 major；非法 gate / now 一律拒绝', () => {
    const gate = createShakeGate();
    expect(admitShake(gate, 'nope', 500)).toBe(true);
    expect(shakeKindOf('nope')).toBe(SHAKE_KINDS.major);
    for (const bad of [NaN, Infinity, -Infinity, '100', null, undefined]) expect(admitShake(gate, 'hurt', bad)).toBe(false);
    for (const bad of [null, undefined, 1, 'x']) expect(admitShake(bad, 'hurt', 500)).toBe(false);
  });

  it('场景里只有 shakeCamera 一处直接调相机震屏', () => {
    // 波 1 起演出级震屏（strike）迁到 ui/spell-hit-fx.js：检查面合并两个文件（只扩大、不放松）。
    const scene = readFileSync(resolve(root, 'src/scenes/BattleScene.js'), 'utf8')
      + readFileSync(resolve(root, 'src/ui/spell-hit-fx.js'), 'utf8')
      + readFileSync(resolve(root, 'src/scenes/battle-encounters.js'), 'utf8')
      + readFileSync(resolve(root, 'src/scenes/battle-enemies.js'), 'utf8')
      + readFileSync(resolve(root, 'src/scenes/battle-stage-flow.js'), 'utf8');
    const gate = readFileSync(resolve(root, 'src/ui/camera-shake.js'), 'utf8');
    expect((scene.match(/cameras\??\.main\??\.shake\?\.?\(/g) ?? []).length).toBe(0);
    expect((gate.match(/\.shake\(/g) ?? []).length).toBe(1);   // 只有 shakeCamera 内部那一行
    // 允许震的调用点：受伤×3、演出级×1、大事件×3（Boss 登场/通幕/死亡）
    expect((scene.match(/shakeCamera\((this|scene), '/g) ?? []).length).toBe(7);
    for (const kind of ['hurt', 'strike', 'major']) {
      expect(scene).toMatch(new RegExp("shakeCamera\\((this|scene), '" + kind + "'"));
    }
  });

  it('shakeCamera：无相机或无 gate 时不抛错，且按预算放行', () => {
    const calls = [];
    const scene = { cameras: { main: { shake: (ms, amp) => calls.push([ms, amp]) } }, engine: { now: 0 } };
    expect(shakeCamera(scene, 'hurt', 90, 0.004)).toBe(true);
    expect(shakeCamera(scene, 'hurt', 90, 0.004)).toBe(false);
    expect(calls).toEqual([[90, 0.004 * 0.8]]);
    expect(shakeCamera(null, 'hurt', 90, 0.004)).toBe(false);
    expect(shakeCamera({ cameras: { main: {} } }, 'hurt', 90, 0.004)).toBe(false);
    expect(shakeCamera(scene, 'hurt', NaN, 0.004)).toBe(false);
  });

  it('普通命中、挥砍、弹幕炸开、破盾、连斩都不再震屏', () => {
    const src = readFileSync(resolve(root, 'src/scenes/BattleScene.js'), 'utf8')
      + readFileSync(resolve(root, 'src/ui/spell-hit-fx.js'), 'utf8')
      + readFileSync(resolve(root, 'src/scenes/battle-enemies.js'), 'utf8')
      + readFileSync(resolve(root, 'src/scenes/battle-stage-flow.js'), 'utf8');
    // 普通法术分支：震屏行已删，只剩顿帧
    expect(src).toMatch(/普通法术只给顿帧，不震屏/);
    expect(src).toMatch(/连斩 20\/40\/60 只走文字与音效，不再震屏/);
    expect(src).not.toMatch(/killStreak === 20 \|\| this\.killStreak === 40/);
  });
});
