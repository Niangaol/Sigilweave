// 刷怪 RNG 序列基线（golden）：波 3 把 spawnEnemy / spawnWave 搬出 BattleScene 时，
// 用它证明「同一 seed 的抽签顺序与结果一点没变」——类型 roll → 变体 roll 的顺序
// 是可复现性契约（docs/技术架构.md §二.4）。
import { afterAll, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';

vi.mock('phaser', () => {
  class Scene {
    constructor(key) { this.key = key; }
  }
  return {
    default: {
      Scene,
      Core: { Events: { BLUR: 'blur', FOCUS: 'focus' } },
      Scenes: { Events: { CREATE: 'create', SHUTDOWN: 'shutdown' } },
      BlendModes: { ADD: 1 },
    },
  };
});

import BattleScene from '../src/scenes/BattleScene.js';
import { Rng } from '../src/logic/rng.js';
import { chapterOf } from '../src/logic/acts.js';
import GOLDEN from './fixtures/battle-rng-trace-golden.json';

const RECORD = process.env.GOLDEN_RECORD === '1';

// 最小 Graphics 替身：Enemy 构造只要求链式 setDepth。
function graphicsProxy() {
  const raw = {};
  const g = new Proxy(raw, { get: (t, p) => (p in t ? t[p] : () => g) });
  raw.clear = () => g;
  raw.setDepth = () => g;
  return g;
}

function makeScene(stage) {
  const seq = [];
  const rng = new Rng('rng-golden:' + stage);
  const scene = {
    scene: { key: 'BattleScene' },
    player: { x: 240, y: 135 },
    world: { w: 1200, h: 800 },
    enemies: [],
    enemySeq: 0,
    chapter: chapterOf(stage),
    run: { progression: { level: 1 } },
    engine: { now: 0 },
    add: { graphics: () => graphicsProxy() },
    textures: { exists: () => false },
  };
  // 包一层捕获每次 next() 的返回值（含 pickSpawnPoint 的落点抽签）。
  scene.combatRng = { next: () => { const v = rng.next(); seq.push(v); return v; } };
  scene.spawnEnemy = BattleScene.prototype.spawnEnemy.bind(scene);
  return { scene, seq };
}

const DIF = (stage) => ({ hp: 10 + stage, speed: 30, damage: 8, maxAlive: 12 });
const q = (v) => Math.round(v * 100) / 100;

function runSequence(stage, count) {
  const { scene, seq } = makeScene(stage);
  for (let i = 0; i < count; i++) {
    scene.spawnEnemy(DIF(stage), { x: 120 + i * 37, y: 140 + i * 19 });
  }
  return {
    calls: seq.length,
    enemies: scene.enemies.map((e) => ({ defId: e.def.id, variant: e.variantId ?? null })),
    hash: createHash('sha256').update(JSON.stringify(seq.map(q))).digest('hex'),
  };
}

const log = {};
if (RECORD) {
  afterAll(() => {
    process.stdout.write('\nGOLDEN_RECORD ' + JSON.stringify(log) + '\n');
  });
}

describe('刷怪 RNG 基线：7 场各 30 次 spawnEnemy', () => {
  for (let stage = 1; stage <= 7; stage++) {
    it(`stage ${stage} 抽签序列哈希`, () => {
      const trace = runSequence(stage, 30);
      expect(trace.enemies).toHaveLength(30);
      if (RECORD) {
        log['stage' + stage] = trace;
        return;
      }
      expect(trace.calls, `stage ${stage} RNG 调用次数`).toBe(GOLDEN['stage' + stage].calls);
      expect(trace.enemies, `stage ${stage} 出怪序列`).toEqual(GOLDEN['stage' + stage].enemies);
      expect(trace.hash, `stage ${stage} RNG 序列哈希`).toBe(GOLDEN['stage' + stage].hash);
    });
  }
});
