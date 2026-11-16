import { describe, expect, it, vi, beforeEach } from 'vitest';
import { playCutscene, cutscenesDisabled, CUTSCENE_KEY } from '../src/ui/transition.js';

function makeScene({ overlay = {}, active = false } = {}) {
  const start = vi.fn();
  const launch = vi.fn();
  const scene = {
    scene: {
      key: 'TitleScene',
      get: vi.fn(() => (overlay.missing ? null : { key: CUTSCENE_KEY })),
      isActive: vi.fn(() => active),
      start,
      launch,
    },
  };
  return { scene, start, launch };
}

beforeEach(() => {
  globalThis.window = { location: { search: '' }, __SIGILWEAVE_NO_CINEMA__: false };
});

describe('playCutscene 入口', () => {
  it('?cine=0 时退回普通切场，并剥掉 __cine 让目标场景恢复自己的淡入', () => {
    globalThis.window.location.search = '?cine=0';
    const { scene, start, launch } = makeScene();
    const used = playCutscene(scene, { to: 'BattleScene', payload: { run: { act: 1 }, __cine: true } });
    expect(used).toBe(false);
    expect(launch).not.toHaveBeenCalled();
    expect(start).toHaveBeenCalledWith('BattleScene', { run: { act: 1 } });
  });

  it('?stress=1 与显式关闭标记同样跳过过场', () => {
    globalThis.window.location.search = '?stress=1';
    expect(cutscenesDisabled()).toBe(true);
    globalThis.window.location.search = '';
    globalThis.window.__SIGILWEAVE_NO_CINEMA__ = true;
    expect(cutscenesDisabled()).toBe(true);
  });

  it('正常时启动覆盖层，带上 from/to/kind/act/stage/report', () => {
    const { scene, launch, start } = makeScene();
    const used = playCutscene(scene, {
      to: 'IntermissionScene', kind: 'clear', act: 4,
      payload: { run: { chapter: 4, stage: 4 }, report: { kills: 5 }, __cine: true },
      report: { kills: 5 },
    });
    expect(used).toBe(true);
    expect(start).not.toHaveBeenCalled();
    expect(launch).toHaveBeenCalledTimes(1);
    const [key, data] = launch.mock.calls[0];
    expect(key).toBe(CUTSCENE_KEY);
    expect(data).toMatchObject({
      from: 'TitleScene', to: 'IntermissionScene', kind: 'clear', act: 4, stage: 4,
      report: { kills: 5 },
    });
    expect(data.payload.run.chapter).toBe(4);
  });

  it('幕/场未显式给出时分别回退 payload.run.chapter 与 payload.run.stage', () => {
    const { scene, launch } = makeScene();
    playCutscene(scene, { to: 'BattleScene', kind: 'act', payload: { run: { chapter: 4, stage: 5 } } });
    expect(launch.mock.calls[0][1].act).toBe(4);
    expect(launch.mock.calls[0][1].stage).toBe(5);
  });

  it('没有 run 时按第一幕第一场兜底，绝不会把幕号场号丢成 undefined', () => {
    const { scene, launch } = makeScene();
    playCutscene(scene, { to: 'BattleScene', kind: 'act' });
    expect(launch.mock.calls[0][1].act).toBe(1);
    expect(launch.mock.calls[0][1].stage).toBe(1);
  });

  it('覆盖层已在播放时忽略重复触发，不叠两层', () => {
    const { scene, launch, start } = makeScene({ active: true });
    expect(playCutscene(scene, { to: 'LoadoutScene' })).toBe(false);
    expect(launch).not.toHaveBeenCalled();
    expect(start).not.toHaveBeenCalled();
  });

  it('没有注册覆盖层时退回普通切场；没有目标时直接忽略', () => {
    const { scene, start, launch } = makeScene({ overlay: { missing: true } });
    expect(playCutscene(scene, { to: 'LoadoutScene', payload: { __cine: true } })).toBe(false);
    expect(start).toHaveBeenCalledWith('LoadoutScene', {});
    expect(launch).not.toHaveBeenCalled();
    start.mockClear();
    expect(playCutscene(scene, {})).toBe(false);
    expect(start).not.toHaveBeenCalled();
  });
});
