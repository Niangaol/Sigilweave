// 战斗参数与起点：URL 平衡对照参数、开场起点格、玩家位置到最近已解封格的映射。
// 从 BattleScene 迁出（2026-11-19 架构重构波 1），行为逐行复制，只把 this 换成 scene。
// 非法输入一律回退默认值（非法 interval/starts/duo → null，由场景回落到幕默认）。
import { ACTS } from '../logic/constants.js';
import { ACT1_CELLS } from '../data/roster.js';
import { toId, manhattan } from '../logic/grid.js';

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

// 解析 URL 平衡对照参数：interval（秒）、starts（1-4）、duo（对偶倍率）
export function readTuning(params) {
  // 注意 Number(null) === 0，必须先用 has 区分“没传”与“传了 0”
  const intervalSec = params.has('interval') ? Number(params.get('interval')) : NaN;
  const starts = params.has('starts') ? Number.parseInt(params.get('starts'), 10) : NaN;
  const duo = params.has('duo') ? Number(params.get('duo')) : NaN;
  return {
    intervalMs: Number.isFinite(intervalSec) && intervalSec >= 0.8 && intervalSec <= 5 ? intervalSec * 1000 : null,
    starts: Number.isInteger(starts) && starts >= 1 && starts <= 4 ? starts : null,
    duoBonus: Number.isFinite(duo) && duo >= 0 && duo <= 2 ? duo : null,
  };
}

export function pickStartCells(scene) {
  const unlocked = scene.grid.unlockedIds();
  const count = scene.tuning?.starts ?? ACTS[scene.chapter - 1].starts;
  const cells = [scene.startCell];
  for (const id of unlocked) {
    if (cells.length >= count) break;
    if (!cells.includes(id)) cells.push(id);
  }
  return cells;
}

// ---------- 起点映射 ----------
export function sampleStartCell(scene) {
  // 玩家在战场中的归一化位置 -> 4×4 虚拟格坐标，再找最近的已解封格
  const normC = clamp(Math.floor((scene.player.x / scene.world.w) * 4), 0, 3);
  const normR = clamp(
    Math.floor((scene.player.y / scene.world.h) * 4), 0, 3,
  );
  const anchor = toId(normR, normC);
  let best = null;
  let bestDist = Infinity;
  for (const id of scene.grid.unlockedIds()) {
    const d = manhattan(anchor, id);
    if (d < bestDist || (d === bestDist && (best === null || id < best))) {
      bestDist = d;
      best = id;
    }
  }
  return best === null ? ACT1_CELLS[0] : best;
}

export function updateStartSample(scene, dt) {
  // 不必每帧变：每 2 秒按归一化位置采样一次；引擎只在脉流重生时读取
  scene.sampleTimer -= dt;
  if (scene.sampleTimer > 0) return;
  scene.sampleTimer = 2000;
  const next = scene.sampleStartCell();
  if (next !== scene.engine.startCells[0]) {
    scene.engine.startCells[0] = next;
    scene.startCell = next;
    scene.board.setStart(next);
  }
}


export function updateHint(scene) {
  if (scene.engine.now < scene.hintUntil) return;
  const a = Math.max(0, 1 - (scene.engine.now - scene.hintUntil) / 1200);
  scene.hint.setAlpha(a);
  if (a <= 0.01) scene.hint.setVisible(false);
}

// 刷怪：幸存者式波次，密度直接取自 roster.difficultyAt(now, act)。
// 割草爽感的三个来源：①同屏上限高（30→64，按幕再放大）②间隔短（0.7s→0.52s）
// ③一次抽 1~2 只同刷。落点由纯逻辑 pickWavePoints 一次抽出，同波之间也保证间距。
// 上限按 scripts/density-sim.mjs 的清怪速度定标：刷怪快过清怪只会得到一堵墙，不是割草。
