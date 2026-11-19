// 绘制 op 基线（golden）：把「画了什么」录成可比较的指令序列哈希。
// 目的不是测代码风格，而是给重构上硬闸：重构前后同一输入必须产生逐条相同的绘制指令。
// 数值统一量化到 2 位小数，保证跨 Node 版本 / 平台稳定（浮点差异远小于 0.005）。
import { afterAll, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import * as journey from '../src/ui/journey-static.js';
import * as story from '../src/ui/story-art.js';
import {
  DIORAMAS, DIORAMA_BANDS, dioramaLayout,
} from '../src/ui/dioramas/registry.js';
import {
  FX_DEF_IDS, drawProjectileFx, drawTrailFx, drawCastFx, drawImpactFx, drawWardFx, drawLinkFx,
} from '../src/ui/spell-fx.js';
import GOLDEN from './fixtures/ui-draw-golden.json';
import Enemy from '../src/entities/Enemy.js';
import { ENEMY_TYPES } from '../src/data/roster.js';

const RECORD = process.env.GOLDEN_RECORD === '1';

// 数值量化：2 位小数；颜色等整数原样。数组 / 点对象递归处理。
function q(v) {
  if (typeof v === 'number') return Math.round(v * 100) / 100;
  if (Array.isArray(v)) return v.map(q);
  if (v && typeof v === 'object') {
    const out = {};
    for (const k of Object.keys(v).sort()) out[k] = q(v[k]);
    return out;
  }
  return v;
}

// 记录型 Graphics：任何方法调用都记成一条 [name, ...args]；返回自身支持链式调用。
function recorder() {
  const ops = [];
  const g = new Proxy({}, {
    get(_, name) {
      if (name === 'then') return undefined; // 避免被误当 thenable
      return (...args) => {
        ops.push([String(name), ...args.map(q)]);
        return g;
      };
    },
  });
  return { g, ops };
}

function hashOf(ops) {
  return createHash('sha256').update(JSON.stringify(q(ops))).digest('hex');
}

function record(fn) {
  const { g, ops } = recorder();
  fn(g);
  return { n: ops.length, hash: hashOf(ops) };
}

// 录制模式：打印全部哈希，方便把新基线填回 GOLDEN。
const log = {};
function check(key, result) {
  if (RECORD) {
    log[key] = result;
    return;
  }
  expect(result.n, key + ' 指令数').toBe(GOLDEN[key].n);
  expect(result.hash, key + ' op 哈希').toBe(GOLDEN[key].hash);
}

// —— 基线哈希在 tests/fixtures/ui-draw-golden.json（录制于 2026-11-19，HEAD 5bdbdc9）——
// 重录：GOLDEN_RECORD=1 跑本文件，把 stdout 的 GOLDEN_RECORD 行写回 fixtures 即可。
if (RECORD) {
  afterAll(() => {
    process.stdout.write('\nGOLDEN_RECORD ' + JSON.stringify(log) + '\n');
  });
}

const H = [270, 760];
const P5 = [0, 0.25, 0.5, 0.75, 1];
const STORY_CTX = (p, h) => ({
  w: 480, h, t: Math.round(p * 6000), p, accent: 0xc9a227,
  stars: story.buildStars(0x9e37, 46, 480, h),
});

describe('绘制 op 基线：journey 六幕静态与动态', () => {
  for (const stage of Object.keys(journey.JOURNEY_STATIC)) {
    for (const band of ['back', 'mid', 'fore']) {
      for (const h of H) {
        it(`journey.${stage}.${band}.${h}`, () => {
          const L = journey.journeyLayout(stage, 480, h);
          check(`journey.${stage}.${band}.${h}`, record((g) => journey.JOURNEY_STATIC[stage][band](g, L)));
        });
      }
    }
    for (const p of P5) {
      for (const h of H) {
        it(`journey.${stage}.dyn.${p}.${h}`, () => {
          const ctx = { w: 480, h, t: Math.round(p * 6000), p, accent: 0xc9a227 };
          check(`journey.${stage}.dyn.${p}.${h}`, record((g) => journey.JOURNEY_STAGES[stage](g, ctx)));
        });
      }
    }
  }
});

describe('绘制 op 基线：story 开场/结局静态与动态', () => {
  const groups = [
    ['opening', story.OPENING_STATIC, story.OPENING_STAGES],
    ['ending', story.ENDING_STATIC, story.ENDING_STAGES],
  ];
  for (const [group, statics, stages] of groups) {
    for (const stage of Object.keys(statics)) {
      for (const band of ['back', 'mid', 'fore']) {
        for (const h of H) {
          it(`${group}.${stage}.${band}.${h}`, () => {
            const L = story.storyLayout(480, h);
            check(`${group}.${stage}.${band}.${h}`, record((g) => statics[stage][band](g, L)));
          });
        }
      }
      for (const p of P5) {
        for (const h of H) {
          it(`${group}.${stage}.dyn.${p}.${h}`, () => {
            check(`${group}.${stage}.dyn.${p}.${h}`, record((g) => stages[stage](g, STORY_CTX(p, h))));
          });
        }
      }
    }
  }
});

describe('绘制 op 基线：七幕布景三层', () => {
  for (const d of DIORAMAS) {
    if (!d) continue;
    for (const band of DIORAMA_BANDS) {
      for (const h of H) {
        it(`diorama.${d.act}.${band}.${h}`, () => {
          const L = dioramaLayout(d.act, 480, h);
          check(`diorama.${d.act}.${band}.${h}`, record((g) => d.module[band](g, L)));
        });
      }
    }
  }
});

describe('绘制 op 基线：24 法术六通道', () => {
  const TRAIL = [
    { x: 96, y: 66 }, { x: 102, y: 70 }, { x: 108, y: 73 }, { x: 114, y: 76 },
  ];
  const ctxFor = (kind, k) => {
    switch (kind) {
      case 'projectile':
      case 'trail':
        return { x: 120, y: 78, angle: 0.6, k, clock: 1234, trail: TRAIL.map((p) => ({ ...p })) };
      case 'cast':
        return { x: 200, y: 120, angle: -0.4, k, clock: 900 };
      case 'impact':
        return { x: 180, y: 90, k, clock: 1500, radius: 46 };
      case 'ward':
        return { x: 160, y: 100, k, clock: 700, radius: 40 };
      default:
        return { from: { x: 60, y: 80 }, to: { x: 190, y: 120 }, k, clock: 600, index: 1 };
    }
  };
  const drawers = {
    projectile: drawProjectileFx, trail: drawTrailFx, cast: drawCastFx,
    impact: drawImpactFx, ward: drawWardFx, link: drawLinkFx,
  };
  for (const id of FX_DEF_IDS) {
    for (const [kind, draw] of Object.entries(drawers)) {
      for (const k of [0, 0.5, 1]) {
        it(`spell.${id}.${kind}.${k}`, () => {
          check(`spell.${id}.${kind}.${k}`, record((g) => draw(g, id, ctxFor(kind, k))));
        });
      }
    }
  }
});

describe('绘制 op 基线：Enemy 程序化绘制（波 4 迁移前的像素基线）', () => {
  // 直接挂在原型上调用 drawProcedural，绕开构造期的 AI/场景装配；
  // 素材精灵路径（drawSpriteBody）由 enemy-variant-entity 与截图覆盖。
  const makeEnemy = (defId, extra = {}) => {
    const { g, ops } = recorder();
    const st = Object.assign(Object.create(Enemy.prototype), {
      g, defId, def: ENEMY_TYPES[defId], radius: ENEMY_TYPES[defId].radius,
      walkPhase: 0, phase: 0, hp: 10, maxHp: 10, windup: false, brain: null,
    }, extra);
    return { st, ops };
  };
  for (const defId of ['bat', 'corpse', 'cultist', 'knight', 'skeleton']) {
    for (const elite of [false, true]) {
      it(`enemy.${defId}.elite=${elite}`, () => {
        const { st, ops } = makeEnemy(defId, { def: { ...ENEMY_TYPES[defId], elite } });
        st.drawProcedural(240, 135, 0);
        check(`enemy.${defId}.elite=${elite}`, { n: ops.length, hash: hashOf(ops) });
      });
    }
  }
});
