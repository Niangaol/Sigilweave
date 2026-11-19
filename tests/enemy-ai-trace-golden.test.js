// 26 个敌人行为的轨迹基线（golden）：波 4 把 26 个状态机归并到 6 类骨架时，
// 用它证明「每一帧的位置、模式、事件序列都没变」。与 tests/enemy-ai.test.js 的区别：
// 那里证「同版本两次一致」，这里证「跨重构版本一致」。
import { afterAll, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { createBrain, stepBrain, DEFAULT_BATTLE } from '../src/logic/enemy-ai.js';
import { ENEMY_TYPES } from '../src/data/roster.js';
import GOLDEN from './fixtures/enemy-ai-trace-golden.json';

const RECORD = process.env.GOLDEN_RECORD === '1';
const PLAYER = Object.freeze({ x: 240, y: 220 });
const OPTS = { BATTLE: DEFAULT_BATTLE, damage: 8 };
const SEED = 20261023;
const DT = 16;
const FRAMES = 375; // 6 秒

const ALL_DEFS = [
  'skeleton', 'bat', 'corpse', 'cultist', 'knight',
  'stitch_abomination', 'oath_bishop',
  'rune_spider', 'stone_gargoyle', 'crystal_dryad',
  'clockwork_doll', 'void_elemental', 'wraith', 'brass_warden',
  'ink_wisp', 'page_golem', 'index_hound',
  'verdict_wraith', 'shackle_guard', 'scale_arbiter',
  'slag_beast', 'ember_imp', 'anvil_tyrant',
  'dawn_shade', 'stardust_knight', 'eclipse_priest',
];

const q = (v) => (typeof v === 'number' ? Math.round(v * 100) / 100 : v);

function frameResult(brain, r) {
  return {
    x: q(r.x),
    y: q(r.y),
    mode: brain.mode,
    charging: !!r.charging,
    windup: !!r.windup,
    guard: !!r.guard,
    shots: (r.shots || []).map((s) => ({
      vx: q(s.vx), vy: q(s.vy), damage: q(s.damage), kind: s.kind,
    })),
    stomp: r.stomp ? { radius: q(r.stomp.radius), damage: q(r.stomp.damage) } : null,
    melee: r.melee ? {
      angle: q(r.melee.angle), range: q(r.melee.range), arc: q(r.melee.arc), damage: q(r.melee.damage),
    } : null,
    summon: r.summon ? { kind: q(r.summon.kind) } : null,
  };
}

function runTrace(defId) {
  const brain = createBrain(defId, { now: 0, seed: SEED });
  let self = { x: 220, y: 190, speed: 50, radius: ENEMY_TYPES[defId].radius ?? 6 };
  const out = [];
  for (let i = 0; i < FRAMES; i++) {
    const r = stepBrain(brain, { dtMs: DT, now: i * DT, self, player: PLAYER, opts: OPTS });
    out.push(frameResult(brain, r));
    self = { x: r.x, y: r.y, speed: 50, radius: ENEMY_TYPES[defId].radius ?? 6 };
  }
  return createHash('sha256').update(JSON.stringify(out)).digest('hex');
}

const log = {};
if (RECORD) {
  afterAll(() => {
    process.stdout.write('\nGOLDEN_RECORD ' + JSON.stringify(log) + '\n');
  });
}

describe('敌人轨迹基线：26 行为 × 6 秒', () => {
  for (const defId of ALL_DEFS) {
    it(`${defId} 轨迹哈希`, () => {
      const hash = runTrace(defId);
      if (RECORD) {
        log[defId] = hash;
        return;
      }
      expect(hash, defId + ' 轨迹与基线一致').toBe(GOLDEN[defId]);
    });
  }
});
