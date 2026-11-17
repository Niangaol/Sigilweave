// 断点存档：写入/读取/清除与可注入 storage 的回归测试。
import { describe, it, expect, beforeEach } from 'vitest';
import { saveRun, loadRun, clearRun, describeSave, RUN_SAVE_KEY } from '../src/logic/save.js';
import { createRun } from '../src/logic/run.js';

function memStorage() {
  const map = new Map();
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

describe('断点存档 save.js', () => {
  let storage;
  beforeEach(() => { storage = memStorage(); });

  it('未存过时 loadRun 返回 null、describeSave 返回 null', () => {
    expect(loadRun(storage)).toBeNull();
    expect(describeSave(storage)).toBeNull();
  });

  it('saveRun 后 loadRun 能还原整个 run（含 stage/chapter/skillLibrary）', () => {
    const run = createRun('seed-a', 'flame');
    run.stage = 3; run.chapter = 3;
    run.skillLibrary = [{ defId: 'starfall', name: '星陨', kind: 'area', cdMs: 6000, cooldownUntil: 0 }];
    run.progression = { level: 12, exp: 4 };
    expect(saveRun(run, storage)).toBe(true);
    const loaded = loadRun(storage);
    expect(loaded.stage).toBe(3);
    expect(loaded.chapter).toBe(3);
    expect(loaded.seed).toBe('seed-a');
    expect(loaded.skillLibrary[0].defId).toBe('starfall');
    expect(loaded.progression.level).toBe(12);
  });

  it('describeSave 只返回幕/场摘要', () => {
    const run = createRun('seed-b');
    run.stage = 5; run.chapter = 4;
    saveRun(run, storage);
    expect(describeSave(storage)).toEqual({ chapter: 4, stage: 5 });
  });

  it('clearRun 后不能再读到存档', () => {
    saveRun(createRun('seed-c'), storage);
    expect(loadRun(storage)).not.toBeNull();
    expect(clearRun(storage)).toBe(true);
    expect(loadRun(storage)).toBeNull();
  });

  it('损坏或版本不符的数据被安全忽略', () => {
    storage.setItem(RUN_SAVE_KEY, '{not json');
    expect(loadRun(storage)).toBeNull();
    storage.setItem(RUN_SAVE_KEY, JSON.stringify({ v: 999, run: createRun() }));
    expect(loadRun(storage)).toBeNull();
    storage.setItem(RUN_SAVE_KEY, JSON.stringify({ v: 1, run: { stage: 99 } }));
    expect(loadRun(storage)).toBeNull();
  });

  it('storage 抛错不影响调用方（写/清失败返回 false）', () => {
    const bad = {
      getItem() { throw new Error('blocked'); },
      setItem() { throw new Error('blocked'); },
      removeItem() { throw new Error('blocked'); },
    };
    expect(saveRun(createRun(), bad)).toBe(false);
    expect(loadRun(bad)).toBeNull();
    expect(clearRun(bad)).toBe(false);
  });
});
