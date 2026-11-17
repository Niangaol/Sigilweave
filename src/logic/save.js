// 本局断点存档：把整个 run 序列化到 localStorage，重开游戏从当前场继续。
// 与局外成长档 meta.js 完全分离，互不影响；存档只记录本局数据。
import { isValidStage } from './acts.js';

const STORAGE_KEY = 'sigilweave:run:v1';
const SAVE_VERSION = 1;

export const RUN_SAVE_KEY = STORAGE_KEY;

function resolveStorage(storage) {
  if (storage) return storage;
  if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
  // 内存桩：SSR / 单测无 window 时也能安全调用，不污染全局。
  const mem = new Map();
  return {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => { mem.set(k, String(v)); },
    removeItem: (k) => { mem.delete(k); },
  };
}

// run 全部字段都是纯数据（见 encounters.js 的 copy 约束），可安全 JSON 往返。
export function saveRun(run, storage) {
  if (!run) return false;
  try {
    const payload = {
      v: SAVE_VERSION,
      savedAt: Date.now(),
      run: JSON.parse(JSON.stringify(run)),
    };
    resolveStorage(storage).setItem(STORAGE_KEY, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

export function loadRun(storage) {
  try {
    const raw = resolveStorage(storage).getItem(STORAGE_KEY);
    if (!raw) return null;
    const payload = JSON.parse(raw);
    if (payload?.v !== SAVE_VERSION || !payload.run) return null;
    if (!isValidStage(payload.run.stage)) return null;
    return payload.run;
  } catch {
    return null;
  }
}

export function clearRun(storage) {
  try {
    resolveStorage(storage).removeItem(STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

// 给标题页显示「第 X 场」用，不暴露整个 run。
export function describeSave(storage) {
  const run = loadRun(storage);
  if (!run) return null;
  return { chapter: run.chapter, stage: run.stage };
}
