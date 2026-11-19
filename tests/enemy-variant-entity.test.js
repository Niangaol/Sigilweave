// tests/enemy-variant-entity.test.js
// T3：Enemy 实体层消费变体（tint / scale / 一次性护盾 / 配件 / 破盾眩晕 / 格挡减伤）。
// 契约见 docs/superpowers/specs/2026-11-16-enemy-variants-ai-design.md §6。
import { describe, it, expect } from 'vitest';
import Enemy from '../src/entities/Enemy.js';
import { ENEMY_TYPES } from '../src/data/roster.js';
import {
  VARIANT_PART_TEXTURES, ensureVariantTextures, variantPartKey, variantPartKeys, placeVariantPart,
} from '../src/ui/variant-parts.js';

// ---------- 假 Graphics / Sprite / Image / Scene ----------

function fakeGraphics(calls) {
  const g = {
    calls,
    clear: () => { calls.push(['clear']); return g; },
    fillStyle: (c, a) => { calls.push(['fillStyle', c, a]); return g; },
    fillRect: (x, y, w, h) => { calls.push(['fillRect', x, y, w, h]); return g; },
    fillPoints: (pts, close) => { calls.push(['fillPoints', pts, close]); return g; },
    lineStyle: () => g,
    strokePoints: () => g,
    setDepth: () => g,
    destroy: () => {},
  };
  return g;
}

function fakeSprite() {
  const s = {
    displayWidth: 32,
    displayHeight: 40,
    anims: { currentAnim: null, isPlaying: false },
    tint: null,
    tintFill: null,
    setOrigin: () => s,
    setScale: (x, y) => { s.scaleX = x; s.scaleY = y; return s; },
    setTint: (c) => { s.tint = c; s.tintFill = null; return s; },
    setTintFill: (c) => { s.tintFill = c; return s; },
    clearTint: () => { s.tint = null; s.tintFill = null; return s; },
    setDepth: (d) => { s.depth = d; return s; },
    setFlipX: (v) => { s.flipX = v; return s; },
    setVisible: (v) => { s.visible = v; return s; },
    setRotation: (r) => { s.rotation = r; return s; },
    setPosition: (x, y) => { s.x = x; s.y = y; return s; },
    play: () => s,
    destroy: () => { s.destroyed = true; },
  };
  return s;
}

function fakeImage(x, y, key) {
  const im = {
    key, x, y, depth: 0, scale: 1, flipX: false, visible: true, destroyed: false, visibleCalls: 0,
    setOrigin: () => im,
    setDepth: (d) => { im.depth = d; return im; },
    setScale: (sc) => { im.scale = sc; return im; },
    setPosition: (px, py) => { im.x = px; im.y = py; return im; },
    setVisible: (v) => { im.visible = v; im.visibleCalls += 1; return im; },
    setFlipX: (v) => { im.flipX = v; return im; },
    destroy: () => { im.destroyed = true; },
  };
  return im;
}

function fakeScene({ player = { x: 240, y: 80 }, textures = null } = {}) {
  const calls = [];
  const g = fakeGraphics(calls);
  const images = [];
  const state = { sprite: null };
  const scene = {
    calls,
    g,
    images,
    player,
    engine: { now: 0 },
    grid: { cells: [] },
    anims: { exists: () => false },
    // 默认假设素材与变体配件纹理都在：走精灵路径，便于量 draw 的调用数
    textures: textures ?? { exists: (key) => key === 'skeleton' || key === 'skeleton_mage' || key.startsWith('var_') },
    add: {
      graphics: () => g,
      sprite: () => { state.sprite = fakeSprite(); return state.sprite; },
      image: (x, y, key) => { const im = fakeImage(x, y, key); images.push(im); return im; },
    },
    onEnemyShieldBreak: null,
  };
  return { scene, g, calls, images, sprite: () => state.sprite };
}

// 变体定义（与 §2 的字段一致；测试不依赖 T1 的权重逻辑，只喂构造参数）
const HEAVY = {
  id: 'heavy', name: '重甲', hpMul: 1.60, speedMul: 0.82, damageMul: 1.10,
  scale: 1.10, radiusMul: 1.06, tint: null, parts: ['pauldron', 'shield'], shieldHpMul: 0.60,
};
const CROWNED = {
  id: 'elite', name: '精英', hpMul: 2.20, speedMul: 0.95, damageMul: 1.35,
  scale: 1.30, radiusMul: 1.18, tint: null, parts: ['crown'], shieldHpMul: 0, elite: true,
};

const skeletonWith = (variant, extra = {}) => ({ ...ENEMY_TYPES.skeleton, variant, ...extra });

describe('Enemy 构造：变体 tint / 缩放 / 护盾 / 配件', () => {
  it('重甲变体按 hp×shieldHpMul 初始化护甲值，并生成肩甲+盾两件配件', () => {
    const { scene, images } = fakeScene();
    const enemy = new Enemy(scene, skeletonWith(HEAVY), 240, 150, { x: 240, y: 80 }, 100, 40, 8, 1);

    expect(enemy.variantId).toBe('heavy');
    expect(enemy.shieldMax).toBe(60);
    expect(enemy.shield).toBe(60);
    expect(enemy.baseScale).toBeCloseTo(1.10);
    expect(enemy.parts).toHaveLength(2);
    expect(enemy.parts[0].kind).toBe('pauldron');
    expect(enemy.parts[1].kind).toBe('shield');
    expect(images).toHaveLength(2);
    expect(images[0].key).toBe('var_pauldron');
    expect(images[1].key).toBe('var_shield');
    for (const im of images) {
      expect(im.depth).toBe(Math.floor(150) + 0.2);
      expect(im.visible).toBe(true);
    }
    // 兼容别名仍指向第一件配件
    expect(enemy.part).toBe(images[0]);
    expect(enemy.partKind).toBe('pauldron');
  });

  it('无变体时 shield=0、无配件，仍是旧行为', () => {
    const { scene, images } = fakeScene();
    const enemy = new Enemy(scene, ENEMY_TYPES.skeleton, 240, 150, { x: 240, y: 80 }, 100, 40, 8, 1);

    expect(enemy.variantId).toBeNull();
    expect(enemy.shieldMax).toBe(0);
    expect(enemy.shield).toBe(0);
    expect(enemy.part).toBeNull();
    expect(enemy.parts).toHaveLength(0);
    expect(images).toHaveLength(0);
  });

  it('配件纹理缺失时静默降级（不抛错、parts 为空）', () => {
    const { scene } = fakeScene({ textures: { exists: () => false } });
    const enemy = new Enemy(scene, skeletonWith(HEAVY), 240, 150, { x: 240, y: 80 }, 100, 40, 8, 1);
    expect(enemy.part).toBeNull();
    expect(enemy.parts).toHaveLength(0);
    expect(() => enemy.update(16, 16)).not.toThrow();
  });

  it('变体 tint 优先于该型固有 tint，并落实在精灵上', () => {
    const { scene, sprite } = fakeScene();
    const def = { ...ENEMY_TYPES.oath_bishop, variant: { id: 'v', tint: 0x445566, scale: 1.5 } };
    const enemy = new Enemy(scene, def, 240, 120, { x: 240, y: 200 }, 35, 40, 10, 1);

    expect(enemy.tintColor).toBe(0x445566);
    expect(enemy.baseScale).toBeCloseTo(1.2 * 1.5);
    expect(sprite().tint).toBe(0x445566);
    expect(sprite().scaleX).toBeCloseTo(1.8);
  });

  it('受击闪白结束后恢复变体 tintColor（不再写死 ENEMY_STYLE.tint）', () => {
    const { scene, sprite } = fakeScene();
    const def = { ...ENEMY_TYPES.skeleton, variant: { id: 'v', tint: 0x334455 } };
    const enemy = new Enemy(scene, def, 240, 150, { x: 240, y: 80 }, 100, 40, 8, 1);

    enemy.hitReact(1, 0, 5, 1000);
    enemy.draw(1010);
    expect(sprite().tintFill ?? sprite().tint).not.toBe(0x334455);
    enemy.draw(1300);
    expect(sprite().tint).toBe(0x334455);
    expect(sprite().tintFill).toBeNull();
  });
});

describe('Enemy 格挡与破盾', () => {
  it('applyResult 消费 guard：架起 55% 减伤，放下归零', () => {
    const { scene } = fakeScene();
    const enemy = new Enemy(scene, ENEMY_TYPES.skeleton, 240, 150, { x: 240, y: 80 }, 100, 40, 8, 1);

    enemy.applyResult({ guard: true }, 0);
    expect(enemy.guard).toBe(true);
    expect(enemy.armor).toBe(0.55);

    enemy.applyResult({ guard: false }, 0);
    expect(enemy.guard).toBe(false);
    expect(enemy.armor).toBe(0);
  });

  it('破盾 pending 只消费一次：眩晕 400ms、隐藏配件、回调一次', () => {
    const { scene } = fakeScene();
    let breaks = 0;
    scene.onEnemyShieldBreak = () => { breaks += 1; };
    const enemy = new Enemy(scene, skeletonWith(HEAVY), 240, 150, { x: 240, y: 80 }, 100, 40, 8, 1);

    enemy.shield = 5;
    enemy.shieldBrokenPending = true;
    enemy.update(16, 1000);

    expect(breaks).toBe(1);
    expect(enemy.shieldBrokenPending).toBe(false);
    expect(enemy.shield).toBe(0);
    expect(enemy.stunUntil).toBe(1400);
    for (const entry of enemy.parts) expect(entry.sprite.visible).toBe(false);

    // 后续帧不得重复触发；placeVariantPart 也不得把配件翻回可见
    enemy.update(16, 1016);
    enemy.update(16, 1200);
    expect(breaks).toBe(1);
    for (const entry of enemy.parts) expect(entry.sprite.visible).toBe(false);
  });

  it('场景没有 onEnemyShieldBreak 时破盾不抛错', () => {
    const { scene } = fakeScene();
    const enemy = new Enemy(scene, skeletonWith(HEAVY), 240, 150, { x: 240, y: 80 }, 100, 40, 8, 1);
    enemy.shieldBrokenPending = true;
    expect(() => enemy.update(16, 500)).not.toThrow();
    expect(enemy.stunUntil).toBe(900);
  });

  it('眩晕内位置冻结、攻击状态清零，400ms 后恢复行动', () => {
    const { scene } = fakeScene({ player: { x: 240, y: 260 } });
    const enemy = new Enemy(scene, ENEMY_TYPES.skeleton, 240, 150, { x: 240, y: 260 }, 100, 40, 8, 1);

    enemy.shieldBrokenPending = true;
    enemy.windup = true;
    enemy.charging = true;
    enemy.guard = true;
    enemy.update(16, 1000);

    const frozen = { x: enemy.x, y: enemy.y };
    expect(enemy.windup).toBe(false);
    expect(enemy.charging).toBe(false);
    expect(enemy.guard).toBe(false);
    expect(enemy.armor).toBe(0);
    expect(enemy.damage).toBe(enemy.baseDamage);

    for (let t = 1016; t < 1400; t += 32) {
      enemy.update(32, t);
      expect(enemy.x).toBe(frozen.x);
      expect(enemy.y).toBe(frozen.y);
    }

    enemy.update(32, 1420);
    expect(enemy.x !== frozen.x || enemy.y !== frozen.y).toBe(true);
  });

  it('destroy 释放配件、精灵与 Graphics', () => {
    const { scene, sprite } = fakeScene();
    const enemy = new Enemy(scene, skeletonWith(CROWNED), 240, 150, { x: 240, y: 80 }, 200, 40, 8, 1);
    const part = enemy.part;
    expect(part).not.toBeNull();

    enemy.destroy();
    expect(part.destroyed).toBe(true);
    expect(enemy.part).toBeNull();
    expect(enemy.parts).toHaveLength(0);
    expect(sprite().destroyed).toBe(true);
  });

  it('重甲精英一次 draw 的 Graphics 调用 ≤30（60+ 同屏也不会把绘制预算打爆）', () => {
    const { scene, calls } = fakeScene();
    const def = skeletonWith(HEAVY, { elite: true });
    const enemy = new Enemy(scene, def, 240, 150, { x: 240, y: 80 }, 200, 40, 8, 1);

    calls.length = 0;
    enemy.draw(500);
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.length).toBeLessThanOrEqual(30);

    // 破盾白闪 + 眩晕菱形的帧同样守预算
    enemy.shieldBrokenPending = true;
    enemy.update(16, 600);
    calls.length = 0;
    enemy.draw(700);
    expect(calls.length).toBeLessThanOrEqual(30);
  });
});

// ---------- 配件纹理与定位 ----------

function fakeTextureManager(seed = []) {
  const store = new Map();
  for (const key of seed) store.set(key, { art: true });
  const tm = {
    store,
    calls: [],
    exists: (key) => store.has(key),
    createCanvas: (key, w, h) => {
      const rects = [];
      const ctx = {
        fillStyle: null,
        fillRect: (x, y, rw, rh) => rects.push([x, y, rw, rh]),
        beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, fill() {},
      };
      const canvas = { key, width: w, height: h, rects, getContext: () => ctx, refresh() {} };
      store.set(key, canvas);
      return canvas;
    },
    remove: (key) => { store.delete(key); },
  };
  return tm;
}

describe('variant-parts：纹理生成与配件定位', () => {
  it('三张配件的画布尺寸符合契约', () => {
    expect(VARIANT_PART_TEXTURES.var_shield).toMatchObject({ part: 'shield', width: 16, height: 16 });
    expect(VARIANT_PART_TEXTURES.var_pauldron).toMatchObject({ part: 'pauldron', width: 16, height: 12 });
    expect(VARIANT_PART_TEXTURES.var_crown).toMatchObject({ part: 'crown', width: 16, height: 10 });
  });

  it('variantPartKey 只认三种已知配件（兼容单件旧字段）', () => {
    expect(variantPartKey({ part: 'shield' })).toBe('var_shield');
    expect(variantPartKey({ part: 'pauldron' })).toBe('var_pauldron');
    expect(variantPartKey({ part: 'crown' })).toBe('var_crown');
    expect(variantPartKey({ part: 'wings' })).toBeNull();
    expect(variantPartKey({ part: null })).toBeNull();
    expect(variantPartKey(null)).toBeNull();
    expect(variantPartKey(undefined)).toBeNull();
  });

  it('variantPartKeys 按 parts 顺序返回多件配件，未知配件名跳过', () => {
    expect(variantPartKeys({ parts: ['pauldron', 'shield'] })).toEqual(['var_pauldron', 'var_shield']);
    expect(variantPartKeys({ parts: ['crown'] })).toEqual(['var_crown']);
    expect(variantPartKeys({ parts: [] })).toEqual([]);
    expect(variantPartKeys({ parts: ['wings', 'shield', 'crown'] })).toEqual(['var_shield', 'var_crown']);
    expect(variantPartKeys({ parts: [null, 42, 'shield'] })).toEqual(['var_shield']);
    expect(variantPartKeys({ part: 'shield' })).toEqual(['var_shield']);
    expect(variantPartKeys(null)).toEqual([]);
    expect(variantPartKeys(undefined)).toEqual([]);
  });

  it('ensureVariantTextures 幂等，并且只画硬边整数像素', () => {
    const tm = fakeTextureManager();
    const scene = { textures: tm };

    expect(ensureVariantTextures(scene)).toBe(3);
    expect([...tm.store.keys()].sort()).toEqual(['var_crown', 'var_pauldron', 'var_shield']);
    for (const key of ['var_shield', 'var_pauldron', 'var_crown']) {
      const { rects, width, height } = tm.store.get(key);
      expect(rects.length).toBeGreaterThan(10);
      for (const [x, y, w, h] of rects) {
        for (const v of [x, y, w, h]) expect(Number.isInteger(v)).toBe(true);
        expect(w).toBeGreaterThan(0);
        expect(h).toBeGreaterThan(0);
        expect(x).toBeGreaterThanOrEqual(0);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(x + w).toBeLessThanOrEqual(width);
        expect(y + h).toBeLessThanOrEqual(height);
      }
    }
    // 第二次调用全部跳过
    expect(ensureVariantTextures(scene)).toBe(0);
  });

  it('已有同名美术 PNG 时优先美术图（跳过该 key）', () => {
    const tm = fakeTextureManager(['var_shield']);
    const made = ensureVariantTextures({ textures: tm });
    expect(made).toBe(2);
    expect(tm.store.get('var_shield').art).toBe(true);
    expect(tm.store.has('var_crown')).toBe(true);
    expect(tm.store.has('var_pauldron')).toBe(true);
  });

  it('没有 CanvasTexture 的环境不抛错（返回 0 张）', () => {
    expect(() => ensureVariantTextures({ textures: { exists: () => false } })).not.toThrow();
    expect(ensureVariantTextures({ textures: { exists: () => false } })).toBe(0);
    expect(() => ensureVariantTextures(null)).not.toThrow();
    expect(() => ensureVariantTextures({})).not.toThrow();
  });

  it('placeVariantPart：王冠压在头顶、盾牌在朝向侧，破盾后盾件不可见', () => {
    const crown = fakeImage(0, 0, 'var_crown');
    const base = {
      x: 100, y: 100, radius: 8, face: 1, baseScale: 1, alive: true, shield: 0,
      viewExtent: { left: -8, right: 8, top: -20, bottom: 7 },
    };
    placeVariantPart({ ...base, part: crown, partKind: 'crown' });
    expect(crown.x).toBe(100);
    expect(crown.y).toBeLessThan(100 - 20); // 高于头顶（top = 80）
    expect(crown.depth).toBe(Math.floor(base.y) + 0.2);
    expect(crown.scale).toBeGreaterThan(0.8);
    expect(crown.scale).toBeLessThan(2);

    const shieldPart = fakeImage(0, 0, 'var_shield');
    const shielded = { ...base, parts: [{ sprite: shieldPart, kind: 'shield' }], shield: 0 };
    placeVariantPart(shielded);
    expect(shieldPart.visible).toBe(false);
    expect(shieldPart.x).toBeGreaterThan(100); // face=1：朝向侧

    shielded.shield = 12;
    placeVariantPart(shielded);
    expect(shieldPart.visible).toBe(true);

    shielded.face = -1;
    placeVariantPart(shielded);
    expect(shieldPart.x).toBeLessThan(100);
    expect(shieldPart.flipX).toBe(true);

    // 无配件 / 非法配件名都是空操作
    expect(() => placeVariantPart({ part: null })).not.toThrow();
    expect(() => placeVariantPart({ part: fakeImage(0, 0, 'x'), partKind: 'wings' })).not.toThrow();
    expect(() => placeVariantPart({ parts: [] })).not.toThrow();
    expect(() => placeVariantPart(null)).not.toThrow();
  });

  it('placeVariantPart：重甲两件配件同时就位，体型越大配件越大', () => {
    const pauldron = fakeImage(0, 0, 'var_pauldron');
    const shield = fakeImage(0, 0, 'var_shield');
    const small = {
      x: 100, y: 100, radius: 6, face: 1, baseScale: 1, alive: true, shield: 20,
      viewExtent: { left: -6, right: 6, top: -16, bottom: 6 },
      parts: [{ sprite: pauldron, kind: 'pauldron' }, { sprite: shield, kind: 'shield' }],
    };
    placeVariantPart(small);
    expect(pauldron.visible).toBe(true);
    expect(shield.visible).toBe(true);
    expect(pauldron.depth).toBe(Math.floor(100) + 0.2);
    expect(shield.depth).toBe(Math.floor(100) + 0.2);
    expect(shield.x).toBeGreaterThan(pauldron.x); // 盾更靠外
    expect(pauldron.y).toBeLessThan(shield.y); // 肩甲高于盾

    const big = { ...small, radius: 14, viewExtent: { left: -14, right: 14, top: -40, bottom: 10 } };
    const bigPauldron = fakeImage(0, 0, 'var_pauldron');
    const bigShield = fakeImage(0, 0, 'var_shield');
    placeVariantPart({ ...big, parts: [{ sprite: bigPauldron, kind: 'pauldron' }, { sprite: bigShield, kind: 'shield' }] });
    expect(bigShield.scale).toBeGreaterThan(shield.scale);
    // baseScale 直接乘进配件缩放（精英重甲更大）
    const eliteShield = fakeImage(0, 0, 'var_shield');
    placeVariantPart({ ...big, baseScale: 1.25, parts: [{ sprite: eliteShield, kind: 'shield' }] });
    expect(eliteShield.scale).toBeGreaterThan(bigShield.scale);
  });
});

// C5：编队标记（spec §5.4）。同编队成员脚下画同色小三角，颜色按 formationId 哈希从 4 个预设里取。
// 这里只做绘制冒烟 + 可观测证据（fillPoints 真的被调用、颜色随 id 变化），
// 不测「好不好看」——那是人眼验收。
describe('C5 编队标记：脚下三角', () => {
  const MARK = (from) => from.filter((c) => c[0] === 'fillPoints');

  it('formationId 存在时 draw 不抛错，且脚下真的画了一个三角形（pxPoly → fillPoints）', () => {
    const { scene, calls } = fakeScene();
    const enemy = new Enemy(scene, ENEMY_TYPES.skeleton, 240, 150, { x: 240, y: 80 }, 100, 40, 8, 1);
    enemy.formationId = 'siege';
    calls.length = 0;

    expect(() => enemy.draw(0)).not.toThrow();

    const tris = MARK(calls).filter((c) => Array.isArray(c[1]) && c[1].length === 3);
    expect(tris.length).toBeGreaterThanOrEqual(1);
    // 三角必须在脚下：三个顶点的 y 都 >= 逻辑坐标 y（脚底那条线以下）
    for (const entry of tris) {
      for (const p of entry[1]) expect(p.y).toBeGreaterThanOrEqual(150);
    }
  });

  it('没有 formationId 时不画三角（普通波零变化）', () => {
    const { scene, calls } = fakeScene();
    const enemy = new Enemy(scene, ENEMY_TYPES.skeleton, 240, 150, { x: 240, y: 80 }, 100, 40, 8, 1);
    calls.length = 0;

    enemy.draw(0);

    const tris = MARK(calls).filter((c) => Array.isArray(c[1]) && c[1].length === 3);
    expect(tris).toHaveLength(0);
  });

  it('颜色由 formationId 决定、且从 4 个预设里取：同 id 同色，不同 id 会换到别的色', () => {
    const colorOf = (id) => {
      const { scene, calls } = fakeScene();
      const enemy = new Enemy(scene, ENEMY_TYPES.skeleton, 240, 150, { x: 240, y: 80 }, 100, 40, 8, 1);
      enemy.formationId = id;
      calls.length = 0;
      enemy.draw(0);
      const tris = MARK(calls).filter((c) => Array.isArray(c[1]) && c[1].length === 3);
      const idx = calls.findIndex((c) => c === tris[0]);
      // 三角的前一条记录是 pxPoly 的 fillStyle(color, alpha)
      return calls.slice(0, idx).reverse().find((c) => c[0] === 'fillStyle')[1];
    };

    const a1 = colorOf('siege');
    const a2 = colorOf('siege');
    expect(a1).toBe(a2);

    // 8 个编队 id 至少要落出多于 1 种颜色，否则哈希等于没生效
    const ids = ['siege', 'shield_wall', 'pincer', 'mixed', 'harass', 'brute', 'casters', 'swarm'];
    const distinct = new Set(ids.map(colorOf));
    expect(distinct.size).toBeGreaterThan(1);
    expect(distinct.size).toBeLessThanOrEqual(4);
  });

  it('素材缺失走程序化路径时也画三角，且不抛错', () => {
    const { scene, calls } = fakeScene({ textures: { exists: () => false } });
    const enemy = new Enemy(scene, ENEMY_TYPES.skeleton, 240, 150, { x: 240, y: 80 }, 100, 40, 8, 1);
    enemy.formationId = 'pincer';
    calls.length = 0;

    expect(() => enemy.draw(0)).not.toThrow();

    const tris = MARK(calls).filter((c) => Array.isArray(c[1]) && c[1].length === 3);
    expect(tris.length).toBeGreaterThanOrEqual(1);
  });

  it('精英与 Boss 强度怪不画编队三角（它们不吃光环，标记会误导「先打前排」）', () => {
    const { scene, calls } = fakeScene();
    const elite = new Enemy(scene, { ...ENEMY_TYPES.oath_bishop, elite: true }, 240, 150, { x: 240, y: 80 }, 100, 40, 8, 1);
    elite.formationId = 'siege';
    calls.length = 0;

    elite.draw(0);

    const tris = MARK(calls).filter((c) => Array.isArray(c[1]) && c[1].length === 3);
    expect(tris).toHaveLength(0);
  });
});
