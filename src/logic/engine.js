// 脉流引擎：纯逻辑、可暂停、可回放、与渲染完全解耦
import { EventQueue } from './queue.js';
import { Rng } from './rng.js';
import { exitTargets, manhattan, toRC } from './grid.js';
import { MAX_REROUTE, EXPLORE_PATIENCE } from './constants.js';
import { ComboTracker } from './combo.js';

export const EV = {
  ARRIVE: 'arrive',
  RESPAWN: 'respawn',
};

export const FAIL_REASON = {
  COOLDOWN: 'cooldown',
  NO_EXIT: 'no_exit',
  REROUTE_LIMIT: 'reroute_limit',
  FALLBACK: 'fallback',
  DISSIPATE: 'dissipate',
};

export class SigilEngine {
  constructor(opts) {
    this.grid = opts.grid;
    this.comboWindowMul = Number.isFinite(opts.comboWindowMul) && opts.comboWindowMul > 0 ? opts.comboWindowMul : 1;
    this.combos = opts.combos ? new ComboTracker(opts.combos, this.comboWindowMul) : null;
    this.startCells = (opts.startCells || [5]).slice();
    this.rng = new Rng(opts.seed ?? 1);
    this.queue = new EventQueue();
    this.onEvent = opts.onEvent || null;
    this.now = 0;
    this.paused = false;

    this.roundVisited = new Set();
    this.noNewStreak = 0;
    this.signalSeq = 0;
    this.signals = new Map();

    this.stats = {
      triggers: 0,
      blocked: 0,
      reroutes: 0,
      dissipations: 0,
      fallbacks: 0,
      comboBreaksByReason: {},
      comboBreaksByShape: {},
      combos: 0,
      combosByShape: {},
      blockedByShape: {},
      perCellTriggers: new Array(16).fill(0),
      perCellBlocked: new Array(16).fill(0),
      triggerTimes: [],
      hash: 0,
    };
  }

  // 简单滚动校验，用于“同种子同结果”测试
  #mix(ev) {
    const s = ev.type + ':' + (ev.payload ? ev.payload.cellId ?? '' : '');
    this.stats.hash = (Math.imul(this.stats.hash, 31) + s.length + (ev.payload?.cellId ?? 0)) >>> 0;
  }

  #emit(type, data) {
    this.#mix({ type, payload: data });
    if (this.onEvent) this.onEvent(type, data);
  }

  // 暂停改阵后重算联组目录（进行中的联组进度作废——暂停中清空无感）
  setCombos(catalog) {
    this.combos = catalog ? new ComboTracker(catalog, this.comboWindowMul) : null;
  }

  setParams({ grid, startCells, seed } = {}) {
    if (grid) this.grid = grid;
    if (startCells) this.startCells = startCells.slice();
    if (seed !== undefined) this.rng = new Rng(seed);
  }

  start() {
    this.now = 0;
    this.queue.clear();
    this.signals.clear();
    this.roundVisited.clear();
    this.noNewStreak = 0;
    this.signalSeq = 0;
    for (let i = 0; i < this.startCells.length; i++) this.#spawnSignal(i);
    for (const sig of this.signals.values()) {
      const sc = this.grid.cells[this.startCells[sig.startIndex]];
      if (!sc || !sc.unlocked) continue;
      this.queue.push(0, EV.ARRIVE, { signalId: sig.id, cellId: sc.id, initial: true });
    }
  }

  #spawnSignal(startIndex) {
    const id = ++this.signalSeq;
    const sig = {
      id,
      startIndex,
      cellId: null,
      prevId: null,
      reroutes: 0,
      pending: false,
    };
    this.signals.set(id, sig);
    return sig;
  }

  advanceTo(targetTime) {
    if (this.paused) return;
    let guard = 0;
    while (!this.queue.isEmpty && this.queue.peek().time <= targetTime) {
      const ev = this.queue.pop();
      if (++guard > 200000) throw new Error('事件数量异常，疑似脉流死循环');
      this.now = ev.time;
      this.#dispatch(ev);
    }
    if (targetTime > this.now) this.now = targetTime;
  }

  // 逐帧推进：便于和游戏主循环对齐
  advance(dtMs) {
    this.advanceTo(this.now + Math.max(0, dtMs));
  }

  #dispatch(ev) {
    if (ev.type === EV.ARRIVE) return this.#arrive(ev.payload);
    if (ev.type === EV.RESPAWN) return this.#respawn(ev.payload);
    return undefined;
  }

  #arrive({ signalId, cellId }) {
    const sig = this.signals.get(signalId);
    if (!sig) return;
    const cell = this.grid.cells[cellId];
    if (!cell || !cell.unlocked) {
      this.#dissipate(sig, FAIL_REASON.NO_EXIT);
      return;
    }

    sig.cellId = cellId;

    if (cell.cooldownUntil > this.now) {
      // 冷却未就绪：此跳被吞，尝试改道
      this.stats.blocked++;
      this.stats.perCellBlocked[cellId]++;
      this.#emit('signal:blocked', { signalId, cellId, from: sig.prevId, reason: FAIL_REASON.COOLDOWN });
      this.#breakCombos(signalId, 'cooldown');
      this.#tryReroute(sig, cellId);
      return;
    }

    // 成功触发
    cell.cooldownUntil = this.now + cell.effCooldownMs;
    this.stats.triggers++;
    this.stats.perCellTriggers[cellId]++;
    this.stats.triggerTimes.push(this.now);
    sig.reroutes = 0;

    const isNew = !this.roundVisited.has(cellId);
    if (isNew) {
      this.roundVisited.add(cellId);
      this.noNewStreak = 0;
    } else {
      this.noNewStreak++;
    }

    this.#emit('signal:trigger', { signalId, cellId, from: sig.prevId, isNew, t: this.now });

    if (this.combos) {
      const fired = this.combos.onTrigger(signalId, cellId, this.now, this.grid);
      for (const f of fired) {
        this.stats.combos++;
        this.stats.combosByShape[f.defId] = (this.stats.combosByShape[f.defId] || 0) + 1;
        this.#emit('combo:fire', { defId: f.defId, order: f.order, bonus: f.bonus, at: this.now });
      }
    }

    const unlocked = this.grid.unlockedIds();
    if (unlocked.length > 0 && this.roundVisited.size >= unlocked.length) {
      this.roundVisited.clear();
      this.roundVisited.add(cellId);
      this.noNewStreak = 0;
    }

    this.#advanceOnward(sig, cellId);
  }

  #advanceOnward(sig, fromCellId) {
    const from = this.grid.cells[fromCellId];

    // 探索保底：连续多跳未踩到新格，强制传送至最近的未访问格
    if (this.noNewStreak >= EXPLORE_PATIENCE) {
      const target = this.#nearestUnvisited(fromCellId);
      if (target !== null) {
        this.stats.fallbacks++;
        this.noNewStreak = 0;
        this.#breakCombos(sig.id, 'fallback');
        this.#emit('signal:fallback', { signalId: sig.id, from: fromCellId, to: target, t: this.now });
        this.#schedule(sig, fromCellId, target);
        return;
      }
    }

    const raw = exitTargets(this.grid, fromCellId);
    const candidates = raw.filter((id) => id !== sig.prevId);
    const pool = candidates.length > 0 ? candidates : raw;
    if (pool.length === 0) {
      this.#dissipate(sig, FAIL_REASON.NO_EXIT);
      return;
    }
    const nextId = this.rng.pick(pool);
    this.#schedule(sig, fromCellId, nextId);
  }

  #tryReroute(sig, blockedCellId) {
    if (sig.reroutes >= MAX_REROUTE) {
      this.#dissipate(sig, FAIL_REASON.REROUTE_LIMIT);
      return;
    }
    const raw = exitTargets(this.grid, blockedCellId);
    const candidates = raw.filter((id) => id !== sig.prevId);
    const pool = candidates.length > 0 ? candidates : raw;
    if (pool.length === 0) {
      this.#dissipate(sig, FAIL_REASON.NO_EXIT);
      return;
    }
    const nextId = this.rng.pick(pool);
    sig.reroutes++;
    this.stats.reroutes++;
    this.#emit('signal:reroute', { signalId: sig.id, blocked: blockedCellId, to: nextId, t: this.now });
    this.#schedule(sig, blockedCellId, nextId);
  }

  // 旅行时间 = 出发格有效投射间隔 × 曼哈顿距离；远程传导不省时间
  #schedule(sig, fromCellId, toCellId) {
    const from = this.grid.cells[fromCellId];
    const dist = Math.max(1, manhattan(fromCellId, toCellId));
    const travel = from.effIntervalMs * dist;
    sig.prevId = fromCellId;
    this.queue.push(this.now + travel, EV.ARRIVE, { signalId: sig.id, cellId: toCellId });
  }

  // 断链诊断：只在确实断掉进行中的联组时记录原因，供界面与统计使用
  #breakCombos(signalId, reason) {
    if (!this.combos) return;
    const broken = this.combos.breakAll(signalId);
    if (!broken || broken.count === 0) return;
    this.stats.comboBreaksByReason[reason] = (this.stats.comboBreaksByReason[reason] || 0) + broken.count;
    for (const shape of broken.shapes) {
      this.stats.comboBreaksByShape[shape] = (this.stats.comboBreaksByShape[shape] || 0) + 1;
    }
    this.#emit('combo:break', { signalId, reason, count: broken.count, shapes: broken.shapes, t: this.now });
  }

  #dissipate(sig, reason) {
    this.stats.dissipations++;
    this.#emit('signal:dissipate', { signalId: sig.id, cellId: sig.cellId, reason, t: this.now });
    this.#breakCombos(sig.id, 'dissipate');
    sig.cellId = null;
    sig.prevId = null;
    sig.reroutes = 0;
    const startCell = this.grid.cells[this.startCells[sig.startIndex] ?? 0];
    const delay = startCell ? startCell.effIntervalMs : 2000;
    this.queue.push(this.now + delay, EV.RESPAWN, { signalId: sig.id });
  }

  #respawn({ signalId }) {
    const sig = this.signals.get(signalId);
    if (!sig) return;
    const startId = this.startCells[sig.startIndex];
    const cell = this.grid.cells[startId];
    if (!cell || !cell.unlocked) {
      this.queue.push(this.now + 500, EV.RESPAWN, { signalId });
      return;
    }
    sig.prevId = null;
    this.queue.push(this.now, EV.ARRIVE, { signalId, cellId: startId });
  }

  #nearestUnvisited(fromCellId) {
    let best = null;
    let bestD = Infinity;
    for (const id of this.grid.unlockedIds()) {
      if (this.roundVisited.has(id)) continue;
      if (id === fromCellId) continue;
      const d = manhattan(fromCellId, id);
      if (d < bestD || (d === bestD && (best === null || id < best))) {
        bestD = d;
        best = id;
      }
    }
    return best;
  }

  summary(durationMs) {
    const secs = Math.max(0.001, durationMs / 1000);
    const perCell = this.stats.perCellTriggers.map((n, id) => ({ id, n }));
    const idle = perCell.filter((c) => c.n === 0).map((c) => c.id);
    return {
      durationSec: Number(secs.toFixed(2)),
      triggers: this.stats.triggers,
      triggersPerSec: Number((this.stats.triggers / secs).toFixed(3)),
      blocked: this.stats.blocked,
      blockedRate: this.stats.triggers + this.stats.blocked > 0
        ? Number((this.stats.blocked / (this.stats.triggers + this.stats.blocked)).toFixed(4))
        : 0,
      reroutes: this.stats.reroutes,
      dissipations: this.stats.dissipations,
      fallbacks: this.stats.fallbacks,
      combos: this.stats.combos,
      comboBreaks: { ...this.stats.comboBreaksByReason },
      comboBreaksByShape: { ...this.stats.comboBreaksByShape },
      idleCells: idle,
      hash: this.stats.hash >>> 0,
    };
  }
}
