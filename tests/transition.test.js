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

  it('正常时启动覆盖层，带上 from/to/kind/act/report', () => {
    const { scene, launch, start } = makeScene();
    const used = playCutscene(scene, {
      to: 'IntermissionScene', kind: 'clear', act: 2,
      payload: { run: { act: 2 }, report: { kills: 5 }, __cine: true },
      report: { kills: 5 },
    });
    expect(used).toBe(true);
    expect(start).not.toHaveBeenCalled();
    expect(launch).toHaveBeenCalledTimes(1);
    const [key, data] = launch.mock.calls[0];
    expect(key).toBe(CUTSCENE_KEY);
    expect(data).toMatchObject({
      from: 'TitleScene', to: 'IntermissionScene', kind: 'clear', act: 2,
      report: { kills: 5 },
    });
    expect(data.payload.run.act).toBe(2);
  });

  it('act 未显式给出时用 payload.run.act，避免幕号错位', () => {
    const { scene, launch } = makeScene();
    playCutscene(scene, { to: 'BattleScene', kind: 'act', payload: { run: { act: 3 } } });
    expect(launch.mock.calls[0][1].act).toBe(3);
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
