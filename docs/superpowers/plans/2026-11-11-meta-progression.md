# 残响祭坛 · 局外成长 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为《共振法阵》加一层跨局成长：每局结算「残响」，残响升级那 11 个人物/罗盘被动；24 个 Boss 首杀里程碑点亮契约图鉴并解锁被动等级上限。

**Architecture:** 新增三块纯逻辑（`src/data/meta.js` 常量与里程碑表、`src/logic/meta.js` 存档/结算/升级、`src/ui/meta-ui.js` 纯绘制函数），再由两个场景接入（`BattleScene` 只读存档把等级喂给 `buff.apply(target, level)`；`GameOverScene` 结算写档；新增 `MetaScene` 供玩家花残响）。存档是唯一持久层，用 `localStorage['sigilweave:meta:v1']`，读写全部经过 sanitize。

**Tech Stack:** Phaser 3.90、Vite 8、vitest（node 环境，无 jsdom —— UI 必须拆成能用假 Graphics 测的纯函数）。

**Spec:** `docs/superpowers/specs/2026-11-11-meta-progression-design.md`

## Global Constraints

- 全部界面文案中文，句读风格与现有场景一致（「·」分隔、无感叹号）。
- 逻辑画布 480×270；所有 UI 坐标必须落在 0..480 / 0..270 内，竖屏由 `applyPixelZoom` 处理，不得写死像素倍率。
- **不改** `package.json`、`vite.config.js`、`index.html`；不新增 npm 依赖。
- **不提交 git**：工作树已有大量未提交改动（README、docs、sprites 等），本任务不产生 commit，只保留文件改动。
- 现有 47 个测试文件 1064 项必须保持全绿；`apply(target, level)` 的 `level` 默认 0 时行为与旧版完全一致。
- 局外加成必须与现有 cap 共用上限：damageMul/expMul ≤ 1.6，intervalMul/cooldownMul ≥ 0.55，hitBonus ≤ 18，comboWindowMul ≤ 2。
- 数值来源唯一：所有常量只在 `src/data/meta.js` 定义，其他文件 import，禁止就地写魔数。

## Review Focus

1. 坏档 / 手改档 / `localStorage` 不可用（隐私模式、file://）时游戏必须照常开局，不得抛异常。
2. 死亡结算的 `buildSummary()` 目前**不含** `bossResolutions`（只有通关 payload 有）—— 漏补会导致死亡局永远点不亮图鉴。
3. 同一局重复进结算（过场重入、调试直达 `?scene=gameover`）不得重复发残响。
4. `?quick=1` 与 `?stress=1`：quick 减半、stress 完全不结算，避免一键刷档。
5. 「演武」模式（`trainingComplete`）不是正式一局，不得结算、不得计里程碑。
6. 满级 / 上限未解锁 / 残响不足三种升级失败要给出明确原因文案，且不能扣残响。
7. 被动 Lv5 后数值不得越过 cap（尤其 might 与 haste 叠加时）。

---

### Task 1: 被动支持局外等级（progression.js）

**Files:**
- Modify: `src/logic/progression.js:49-72`
- Test: `tests/progression-levels.test.js`（新建）

**Interfaces:**
- Produces: `buff.apply(target, level = 0) -> desc`；`level` 为非正整数/负数/非数字时按 0 处理。11 条 buff 的 `id` 不变。

- [ ] **Step 1: 写失败测试**

```js
import { describe, it, expect } from 'vitest';
import { CHARACTER_BUFFS, COMPASS_BUFFS, rollBuff } from '../src/logic/progression.js';

const character = () => ({ maxHp: 100, hp: 60, speed: 100, pickupRadius: 40, iframeBonus: 0, shieldCap: 30 });
const compass = () => ({ damageMul: 1, intervalMul: 1, cooldownMul: 1, hitBonus: 0, comboWindowMul: 1, expMul: 1 });
const byId = (pool, id) => pool.find(b => b.id === id);

describe('被动局外等级', () => {
  it('等级 0 与旧行为完全一致', () => {
    const t = character();
    byId(CHARACTER_BUFFS, 'life').apply(t, 0);
    expect(t).toEqual({ maxHp: 120, hp: 80, speed: 100, pickupRadius: 40, iframeBonus: 0, shieldCap: 30 });
  });
  it('等级 5 让丰沛生命多给 10 上限与 10 回复', () => {
    const t = character();
    byId(CHARACTER_BUFFS, 'life').apply(t, 5);
    expect(t.maxHp).toBe(130); expect(t.hp).toBe(90);
  });
  it('等级 5 让强能刻度封在 1.6', () => {
    const c = compass();
    byId(COMPASS_BUFFS, 'might').apply(c, 5);
    expect(c.damageMul).toBeCloseTo(1.195, 5);
    for (let i = 0; i < 20; i++) byId(COMPASS_BUFFS, 'might').apply(c, 5);
    expect(c.damageMul).toBe(1.6);
  });
  it('疾转与冷凝不跌破 0.55', () => {
    const c = compass();
    for (let i = 0; i < 30; i++) { byId(COMPASS_BUFFS, 'haste').apply(c, 5); byId(COMPASS_BUFFS, 'chill').apply(c, 5); }
    expect(c.intervalMul).toBe(0.55); expect(c.cooldownMul).toBe(0.55);
  });
  it('等级参数非法时按 0，不产生 NaN', () => {
    for (const bad of [-3, 1.5, NaN, '2', null]) {
      const t = character();
      byId(CHARACTER_BUFFS, 'swift').apply(t, bad);
      expect(t.speed).toBeCloseTo(108, 6);
    }
  });
  it('rollBuff 与等级无关，抽取结果不变', () => {
    const a = rollBuff(COMPASS_BUFFS, () => 0.42); const b = rollBuff(COMPASS_BUFFS, () => 0.42);
    expect(a.id).toBe(b.id);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/progression-levels.test.js`
Expected: FAIL —— 等级 5 的用例得到 `maxHp 120`（`apply` 忽略第二个参数）。

- [ ] **Step 3: 实现**

把 `buff()` 改成接受额外的 `extra` 函数，并在每条 buff 上补齐五级追加（每级追加量写死在对应 buff 旁边）：

```js
function buff(id, name, desc, update, extra = null) {
  return {
    id, name, desc,
    apply(target, level = 0) {
      if (!object(target)) return desc;
      update(target);
      const lv = Number.isSafeInteger(level) && level > 0 ? level : 0;
      if (extra && lv > 0) extra(target, lv);
      return desc;
    },
  };
}
```

每条 buff 的 extra（与 spec 第 4 节表格一致）：

| id | extra(target, lv) |
| --- | --- |
| life | `t.maxHp += 2*lv; t.hp = Math.min(t.maxHp, t.hp + 2*lv)` |
| swift | `t.speed = t.speed * (1 + 0.008*lv)` |
| magnet | `t.pickupRadius += 1.5*lv` |
| tough | `t.iframeBonus += 0.02*lv` |
| aegis | `t.shieldCap += 1.5*lv` |
| might | `t.damageMul = Math.min(1.6, t.damageMul + 0.015*lv)` |
| haste | `t.intervalMul = Math.max(0.55, t.intervalMul * (1 - 0.006*lv))` |
| chill | `t.cooldownMul = Math.max(0.55, t.cooldownMul * (1 - 0.006*lv))` |
| wide | `t.hitBonus = Math.min(18, t.hitBonus + 0.8*lv)` |
| chain | `t.comboWindowMul = Math.min(2, t.comboWindowMul * (1 + 0.04*lv))` |
| greed | `t.expMul = Math.min(1.6, t.expMul + 0.02*lv)` |

每个 extra 内部沿用现有的 `numberOr(value, fallback)` 读数，非数字字段不参与。

- [ ] **Step 4: 跑测试**

Run: `npx vitest run tests/progression-levels.test.js tests/progression.test.js`
Expected: 两个文件全 PASS（`progression.test.js` 证明旧行为未变）。

- [ ] **Step 5: 自查**

`npx vitest run` 全绿后再往下；不提交 git。

---

### Task 2: 里程碑与数值常量（src/data/meta.js）

**Files:**
- Create: `src/data/meta.js`
- Test: `tests/meta-data.test.js`

**Interfaces:**
- Produces:
  - `META_VERSION = 1`
  - `PASSIVE_IDS`（11 个 id，顺序：life swift magnet tough aegis might haste chill wide chain greed）
  - `PASSIVE_LINES = { character: [...5 ids], compass: [...6 ids] }`
  - `LEVEL_COSTS = [10, 24, 48, 80, 120]`（`LEVEL_COSTS[level]` = 从 level 升到 level+1 的残响）
  - `DEFAULT_LEVEL_CAP = 2`、`CAP_UNLOCKS = { 'boss-3': 3, 'boss-5': 4, 'boss-7': 5 }`
  - `MILESTONES`：24 条 `{ id, kind: 'major'|'minor'|'special', bossId?: string, reward: number, unlockCap?: number, label: string }`
  - `SETTLE = { actWeight: 8, killStep: 40, killPoint: 1, miniBoss: 2, majorBoss: 6, quiz: 4, victory: 60, deathRate: 0.6, quickRate: 0.5 }`
  - `META_UI = { resonanceUnit: '残响', lockedHint: '需首杀' }`（文案集中，UI 只拼装）

- [ ] **Step 1: 写失败测试**

```js
import { describe, it, expect } from 'vitest';
import { MILESTONES, PASSIVE_IDS, PASSIVE_LINES, LEVEL_COSTS, CAP_UNLOCKS, DEFAULT_LEVEL_CAP, SETTLE } from '../src/data/meta.js';

describe('局外成长常量', () => {
  it('正好 24 个里程碑，id 不重复', () => {
    expect(MILESTONES).toHaveLength(24);
    expect(new Set(MILESTONES.map(m => m.id)).size).toBe(24);
  });
  it('7 大 + 14 小 + 3 特殊', () => {
    const count = (k) => MILESTONES.filter(m => m.kind === k).length;
    expect([count('major'), count('minor'), count('special')]).toEqual([7, 14, 3]);
  });
  it('大 Boss 奖励 25，小 Boss 8，特殊按 40/60/80', () => {
    for (const m of MILESTONES.filter(m => m.kind === 'major')) expect(m.reward).toBe(25);
    for (const m of MILESTONES.filter(m => m.kind === 'minor')) expect(m.reward).toBe(8);
    expect(MILESTONES.filter(m => m.kind === 'special').map(m => m.reward).sort((a, b) => a - b)).toEqual([40, 60, 80]);
  });
  it('等级上限解锁只挂在大 Boss 3/5/7', () => {
    expect(CAP_UNLOCKS).toEqual({ 'boss-3': 3, 'boss-5': 4, 'boss-7': 5 });
    expect(MILESTONES.filter(m => m.unlockCap).map(m => m.id)).toEqual(['boss-3', 'boss-5', 'boss-7']);
  });
  it('11 条被动、五级消耗递增', () => {
    expect(PASSIVE_IDS).toHaveLength(11);
    expect(PASSIVE_LINES.character.length + PASSIVE_LINES.compass.length).toBe(11);
    expect(LEVEL_COSTS).toEqual([10, 24, 48, 80, 120]);
    expect(DEFAULT_LEVEL_CAP).toBe(2);
  });
  it('结算权重与设计文档一致', () => {
    expect(SETTLE).toEqual({ actWeight: 8, killStep: 40, killPoint: 1, miniBoss: 2, majorBoss: 6, quiz: 4, victory: 60, deathRate: 0.6, quickRate: 0.5 });
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/meta-data.test.js`
Expected: FAIL —— 模块不存在。

- [ ] **Step 3: 实现**

`MILESTONES` 用生成而非手抄，避免 24 行笔误：

```js
const ACTS = [1, 2, 3, 4, 5, 6, 7];
export const MILESTONES = [
  ...ACTS.map(act => ({
    id: 'boss-' + act, kind: 'major', bossId: 'boss-' + act, reward: 25,
    ...(CAP_UNLOCKS['boss-' + act] ? { unlockCap: CAP_UNLOCKS['boss-' + act] } : {}),
    label: '契约主 · 第 ' + act + ' 幕',
  })),
  ...ACTS.flatMap(act => ['a', 'b'].map(suffix => ({
    id: 'miniboss-' + act + suffix, kind: 'minor',
    bossId: 'miniboss-' + act + suffix, reward: 8,
    label: '小契约 · 第 ' + act + ' 幕' + (suffix === 'a' ? '甲' : '乙'),
  }))),
  { id: 'quiz-5', kind: 'special', reward: 60, label: '破局者 · 问答击破 5 次' },
  { id: 'kills-300', kind: 'special', reward: 40, label: '清扫者 · 单局击杀 300' },
  { id: 'clear', kind: 'special', reward: 80, label: '尽解 · 七幕通关' },
];
```

注意：小 Boss 的 `bossId` 必须与 `src/data/encounters.js` 的实际 id 一致（`miniboss-1a` 这种写法），实现时先用 grep 核对一遍再落定。

- [ ] **Step 4: 跑测试**

Run: `npx vitest run tests/meta-data.test.js`
Expected: PASS。

---

### Task 3: 存档层与升级判定（src/logic/meta.js 上半）

**Files:**
- Create: `src/logic/meta.js`
- Test: `tests/meta-save.test.js`

**Interfaces:**
- Produces:
  - `STORAGE_KEY = 'sigilweave:meta:v1'`
  - `defaultMeta() -> { v, resonance, levels, milestones, counters, updatedAt }`（levels 全 0；counters = `{ runs: 0, wins: 0, quizWins: 0, bestAct: 1, bestKills: 0 }`）
  - `sanitizeMeta(raw) -> save`（绝不抛异常）
  - `loadMeta(storage?)`、`saveMeta(save, storage?)`、`resetMeta(storage?)`
  - `metaLevel(save, id) -> 0..5`
  - `levelCap(save) -> 2..5`
  - `upgradeCost(save, id) -> number|null`
  - `canUpgrade(save, id) -> { ok, reason: 'ok'|'unknown'|'maxcap'|'maxlevel'|'cost', cost, cap }`
  - `upgradePassive(save, id) -> { ok, save }`（返回新对象，原对象不变；失败不改残响）
  - storage 参数缺省为 `window.localStorage`；无 window 时返回内存桩，保证测试与 SSR 不炸。

- [ ] **Step 1: 写失败测试**

```js
import { describe, it, expect } from 'vitest';
import { defaultMeta, sanitizeMeta, loadMeta, saveMeta, resetMeta, metaLevel, levelCap, upgradeCost, canUpgrade, upgradePassive, STORAGE_KEY } from '../src/logic/meta.js';

const memStorage = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
};

describe('局外存档', () => {
  it('默认档结构完整，等级全 0', () => {
    const s = defaultMeta();
    expect(s.v).toBe(1); expect(s.resonance).toBe(0);
    expect(Object.keys(s.levels)).toHaveLength(11);
    expect(Object.values(s.levels).every(v => v === 0)).toBe(true);
    expect(s.milestones).toEqual([]);
  });
  it('坏档一律回落默认，不抛异常', () => {
    for (const bad of ['', 'null', '{', '[]', '{"levels":"x"}', '{"resonance":-5}', '{"milestones":["boss-1","boss-1","nope"]}']) {
      const s = sanitizeMeta(bad);
      expect(s.v).toBe(1);
      expect(s.resonance).toBeGreaterThanOrEqual(0);
      expect(new Set(s.milestones).size).toBe(s.milestones.length);
    }
  });
  it('等级夹到 0..5，未知 id 丢弃', () => {
    const s = sanitizeMeta(JSON.stringify({ levels: { life: 9, swift: -2, hack: 3 }, milestones: ['boss-1', 'boss-3'] }));
    expect(s.levels.life).toBe(5); expect(s.levels.swift).toBe(0);
    expect('hack' in s.levels).toBe(false);
    expect(metaLevel(s, 'life')).toBe(5); expect(metaLevel(s, 'hack')).toBe(0);
  });
  it('上限随 boss-3/5/7 首杀提升且取最大', () => {
    const s = defaultMeta();
    expect(levelCap(s)).toBe(2);
    s.milestones = ['boss-3']; expect(levelCap(s)).toBe(3);
    s.milestones = ['boss-3', 'boss-7']; expect(levelCap(s)).toBe(5);
  });
  it('升级消耗按当前等级取，满级返回 null', () => {
    const s = defaultMeta();
    expect(upgradeCost(s, 'life')).toBe(10);
    s.levels.life = 4; expect(upgradeCost(s, 'life')).toBe(120);
    s.levels.life = 5; expect(upgradeCost(s, 'life')).toBe(null);
  });
  it('残响不足 / 未解锁上限 / 已满级分别给原因且不扣钱', () => {
    const s = defaultMeta();
    s.resonance = 0;
    expect(canUpgrade(s, 'life').reason).toBe('cost');
    s.resonance = 999; s.levels.life = 2;
    expect(canUpgrade(s, 'life').reason).toBe('maxcap');
    s.milestones = ['boss-3', 'boss-5', 'boss-7']; s.levels.life = 5;
    expect(canUpgrade(s, 'life').reason).toBe('maxlevel');
    expect(s.resonance).toBe(999);
  });
  it('升级成功才扣残响，且返回新对象', () => {
    const s = defaultMeta(); s.resonance = 30; s.milestones = ['boss-3'];
    const r = upgradePassive(s, 'life');
    expect(r.ok).toBe(true);
    expect(r.save.resonance).toBe(20); expect(r.save.levels.life).toBe(1);
    expect(s.resonance).toBe(30); expect(s.levels.life).toBe(0);
  });
  it('读写走同一 key，坏 JSON 读成默认档', () => {
    const st = memStorage();
    saveMeta(defaultMeta(), st);
    expect(JSON.parse(st.getItem(STORAGE_KEY)).v).toBe(1);
    st.setItem(STORAGE_KEY, '{oops');
    expect(loadMeta(st).resonance).toBe(0);
    resetMeta(st);
    expect(st.getItem(STORAGE_KEY)).toBe(null);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/meta-save.test.js`
Expected: FAIL —— 模块不存在。

- [ ] **Step 3: 实现**

- `sanitizeMeta` 接受「JSON 字符串或对象」：字符串先 `JSON.parse`（try/catch），非对象直接 `defaultMeta()`。
- `resonance` 走 `Number.isSafeInteger(v) && v >= 0 ? v : 0`；`levels` 只保留 `PASSIVE_IDS` 且夹到 0..5；`milestones` 只保留 `MILESTONES` 里的 id、去重；`counters` 每字段单独兜底。
- `levelCap` = `Math.max(DEFAULT_LEVEL_CAP, ...milestones.map(id => CAP_UNLOCKS[id] ?? 0))`。
- `upgradePassive` 先 `canUpgrade`；成功返回 `{ ok: true, save: { ...save, resonance: save.resonance - cost, levels: { ...save.levels, [id]: lv + 1 }, updatedAt: Date.now() } }`。
- `saveMeta` 里 try/catch：写失败（配额/隐私模式）静默忽略，不能让游戏崩。
- 有 `window` 时 `saveMeta` 顺手更新 `window.__SIGILWEAVE_META__ = { save }`（Task 8 会补 `lastSettle`）。

- [ ] **Step 4: 跑测试**

Run: `npx vitest run tests/meta-save.test.js`
Expected: PASS。

---

### Task 4: 结算（settleRun）

**Files:**
- Modify: `src/logic/meta.js`（追加）
- Test: `tests/meta-settle.test.js`

**Interfaces:**
- Consumes: Task 2 的 `MILESTONES`/`SETTLE`，Task 3 的存档工具。
- Produces: `settleRun(save, summary) -> { save, gained, base, multiplier, newMilestones: [{ id, label, reward }] }`
  - `summary` = `{ act, kills, victory, quick, dnf, trainingComplete, stress, bossResolutions?, miniBossResolutions? }`（receipt = `{ act, bossId, method: 'quiz'|'combat', tier, reward }`，来自 `src/logic/boss.js:49-67`）
  - 纯函数：不改入参；`Date.now()` 只用于 `updatedAt`。

- [ ] **Step 1: 写失败测试**

```js
import { describe, it, expect } from 'vitest';
import { defaultMeta, settleRun } from '../src/logic/meta.js';

const receipt = (act, method, tier = 'major', bossId = 'boss-' + act) => ({ act, bossId, method, tier, reward: 12 });
const run = (extra = {}) => ({ act: 1, kills: 0, victory: false, quick: false, bossResolutions: {}, miniBossResolutions: {}, ...extra });

describe('对局结算', () => {
  it('公式：幕数×8 + 击杀/40 + 小/大 Boss + 问答 + 通关 60', () => {
    const s = settleRun(defaultMeta(), run({
      act: 3, kills: 150,
      bossResolutions: { 1: receipt(1, 'combat'), 2: receipt(2, 'quiz'), 3: receipt(3, 'combat') },
      miniBossResolutions: { 'miniboss-1a': receipt(1, 'combat', 'mini', 'miniboss-1a') },
    }));
    expect(s.base).toBe(51); expect(s.multiplier).toBe(0.6); expect(s.gained).toBe(31);
  });
  it('通关按全额且额外 +60', () => {
    const s = settleRun(defaultMeta(), run({ act: 7, kills: 100, victory: true }));
    expect(s.base).toBe(7 * 8 + 2 + 60); expect(s.multiplier).toBe(1); expect(s.gained).toBe(s.base);
  });
  it('quick 再打五折', () => {
    const s = settleRun(defaultMeta(), run({ quick: true, kills: 100 }));
    expect(s.gained).toBe(Math.round((8 + 2) * 0.6 * 0.5));
  });
  it('演武 / 压测 / 已结算不发放', () => {
    for (const extra of [{ trainingComplete: true }, { dnf: true }, { stress: true }]) {
      const s = settleRun(defaultMeta(), run(extra));
      expect(s.gained).toBe(0); expect(s.newMilestones).toEqual([]);
    }
  });
  it('首杀发放一次性残响并去重', () => {
    const first = settleRun(defaultMeta(), run({ bossResolutions: { 1: receipt(1, 'combat') } }));
    expect(first.newMilestones.map(m => m.id)).toEqual(['boss-1']);
    expect(first.save.resonance).toBe(first.gained + 25);
    const again = settleRun(first.save, run({ bossResolutions: { 1: receipt(1, 'combat') } }));
    expect(again.newMilestones).toEqual([]);
    expect(again.save.resonance).toBe(first.save.resonance + again.gained);
  });
  it('问答破局累计到 5 次点亮特殊成就，且只发一次', () => {
    let s = defaultMeta();
    for (let i = 0; i < 5; i++) s = settleRun(s, run({ bossResolutions: { [(i % 7) + 1]: receipt((i % 7) + 1, 'quiz') } })).save;
    expect(s.counters.quizWins).toBe(5);
    expect(s.milestones).toContain('quiz-5');
  });
  it('单局击杀 300 与七幕通关点亮特殊成就', () => {
    const s = settleRun(defaultMeta(), run({ kills: 300, victory: true, act: 7 }));
    expect(s.save.milestones).toEqual(expect.arrayContaining(['kills-300', 'clear']));
    expect(s.save.counters.bestKills).toBe(300); expect(s.save.counters.wins).toBe(1);
  });
  it('counters 只进不退，runs/wins 递增', () => {
    const s = settleRun(defaultMeta(), run({ act: 2, kills: 5 }));
    expect(s.save.counters.runs).toBe(1); expect(s.save.counters.bestAct).toBe(2);
    expect(s.save.counters.bestKills).toBe(5);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/meta-settle.test.js`
Expected: FAIL —— `settleRun` 未导出。

- [ ] **Step 3: 实现**

1. 早退：`if (!summary || summary.trainingComplete || summary.dnf || summary.stress) return { save, gained: 0, base: 0, multiplier: 0, newMilestones: [] }`。
2. 计数：`major` = `Object.values(bossResolutions).filter(r => r && r.tier !== 'mini')`；`mini` = `Object.values(miniBossResolutions)`；`quizWins` = 两者中 `method === 'quiz'` 的条数。
3. `base = act*SETTLE.actWeight + Math.floor(kills/SETTLE.killStep)*SETTLE.killPoint + mini.length*SETTLE.miniBoss + major.length*SETTLE.majorBoss + quizWins*SETTLE.quiz + (victory ? SETTLE.victory : 0)`。
4. `multiplier = (victory ? 1 : SETTLE.deathRate) * (quick ? SETTLE.quickRate : 1)`；`gained = Math.round(base * multiplier)`。
5. 新里程碑候选：`major.map(r => 'boss-' + r.act)` + `mini.map(r => r.bossId)` + 满足条件的特殊 id（`counters.quizWins >= 5`、`kills >= 300`、`victory`）。过滤掉 `save.milestones` 已有的，按 `MILESTONES` 顺序去重。
6. `resonance = save.resonance + gained + 新里程碑 reward 之和`；`counters` 累加（`runs+1`、`wins+(victory?1:0)`、`quizWins+本次`、`bestAct`/`bestKills` 取 max）。
7. 返回新 save（不改入参）与明细。

- [ ] **Step 4: 跑测试**

Run: `npx vitest run tests/meta-settle.test.js`
Expected: PASS。

---

### Task 5: 战斗场景接入（宝箱 / 罗盘 / 结算摘要）

**Files:**
- Modify: `src/logic/meta.js`（追加两个应用助手）
- Modify: `src/scenes/BattleScene.js:59-84`（create 读档）、`:1508-1531`（宝箱）、`:1785-1792`（罗盘）、`:1879-1896`（buildSummary）
- Test: `tests/meta-apply.test.js`

**Interfaces:**
- Produces:
  - `applyPassiveToCharacter(buff, adapter, level) -> desc`
  - `applyPassiveToCompass(buff, compassBuffs, level) -> desc`
  - `metaPassiveLabel(level) -> '' | '（残响 ' + level + '）'`
- Consumes: Task 1 的 `apply(target, level)`、Task 3 的 `loadMeta/metaLevel`。

- [ ] **Step 1: 写失败测试**

```js
import { describe, it, expect } from 'vitest';
import { applyPassiveToCharacter, applyPassiveToCompass, metaPassiveLabel } from '../src/logic/meta.js';
import { CHARACTER_BUFFS, COMPASS_BUFFS } from '../src/logic/progression.js';

const byId = (pool, id) => pool.find(b => b.id === id);

describe('场景侧应用助手', () => {
  it('人物被动按等级加成并返回基础描述', () => {
    const adapter = { maxHp: 100, hp: 60, speed: 100, pickupRadius: 40, iframeBonus: 0, shieldCap: 30 };
    const desc = applyPassiveToCharacter(byId(CHARACTER_BUFFS, 'life'), adapter, 3);
    expect(adapter.maxHp).toBe(126); expect(adapter.hp).toBe(86);
    expect(desc).toContain('生命上限');
    expect(metaPassiveLabel(3)).toBe('（残响 3）');
    expect(metaPassiveLabel(0)).toBe('');
  });
  it('罗盘被动按等级加成', () => {
    const c = { damageMul: 1, intervalMul: 1, cooldownMul: 1, hitBonus: 0, comboWindowMul: 1, expMul: 1 };
    applyPassiveToCompass(byId(COMPASS_BUFFS, 'wide'), c, 2);
    expect(c.hitBonus).toBeCloseTo(7.6, 6);
  });
  it('非法 buff 不炸', () => {
    expect(applyPassiveToCharacter(null, {}, 2)).toBe('');
    expect(applyPassiveToCompass(undefined, {}, 2)).toBe('');
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/meta-apply.test.js`
Expected: FAIL —— 助手未导出。

- [ ] **Step 3: 实现助手并改战斗场景**

助手：

```js
export const metaPassiveLabel = (level) => (Number.isSafeInteger(level) && level > 0 ? '（残响 ' + level + '）' : '');
export function applyPassiveToCharacter(buff, adapter, level = 0) {
  if (!buff || typeof buff.apply !== 'function') return '';
  return buff.apply(adapter, level);
}
export function applyPassiveToCompass(buff, compassBuffs, level = 0) {
  if (!buff || typeof buff.apply !== 'function') return '';
  return buff.apply(compassBuffs, level);
}
```

`BattleScene` 四处改动：

1. `create` 里 `this.run.bossResolutions ??= {};` 之后加 `this.metaSave = loadMeta();`。
2. 宝箱（1510-1531）：
   ```js
   const level = metaLevel(this.metaSave, buff.id);
   const desc = applyPassiveToCharacter(buff, adapter, level);
   // ...adapter 回写部分不变...
   this.effects.text(this.player.x, this.player.y - 14, '宝箱 · ' + buff.name + metaPassiveLabel(level) + '：' + desc, HEX.brassLight, true);
   ```
3. 罗盘（1785-1792）：`const level = metaLevel(this.metaSave, buff.id); const desc = applyPassiveToCompass(buff, this.run.compassBuffs, level);` 后续 `rebuildDerived` 与文案改成 `'罗盘增益 · ' + buff.name + metaPassiveLabel(level) + '：' + desc`。
4. `buildSummary()` 返回值追加：
   ```js
   bossResolutions: structuredClone(this.run.bossResolutions ?? {}),
   miniBossResolutions: structuredClone(this.run.miniBossResolutions ?? {}),
   quick: this.quickMode,
   ```

- [ ] **Step 4: 跑测试与回归**

Run: `npx vitest run tests/meta-apply.test.js tests/character-buffs.test.js tests/boss.test.js`
Expected: 全 PASS。再跑 `npx vitest run` 确认无回归。

---

### Task 6: 祭坛 UI 纯绘制层（src/ui/meta-ui.js）

**Files:**
- Create: `src/ui/meta-ui.js`
- Test: `tests/meta-ui.test.js`

**Interfaces:**
- Produces（纯函数，风格对齐 `src/ui/editor-ui.js`）：
  - `passiveRows(save) -> [{ id, name, line, level, cap, cost, locked, lockText, desc, nextDesc }]`（11 行，人物线 5 行在前）
  - `metaHeader(g, save, text, opts) -> void`
  - `metaPassiveRow(g, row, x, y, w, selected) -> void`
  - `metaCodexGrid(save) -> { cells, litCount }`（4×6）
  - `metaFooter(g, text, opts) -> void`
  - `nextLevelText(id, level) -> string`

- [ ] **Step 1: 写失败测试**

```js
import { describe, it, expect } from 'vitest';
import { passiveRows, metaPassiveRow, metaCodexGrid, nextLevelText } from '../src/ui/meta-ui.js';
import { defaultMeta } from '../src/logic/meta.js';
import { MILESTONES } from '../src/data/meta.js';

function fakeG() {
  const calls = [];
  const g = {
    calls,
    fillStyle: (c, a) => { calls.push(['fillStyle', c, a]); return g; },
    fillRect: (x, y, w, h) => { calls.push(['fillRect', x, y, w, h]); return g; },
    lineStyle: (w, c, a) => { calls.push(['lineStyle', w, c, a]); return g; },
    strokeRect: (x, y, w, h) => { calls.push(['strokeRect', x, y, w, h]); return g; },
    clear: () => { calls.push(['clear']); return g; },
  };
  return g;
}

describe('祭坛 UI', () => {
  it('11 行，人物 5 行在前，等级与消耗正确', () => {
    const rows = passiveRows(defaultMeta());
    expect(rows).toHaveLength(11);
    expect(rows.slice(0, 5).every(r => r.line === 'character')).toBe(true);
    expect(rows[0].cost).toBe(10); expect(rows[0].level).toBe(0);
  });
  it('未解锁上限的行带锁定文案', () => {
    const s = defaultMeta();
    s.levels.life = 2;
    const life = passiveRows(s).find(r => r.id === 'life');
    expect(life.locked).toBe(true);
    expect(life.lockText).toContain('首杀');
  });
  it('行绘制不产生 NaN 且包含 5 个等级点', () => {
    const g = fakeG();
    const row = passiveRows(defaultMeta())[0];
    metaPassiveRow(g, row, 20, 40, 200, true);
    for (const c of g.calls.filter(c => c[0] === 'fillRect')) expect(c.slice(1).every(Number.isFinite)).toBe(true);
    expect(g.calls.filter(c => c[0] === 'fillRect').length).toBeGreaterThanOrEqual(5);
  });
  it('图鉴 24 格，点亮数与存档一致', () => {
    const s = defaultMeta();
    s.milestones = ['boss-1', 'miniboss-1a'];
    const { cells, litCount } = metaCodexGrid(s);
    expect(cells).toHaveLength(MILESTONES.length);
    expect(litCount).toBe(2);
    expect(cells.every(c => Number.isFinite(c.x) && Number.isFinite(c.y))).toBe(true);
    expect(cells.filter(c => c.lit).map(c => c.id).sort()).toEqual(['boss-1', 'miniboss-1a']);
  });
  it('升级文案包含数值变化', () => {
    expect(nextLevelText('life', 0)).toContain('+2');
    expect(nextLevelText('might', 4)).toContain('1.6');
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/meta-ui.test.js`
Expected: FAIL —— 模块不存在。

- [ ] **Step 3: 实现**

- 名字复用 `CHARACTER_BUFFS`/`COMPASS_BUFFS` 的 `name`/`desc`，不另抄中文。
- `metaPassiveRow` 行高 18；5 个等级点 4×4、间距 6；选中行用 `C.brass` 描边。
- `metaCodexGrid`：4 列 × 6 行，格子 100×18，起点 (28, 56)，返回 `{ id, lit, x, y, label }`。
- `nextLevelText` 按 Task 1 的每级追加表生成，例 `life` → `「生命上限 +2 / 回复 +2」`，`might` → `「伤害倍率 +0.015（封顶 1.6）」`。

- [ ] **Step 4: 跑测试**

Run: `npx vitest run tests/meta-ui.test.js`
Expected: PASS。

---

### Task 7: MetaScene、入口与调试直达

**Files:**
- Create: `src/scenes/MetaScene.js`
- Modify: `src/main.js:55`
- Modify: `src/scenes/TitleScene.js:16-32,68-84`
- Test: 浏览器手动验证（场景依赖 Phaser，node 测试不实例化）

**Interfaces:**
- Consumes: Task 3 的 `loadMeta/saveMeta/resetMeta/upgradePassive/canUpgrade/levelCap`、Task 6 的全部绘制函数。
- Produces: `MetaScene`（key `'MetaScene'`），接受 `{ __cine?: boolean }`；键位 `W/S` 或 `↑/↓` 切行、`A/D` 或 `←/→` 换页、`Enter` 升级、`Tab` 切页、`R` 重置（二次确认）、`Esc` 回标题。

- [ ] **Step 1: 场景骨架**

```js
import Phaser from 'phaser';
import { addText, applyPixelZoom } from '../ui/Palette.js';
import { loadMeta, saveMeta, resetMeta, upgradePassive, canUpgrade, levelCap } from '../logic/meta.js';
import { passiveRows, metaHeader, metaPassiveRow, metaCodexGrid, metaFooter, nextLevelText } from '../ui/meta-ui.js';

export default class MetaScene extends Phaser.Scene {
  constructor() { super('MetaScene'); }
  init(data = {}) { this.__cine = !!data.__cine; }
  create() {
    applyPixelZoom(this);
    this.save = loadMeta();
    this.page = 0; this.cursor = 0; this.armedReset = false;
    if (!this.__cine) this.cameras.main.fadeIn(220, 0, 0, 0);
    this.dyn = this.add.graphics().setDepth(5);
    this.texts = [];
    this.bindKeys();
    this.render();
  }
  render() {
    this.dyn.clear();
    this.texts.forEach((t) => t.destroy());
    this.texts = [];
    // 按 this.page 画祭坛页 / 图鉴页；每次 addText 都 push 进 this.texts
  }
}
```

- [ ] **Step 2: 交互与页面**

- 祭坛页：人物左列 x=24、罗盘右列 x=248，行高 18，起点 y=52；选中行高亮；底部详情条显示 `name + desc + nextLevelText(next) + 消耗`。
- 图鉴页：`metaCodexGrid` 画 4×6，未点亮显示 `???`，已点亮显示 `label`；顶部显示 `已点亮 N/24`。
- 升级：`upgradePassive` 成功 → `this.save = r.save; saveMeta(this.save);` 重绘；失败 → 底部按 `reason` 提示（`'残响不足'` / `'已达当前上限，需首杀更强的契约主'` / `'已满级'`）。
- 重置：第一次 `R` 只把文案改成 `再按 R 确认清除`（2 秒后自动取消），第二次 `resetMeta(); this.save = loadMeta();`。
- `?resonance=999`：`create` 读到且非生产构建时，把内存 `this.save.resonance = 999`（不写档），便于验收截图。
- `?scene=meta`：`TitleScene.create` 的 jump 分支加 `if (params.get('scene') === 'meta') { this.scene.start('MetaScene'); return; }`，放在 `battle` 之前。
- 每次 render 更新 `window.__SIGILWEAVE_META__ = { save: this.save, page: this.page }`。

- [ ] **Step 3: 标题页入口**

`TitleScene.create` 第 72-73 行下方加提示 `'B 残响祭坛 · 契约图鉴'`（`y=250`，字号 7，`HEX.brassDark`），并加：

```js
this.input.keyboard.on('keydown-B', this.openMeta, this);
this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.input.keyboard.off('keydown-B', this.openMeta, this));
openMeta() { if (this.started) return; this.started = true; this.scene.start('MetaScene'); }
```

注意复用 `started` 守卫，避免 B 与 Enter 同时触发。

- [ ] **Step 4: 注册场景 + 构建**

`src/main.js:55` 的 scene 数组里 `TitleScene` 之后插入 `MetaScene`（先 import）。然后：

Run: `npm run build`
Expected: 构建成功。

- [ ] **Step 5: 浏览器验证**

`npm run dev` 后：
- `http://127.0.0.1:5173/?scene=meta` —— 切行、上限锁定文案正确；
- `...?scene=meta&resonance=999` —— 能升到 2 级并扣款；
- 标题页按 B 进入、Esc 返回。

---

### Task 8: 结算页残响行 + 结算写档 + 文档

**Files:**
- Modify: `src/scenes/GameOverScene.js:118-136`
- Modify: `README.md`、`docs/规则契约.md`
- Test: 手动 + Task 4 单测已覆盖公式

**Interfaces:**
- Consumes: `settleRun`、`loadMeta`、`saveMeta`；`this.data.bossResolutions / miniBossResolutions / quick / victory / act / kills`。

- [ ] **Step 1: 结算**

`GameOverScene.create` 在 `writeStats()` 之前：

```js
settleMeta() {
  if (this.data.trainingComplete || this.data.__metaSettled) return null;
  const stress = new URLSearchParams(window.location.search).get('stress') === '1';
  const result = settleRun(loadMeta(), {
    act: this.data.act, kills: this.data.kills, victory: !!this.data.victory,
    quick: !!this.data.quick, stress,
    bossResolutions: this.data.bossResolutions ?? {},
    miniBossResolutions: this.data.miniBossResolutions ?? {},
  });
  this.data.__metaSettled = true;
  if (result.gained > 0 || result.newMilestones.length) {
    saveMeta(result.save);
    window.__SIGILWEAVE_META__ = { save: result.save, lastSettle: result };
  }
  return result;
}
```

- [ ] **Step 2: 显示**

`writeStats` 里现有 4 行下方、194 行那句之前插一行，并在过长时折行：

```js
if (this.metaResult && this.metaResult.gained > 0) {
  const line = '残响 +' + this.metaResult.gained
    + (this.metaResult.newMilestones.length ? '　·　新契约：' + this.metaResult.newMilestones.map((m) => m.label).join('、') : '');
  addText(this, 240, 178, line, 8, HEX.brass, { noStroke: true, wordWrap: { width: 320 } })
    .setOrigin(0.5, 0).setDepth(3);
}
```

面板可用到 `y=190`；若折行后压到 194 行提示，把原有 4 行数据整体上移 4~8px（`112 + i*19` → `108 + i*19`），以实机截图为准。

- [ ] **Step 3: 文档**

- `README.md` 加一节：残响祭坛是什么、B 键入口、结算公式一句话、24 个里程碑。
- `docs/规则契约.md` 加同源说明（存档 key、上限解锁、quick/stress 例外）。

- [ ] **Step 4: 端到端验证（必须真跑）**

```bash
npx vitest run
npm run build
```

再开 dev server 实测并截图：
1. 标题 → B → 升一级「丰沛生命」→ Esc → 回标题。
2. `?scene=battle` 吃宝箱，气泡出现「（残响 1）」且生命上限变高。
3. 死亡 → 结算页「残响 +N」→ 回标题 → B，余额已更新。
4. `?quick=1` 再死一局，残响减半。
5. 图鉴页：已点亮 Boss 与未点亮 `???` 并存。
6. 截图存 `docs/meta/`。

---

## Self-Review

- 规格覆盖：11 条被动（Task 1）、24 里程碑（Task 2）、存档与上限（Task 3）、结算公式与折损（Task 4）、战斗内触发强化（Task 5）、祭坛 UI 与标题入口（Task 6-7）、结算展示与文档（Task 8）—— spec 第 4~8 节均有对应任务。
- 无占位符：所有测试与关键代码可粘贴；`MetaScene` 的像素级布局留给实机截图校准（480×270 下换行只能在浏览器里看）。
- 命名一致性：`levelCap`、`metaLevel`、`upgradePassive`、`settleRun`、`metaPassiveLabel` 在各任务引用一致；`passiveRows` 返回字段与 Task 6 测试一致。
- 风险点见 Review Focus，尤其「死亡摘要缺 bossResolutions」由 Task 5 Step 3.4 修掉。
