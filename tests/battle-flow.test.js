// 五幕七场的流程回归：换场（场 4/6）、通幕（场 1/2/3/5）、终局（场 7）三条路径，
// 以及七场连打的账目（7 条大 Boss 收据 + 20 条小 Boss 收据）。
// 沙箱里跑不了真实浏览器，这里用最小 Phaser 替身把 BattleScene 的方法按真实调用顺序驱动起来：
// 它不能证明像素好看，但能证明「换场不开工作台、通幕卡属于刚打完的那一幕、七契不漏不重」。
import { describe, it, expect, vi, beforeEach } from 'vitest';

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

// 过场入口替身：只记录调用参数，不真的切场景（切场由 playCutscene 自己的测试覆盖）。
const transition = vi.hoisted(() => ({ calls: [], disabled: false }));
vi.mock('../src/ui/transition.js', () => ({
  CUTSCENE_KEY: 'CutsceneScene',
  cutscenesDisabled: () => transition.disabled,
  playCutscene: (scene, options) => { transition.calls.push({ key: scene.scene?.key, ...options }); return true; },
}));

const sfxLog = vi.hoisted(() => []);
vi.mock('../src/audio/Sfx.js', () => ({
  sfx: new Proxy({}, { get: (_t, prop) => (...args) => { sfxLog.push([String(prop), ...args]); } }),
  toggleSound: () => {},
}));

import BattleScene from '../src/scenes/BattleScene.js';
import { createRun } from '../src/logic/run.js';
import { createGrid, rebuildDerived } from '../src/logic/grid.js';
import { SigilEngine } from '../src/logic/engine.js';
import { ACTS, WORLD_SIZES } from '../src/logic/constants.js';
import { chapterOf, firstStageOf, minorBossIdsOfStage, nextStage } from '../src/logic/acts.js';
import { MAJOR_BOSS_LEVEL, levelStats } from '../src/logic/progression.js';
import { getEventPoints } from '../src/data/map-events.js';
import { getEncounterForStage, getMinibossEncounters } from '../src/data/encounters.js';
import { STAGE_CARDS } from '../src/data/cinematics.js';
import { stageSpellCard } from '../src/scenes/battle-pure.js';
import { enemySpawnLoad } from '../src/logic/spawn.js';
import { pickEnemyType } from '../src/data/roster.js';

const noop = () => {};
const chain = (extra = {}) => new Proxy({ ...extra }, {
  get(target, prop) {
    if (prop in target) return target[prop];
    return () => proxySelf;
  },
});
let proxySelf;

function makeGraphics() {
  const g = { clears: 0, clear() { g.clears++; return g; } };
  return new Proxy(g, { get: (t, p) => (p in t ? t[p] : () => g) });
}

function makeCamera() {
  const calls = [];
  const cam = { calls };
  for (const name of ['setBounds', 'setDeadzone', 'setFollowOffset', 'startFollow', 'stopFollow', 'flash', 'shake', 'fadeIn', 'setZoom', 'centerOn']) {
    cam[name] = (...args) => { calls.push([name, ...args]); return cam; };
  }
  return cam;
}

function makeEnemy(x = 0, y = 0) {
  return { x, y, alive: true, destroyed: 0, destroy() { this.destroyed++; this.alive = false; } };
}

// 只带流程方法需要的最小上下文，不启动 Phaser 渲染。
function makeScene(stage = 1, opts = {}) {
  const run = opts.run ?? createRun('flow-seed');
  run.chapter = chapterOf(stage);
  run.stage = stage;
  // 跨幕续场时传入同一个 run：账目/手牌/成长必须延续，不能被重建覆盖。
  run.progression ??= { level: opts.level ?? 1, exp: 0 };
  run.compassBuffs ??= { damageMul: 1, intervalMul: 1, cooldownMul: 1, hitBonus: 0, comboWindowMul: 1, expMul: 1 };
  run.hand ??= {};
  run.completedEvents ??= opts.completedEvents ?? {};
  run.majorBossStages ??= opts.majorBossStages ?? {};
  run.bossResolutions ??= opts.bossResolutions ?? {};
  run.miniBossResolutions ??= opts.miniBossResolutions ?? {};
  run.encounters = { active: null, history: [] };

  const world = WORLD_SIZES[stage];
  const grid = createGrid();
  for (const id of [4, 5, 6, 7, 9, 10]) grid.cells[id].unlocked = true;
  grid.cells[5].slot = { kind: 'sigil', defId: 'arcane_bolt' };
  rebuildDerived(grid, ACTS[run.chapter - 1].baseIntervalMs);

  const scene = {
    scene: { key: 'BattleScene', starts: [], start(key, data) { this.starts.push({ key, data }); } },
    run,
    stage,
    chapter: run.chapter,
    stageOutcome: 'none',
    quickMode: false,
    world: { w: world.w, h: world.h },
    worldBounds: { left: 24, top: 40, right: world.w - 24, bottom: world.h - 24 },
    grid,
    engine: new SigilEngine({ grid, seed: 'flow', startCells: [5] }),
    combatRng: { next: () => 0.5 },
    metaSave: { passives: {} },
    phase: 'play',
    paused: false,
    bossStarted: false,
    bossDefeated: false,
    boss: null,
    kills: opts.kills ?? 0,
    shardCount: opts.shards ?? 0,
    peakRate: 0,
    killStreak: 0,
    lastKillAt: 0,
    streakBest: 0,
    expKillAccum: 0,
    timeExpTimer: 0,
    spawnTimer: 0,
    warmupMs: 0,
    transitionLeft: 0,
    stageIntroLeft: 0,
    hitstopLeft: 0,
    editOpen: false,
    menuOpen: false,
    focusPaused: false,
    spaceHeld: false,
    stressRunning: false,
    pendingPicks: 0,
    enemies: [makeEnemy(10, 10), makeEnemy(20, 20)],
    hostileShots: [{ x: 1, y: 1, vx: 0, vy: 0, damage: 1, lifeMs: 100 }],
    chests: [{ g: makeGraphics() }],
    projectiles: [],
    expMotes: [],
    shards: [],
    eventPoints: getEventPoints(stage, { w: world.w, h: world.h }).map(p => ({ ...p, done: !!run.completedEvents[p.id], icon: null, label: null })),
    player: {
      x: world.w / 2, y: world.h / 2, hp: 80, maxHp: 100, alive: true, moving: true, radius: 5,
      invulnUntil: 0, draws: 0, draw() { this.draws++; },
    },
    background: { act: stage, setAct(a) { this.act = a; }, update: noop },
    cameras: { main: makeCamera() },
    hostileG: makeGraphics(),
    effects: { texts: [], update: noop, text(x, y, text) { this.texts.push({ x, y, text }); }, burst: noop, killStreak: noop },
    input: { keyboard: { resetKeys: noop }, on: noop, off: noop },
    hud: { actText: { text: '' }, updates: [], update(payload) { this.updates.push(payload); } },
    board: { setDetailVisible: noop, updateDynamic: noop },
    pauseMenu: { hide: noop, show: noop, setVisible: noop },
    hint: { setVisible: noop },
    pauseHint: { setVisible: noop },
    keys: { space: { isDown: false } },
    // 流程里会调到的重活，用记录型替身顶住（它们各自有专门的测试）
    flushExpMotes() { this.flushed = (this.flushed ?? 0) + 1; },
    releaseProjectiles() { this.released = (this.released ?? 0) + 1; this.projectiles = []; },
    queueLevelPicks(n) { this.pendingPicks += n; },
    resumeFollow(offsetY = 0) { this.followResumed = (this.followResumed ?? 0) + 1; this.cameras.main.startFollow(this.player, true, 0.12, 0.12); },
    syncPauseState: noop,
    updateFrequency: noop,
    updateEventPointVisuals: noop,
    updateChests: noop,
    checkDeath: noop,
    updateHint: noop,
    updateStartSample: noop,
    updatePlayer: noop,
    updateSpawner: noop,
    updateEnemies: noop,
    updateHostileShots: noop,
    updateProjectiles: noop,
    updateShards: noop,
    updateExpMotes: noop,
  };
  scene.battleBounds = scene.worldBounds;
  scene.engine.now = opts.now ?? 120000;
  // 被测方法彼此调用（finishStage → swapStage / buildSummary），把原型方法绑到替身上，
  // 只顶掉渲染与实体重活，流程逻辑全部走真实实现。
  for (const name of ['finishStage', 'swapStage', 'startBossClearTransition', 'defeatBoss', 'buildSummary', 'checkProgressEvents', 'update', 'updateSummons', 'grantSkill', 'skillCdOf', 'saveProgress']) {
    scene[name] = BattleScene.prototype[name].bind(scene);
  }
  return scene;
}

const call = (scene, method, ...args) => BattleScene.prototype[method].call(scene, ...args);
// update() 把单帧 delta 夹到 50ms（顿帧保护），所以推进 N 毫秒必须按帧走，不能一次喂大 delta。
const advance = (scene, ms) => { for (let t = 0; t < ms; t += 50) call(scene, 'update', t, 50); };
const cutscenes = () => transition.calls;
const lastCutscene = () => transition.calls.at(-1);

beforeEach(() => { transition.calls.length = 0; transition.disabled = false; sfxLog.length = 0; });

describe('幕内换场（场 4 → 5、场 6 → 7）', () => {
  it.each([[4, 5], [6, 7]])('场 %i 大 Boss 解决后原地换到 %i，不打开幕间工作台', (from, to) => {
    const scene = makeScene(from);
    call(scene, 'defeatBoss', 'quiz', 'boss-' + from, 'major');
    expect(scene.stageOutcome).toBe('swap');
    expect(scene.bossDefeated).toBe(true);
    call(scene, 'startBossClearTransition');
    expect(scene.phase).toBe('bossDefeated');
    call(scene, 'finishStage');
    // 换场：场号/幕号推进，但幕号不变（同一幕的两场）
    expect(scene.stage).toBe(to);
    expect(scene.run.stage).toBe(to);
    expect(scene.chapter).toBe(chapterOf(from));
    expect(scene.run.chapter).toBe(chapterOf(from));
    expect(scene.phase).toBe('stageIntro');
    expect(scene.stageIntroLeft).toBe(1600);
    // 关键：换场不走幕间，也不播通幕过场
    expect(cutscenes()).toHaveLength(0);
    expect(scene.scene.starts).toHaveLength(0);
    expect(scene.run.reports).toHaveLength(0);
  });

  it.each([[4, 5], [6, 7]])('场 %i → %i 换场重建世界层并清场，保留构筑与资源', (from, to) => {
    const scene = makeScene(from, { kills: 37, shards: 21 });
    scene.run.hand['sigil:frost_arrow'] = 2;
    scene.player.hp = 63;
    const gridBefore = scene.grid;
    const engineBefore = scene.engine;
    const nowBefore = scene.engine.now;
    call(scene, 'swapStage', to);
    const world = WORLD_SIZES[to];
    expect(scene.world).toEqual({ w: world.w, h: world.h });
    expect(scene.background.act).toBe(to);
    expect(scene.cameras.main.calls.some(c => c[0] === 'setBounds' && c[3] === world.w && c[4] === world.h)).toBe(true);
    // 清场：旧场敌人/宝箱/弹幕全部回收
    expect(scene.enemies).toHaveLength(0);
    expect(scene.chests).toHaveLength(0);
    expect(scene.hostileShots).toHaveLength(0);
    expect(scene.boss).toBeNull();
    expect(scene.bossStarted).toBe(false);
    expect(scene.bossDefeated).toBe(false);
    // 保留：构筑、引擎时间、血量、击杀、碎晶、手牌
    expect(scene.grid).toBe(gridBefore);
    expect(scene.engine).toBe(engineBefore);
    expect(scene.engine.now).toBe(nowBefore);
    expect(scene.player.hp).toBe(63);
    expect(scene.kills).toBe(37);
    expect(scene.shardCount).toBe(21);
    expect(scene.run.hand['sigil:frost_arrow']).toBe(2);
    // 玩家落到新场中心，事件点按新场重建
    expect(scene.player.x).toBe(world.w / 2);
    expect(scene.player.y).toBe(world.h / 2);
    expect(scene.eventPoints.map(p => p.id)).toEqual(getEventPoints(to, world).map(p => p.id));
    expect(scene.eventPoints).toHaveLength(to <= 3 ? 5 : 3);
    // 场次卡文案取自新场
    const card = STAGE_CARDS[to];
    expect(scene.effects.texts.some(t => t.text.includes(card.title))).toBe(true);
    expect(scene.spawnTimer).toBe(700);
    expect(scene.warmupMs).toBe(1400);
  });

  it('换场后旧场已完成的事件点保持完成，新场事件点从零开始', () => {
    const scene = makeScene(4);
    for (const id of ['npc-4', 'miniboss-4a', 'miniboss-4b']) scene.run.completedEvents[id] = true;
    call(scene, 'swapStage', 5);
    expect(scene.eventPoints.every(p => p.done === false)).toBe(true);
    call(scene, 'swapStage', 6);
    expect(scene.eventPoints.map(p => p.id)).toEqual(['npc-6', 'miniboss-6a', 'miniboss-6b']);
  });

  it('场次卡停留 1.6 秒后接回战斗并给短暂无敌', () => {
    const scene = makeScene(4);
    call(scene, 'swapStage', 5);
    expect(scene.paused).toBe(true);
    expect(scene.engine.paused).toBe(true);
    advance(scene, 800);
    expect(scene.phase).toBe('stageIntro');
    advance(scene, 800);
    expect(scene.phase).toBe('play');
    expect(scene.paused).toBe(false);
    expect(scene.engine.paused).toBe(false);
    expect(scene.player.invulnUntil).toBe(scene.engine.now + 900);
    expect(scene.followResumed).toBeGreaterThan(0);
  });

  it.each([[0, 4], [8, 4], [5, 5], [4, 4]])('非法或原地换场（%i → %i）被拒绝，状态不变', (from, to) => {
    const scene = makeScene(from === 0 || from === 8 ? 4 : from);
    const before = { stage: scene.stage, phase: scene.phase, world: { ...scene.world } };
    call(scene, 'swapStage', to);
    expect(scene.stage).toBe(before.stage);
    expect(scene.phase).toBe(before.phase);
    expect(scene.world).toEqual(before.world);
  });
});

describe('通幕（场 1/2/3/5）', () => {
  it.each([[1, 2, 2], [2, 3, 3], [3, 4, 4], [5, 5, 6]])('场 %i 大 Boss 解决后通幕到第 %i 幕第 %i 场，过场卡属于刚打完的那一幕', (stage, nextChapter, nextFirstStage) => {
    const scene = makeScene(stage);
    call(scene, 'defeatBoss', 'quiz', 'boss-' + stage, 'major');
    expect(scene.stageOutcome).toBe('clear');
    call(scene, 'startBossClearTransition');
    call(scene, 'finishStage');
    expect(scene.phase).toBe('intermission');
    // 幕号推进到下一幕，场号落到该幕第一场
    expect(scene.chapter).toBe(nextChapter);
    expect(scene.stage).toBe(nextFirstStage);
    expect(scene.run.chapter).toBe(nextChapter);
    expect(scene.run.stage).toBe(nextFirstStage);
    // 过场卡：act = 刚清空的幕，stage = 刚清空的场（合并幕取后半场）
    const cut = lastCutscene();
    expect(cut.kind).toBe('clear');
    expect(cut.act).toBe(chapterOf(stage));
    expect(cut.stage).toBe(stage);
    expect(cut.to).toBe('IntermissionScene');
    // payload.run 已指向下一幕第一场，供幕间工作台使用
    expect(cut.payload.run.chapter).toBe(nextChapter);
    expect(cut.payload.run.stage).toBe(nextFirstStage);
    // 本幕统计入账一次，构筑快照按刚打完的幕号
    expect(scene.run.reports).toHaveLength(1);
    expect(scene.run.reports[0].chapter).toBe(chapterOf(stage));
    expect(scene.run.reports[0].stage).toBe(stage);
    expect(scene.run.draft.act).toBe(chapterOf(stage));
  });

  it('通幕只记账一次：重复调用 finishStage 不会重复入账', () => {
    const scene = makeScene(2);
    call(scene, 'defeatBoss', 'quiz', 'boss-2', 'major');
    call(scene, 'startBossClearTransition');
    call(scene, 'finishStage');
    const reports = scene.run.reports.length;
    call(scene, 'finishStage');
    expect(scene.run.reports).toHaveLength(reports);
  });

  it('phase 不是 bossDefeated 时 finishStage 不动账目', () => {
    const scene = makeScene(3);
    scene.phase = 'play';
    call(scene, 'finishStage');
    expect(scene.run.reports).toHaveLength(0);
    expect(cutscenes()).toHaveLength(0);
  });

  it('小 Boss 解决不通幕、不换场，只按 id 记一条 6 碎晶收据', () => {
    const scene = makeScene(1);
    call(scene, 'defeatBoss', 'quiz', 'miniboss-1a', 'mini');
    expect(scene.stageOutcome).toBe('none');
    expect(scene.bossDefeated).toBe(false);
    expect(scene.stage).toBe(1);
    expect(scene.run.miniBossResolutions['miniboss-1a']).toMatchObject({ stage: 1, tier: 'mini', reward: 6, method: 'quiz' });
    expect(scene.shardCount).toBe(6);
    expect(cutscenes()).toHaveLength(0);
    // 同一只小 Boss 再打一次不重复发奖
    call(scene, 'defeatBoss', 'combat', 'miniboss-1a', 'mini');
    expect(scene.shardCount).toBe(6);
    expect(Object.keys(scene.run.miniBossResolutions)).toHaveLength(1);
  });

  it('大 Boss 收据按场记账且幂等，每场固定法术进手牌', () => {
    const scene = makeScene(6);
    call(scene, 'defeatBoss', 'quiz', 'boss-6', 'major');
    expect(scene.run.bossResolutions[6]).toMatchObject({ stage: 6, bossId: 'boss-6', tier: 'major', reward: 12 });
    // 变体在发牌时摇定：固定法术进手牌时键形如 sigil:starfall#base。
    const spell = stageSpellCard(6);
    expect(Object.entries(scene.run.hand).some(([k, v]) => k.startsWith('sigil:' + spell + '#') && v === 1)).toBe(true);
    expect(scene.shardCount).toBe(12);
    call(scene, 'defeatBoss', 'combat', 'boss-6', 'major');
    expect(scene.shardCount).toBe(12);
    expect(Object.keys(scene.run.bossResolutions)).toHaveLength(1);
  });
});

describe('终局（场 7）', () => {
  function victoryScene() {
    const scene = makeScene(7);
    // 前六场的大 Boss 收据都已在账上（含换场的场 4/6）
    for (let s = 1; s <= 6; s++) {
      scene.run.bossResolutions[s] = { stage: s, bossId: 'boss-' + s, method: 'quiz', tier: 'major', reward: 12 };
    }
    // 但幕统计只在通幕时入账：场 1/2/3/5 四条（场 4/6 是换场，不入账）
    for (const s of [1, 2, 3, 5]) {
      scene.run.reports.push({ chapter: chapterOf(s), stage: s, elapsedMs: 1000 * s, kills: 10 * s, triggers: 100 * s, combos: s, blocked: s, peakRate: s });
    }
    return scene;
  }

  it('场 7 大 Boss 解决 → victory，过场去 StoryScene 且带七条收据', () => {
    const scene = victoryScene();
    call(scene, 'defeatBoss', 'quiz', 'boss-7', 'major');
    expect(scene.stageOutcome).toBe('victory');
    call(scene, 'startBossClearTransition');
    call(scene, 'finishStage');
    const cut = lastCutscene();
    expect(cut.kind).toBe('victory');
    expect(cut.act).toBe(5);
    expect(cut.stage).toBe(7);
    expect(cut.to).toBe('StoryScene');
    expect(cut.payload.mode).toBe('ending');
    const stats = cut.payload.stats;
    expect(stats.victory).toBe(true);
    expect(Object.keys(stats.bossResolutions)).toHaveLength(7);
    expect(stats.chapter).toBe(5);
    expect(stats.stage).toBe(7);
    // 终局先把第五幕（场 7）入账，再对五条幕报告求和：
    // 前四次通幕 elapsedMs 1000*(1+2+3+5)=11000、kills 10*(1+2+3+5)=110；
    // 第五条是本场 engine.now=120000 与 defeatBoss 记的 1 次击杀。
    expect(scene.run.reports.map(r => r.chapter)).toEqual([1, 2, 3, 4, 5]);
    expect(scene.run.reports.at(-1).stage).toBe(7);
    expect(stats.elapsedMs).toBe(11000 + 120000);
    expect(stats.kills).toBe(110 + 1);
    // buildSummary 的本场口径仍在：chapter/stage 是第七场
    expect(stats.hp).toBe(0);
    // 终局不再推进幕号
    expect(scene.chapter).toBe(5);
    expect(scene.stage).toBe(7);
  });

  it('?cine=0 时终局直达胜利结算面板，仍带七条收据', () => {
    transition.disabled = true;
    const scene = victoryScene();
    call(scene, 'defeatBoss', 'quiz', 'boss-7', 'major');
    call(scene, 'startBossClearTransition');
    call(scene, 'finishStage');
    expect(scene.scene.starts).toHaveLength(1);
    expect(scene.scene.starts[0].key).toBe('GameOverScene');
    const data = scene.scene.starts[0].data;
    expect(data.victory).toBe(true);
    expect(Object.keys(data.bossResolutions)).toHaveLength(7);
    expect(data.__cine).toBeUndefined();
  });
});

describe('七场连打的账目完整性', () => {
  it('走完七场：7 条大 Boss 收据 + 20 条小 Boss 收据 + 27 个事件点，幕间只开 4 次', () => {
    let scene = makeScene(1);
    const majorIds = [];
    const miniIds = [];
    let intermissions = 0;
    let swaps = 0;
    for (let stage = 1; stage <= 7; stage++) {
      expect(scene.stage).toBe(stage);
      expect(scene.chapter).toBe(chapterOf(stage));
      // 本场事件点：1 NPC + 4 或 2 小 Boss
      const points = scene.eventPoints;
      expect(points).toHaveLength(stage <= 3 ? 5 : 3);
      const npc = points.find(p => p.type === 'npc');
      expect(npc.id).toBe('npc-' + stage);
      expect(getEncounterForStage(stage, 'npc').id).toBe('npc-' + stage);
      // 小 Boss 逐个按 id 结算（问答击破）
      const minis = getMinibossEncounters(stage);
      expect(minis.map(m => m.id)).toEqual(minorBossIdsOfStage(stage));
      for (const mini of minis) {
        call(scene, 'defeatBoss', 'quiz', mini.id, 'mini');
        miniIds.push(mini.id);
        scene.run.completedEvents[mini.id] = true;
      }
      scene.run.completedEvents[npc.id] = true;
      // 大 Boss：等级达标才触发
      expect(MAJOR_BOSS_LEVEL[stage]).toBeGreaterThanOrEqual(5);
      scene.run.progression.level = MAJOR_BOSS_LEVEL[stage];
      const major = getEncounterForStage(stage, 'boss');
      expect(major.id).toBe('boss-' + stage);
      call(scene, 'defeatBoss', 'quiz', major.id, 'major');
      majorIds.push(major.id);
      call(scene, 'startBossClearTransition');
      call(scene, 'finishStage');
      if (stage === 4 || stage === 6) {
        swaps++;
        expect(scene.phase).toBe('stageIntro');
        // 换场后接回战斗，继续下一场
        advance(scene, 1600);
        expect(scene.phase).toBe('play');
      } else if (stage < 7) {
        intermissions++;
        expect(scene.phase).toBe('intermission');
        // 幕间工作台结束后回到战斗：下一幕第一场由 create() 重建，这里用同一 run 续场
        const run = scene.run;
        scene = makeScene(run.stage, { run });
      }
    }
    expect(swaps).toBe(2);
    expect(intermissions).toBe(4);
    expect(majorIds).toEqual([1, 2, 3, 4, 5, 6, 7].map(s => 'boss-' + s));
    expect(miniIds).toHaveLength(20);
    expect(new Set(miniIds).size).toBe(20);
    expect(Object.keys(scene.run.bossResolutions)).toHaveLength(7);
    expect(Object.keys(scene.run.miniBossResolutions)).toHaveLength(20);
    expect(Object.keys(scene.run.completedEvents)).toHaveLength(27);
    // 七契：每条大 Boss 收据 12 碎晶，每条小 Boss 收据 6 碎晶
    expect(Object.values(scene.run.bossResolutions).every(r => r.reward === 12)).toBe(true);
    expect(Object.values(scene.run.miniBossResolutions).every(r => r.reward === 6)).toBe(true);
    // 五幕统计各一条：幕 1/2/3 在各自那场入账，幕 4 在场 5 入账（场 4 换场不入账），
    // 幕 5 在场 7 终局时入账（场 6 换场不入账）。
    expect(scene.run.reports.map(r => r.chapter)).toEqual([1, 2, 3, 4, 5]);
    expect(scene.run.reports.map(r => r.stage)).toEqual([1, 2, 3, 5, 7]);
    // 终局过场已触发
    expect(lastCutscene().kind).toBe('victory');
  });
});

describe('事件点触发与遭遇接线', () => {
  it('走近 NPC 点触发本场 NPC 遭遇，等级达标触发本场大 Boss', () => {
    const scene = makeScene(5);
    scene.run.progression.level = 1;
    const npc = scene.eventPoints.find(p => p.type === 'npc');
    scene.player.x = npc.x; scene.player.y = npc.y;
    // beginEncounter 需要完整的问答面板，这里只验证 checkProgressEvents 选中的定义
    const picked = [];
    scene.beginEncounter = def => picked.push(def.id);
    call(scene, 'checkProgressEvents');
    expect(picked).toEqual(['npc-5']);
    // 等级顶到 24：大 Boss 优先于事件点
    scene.run.progression.level = MAJOR_BOSS_LEVEL[5];
    call(scene, 'checkProgressEvents');
    expect(picked).toEqual(['npc-5', 'boss-5']);
    // 大 Boss 已触发过就不再重复开问答；NPC 点也已完成，于是本场无可触发事件
    scene.run.majorBossStages[5] = true;
    scene.bossStarted = false;
    npc.done = true;
    call(scene, 'checkProgressEvents');
    expect(picked).toEqual(['npc-5', 'boss-5']);
  });

  it('已完成的事件点不再触发', () => {
    const scene = makeScene(2);
    scene.run.progression.level = 1;
    for (const p of scene.eventPoints) { p.done = true; scene.run.completedEvents[p.id] = true; }
    const npc = scene.eventPoints[0];
    scene.player.x = npc.x; scene.player.y = npc.y;
    const picked = [];
    scene.beginEncounter = def => picked.push(def.id);
    call(scene, 'checkProgressEvents');
    expect(picked).toEqual([]);
  });
});

// ---------- 变体刷怪接入（spec §4） ----------
// 这一组只驱动刷怪/破盾/护盾受击的表现接线；实体内部与 AI 由各自测试覆盖。
function spawnGraphics() {
  const target = {};
  const proxy = new Proxy(target, {
    get: (t, prop) => (prop in t ? t[prop] : (..._args) => proxy),
  });
  target.clear = () => proxy;
  return proxy;
}

function spawnScene(stage = 3) {
  const scene = makeScene(stage);
  scene.enemies = [];
  scene.enemySeq = 0;
  // Enemy 构造需要 graphics；纹理/动画缺失时实体自动走程序化回退
  scene.add = { graphics: () => spawnGraphics() };
  // 场景替身只绑「被测方法直接调用、且真实实现会互相调用」的那几个原型方法
  scene.spawnEnemy = BattleScene.prototype.spawnEnemy.bind(scene);
  scene.bumpKillStreak = BattleScene.prototype.bumpKillStreak.bind(scene);
  return scene;
}

describe('变体刷怪接入（enemySpawnLoad / spawnEnemy / 槽位预算）', () => {
  it('enemySpawnLoad：普通 1、天生精英 2、重甲变体 2，跳过死亡项，空数组 0', () => {
    expect(enemySpawnLoad()).toBe(0);
    expect(enemySpawnLoad([])).toBe(0);
    expect(enemySpawnLoad([
      { def: { id: 'skeleton' } },                                   // 普通 = 1
      { def: { id: 'knight', elite: true } },                        // 天生精英 = 2
      { def: { id: 'bat', variant: { id: 'heavy', cost: 2 } } },     // 重甲变体 = 2
      { def: { id: 'bat', variant: { id: 'swift', cost: 1 } } },     // 疾行 = 1
      { def: { id: 'corpse' }, alive: false },                       // 死亡项跳过
      null,                                                          // 空条目跳过
      undefined,
    ])).toBe(1 + 2 + 2 + 1);
    // alive === undefined 视为存活（回收中的敌人靠 alive=false 排除）
    expect(enemySpawnLoad([{ alive: true }, { alive: false }])).toBe(1);
  });

  it('spawnEnemy 合成 def：id 仍是基础 id、baseId 相同、variant 结构就位并返回该敌人', () => {
    const scene = spawnScene(3);
    const rolls = [0.5, 0.9]; // 第一抽定类型，第二抽命中第 3 幕的重甲
    scene.combatRng = { next: () => rolls.shift() };
    const dif = { hp: 10, speed: 30, damage: 8, maxAlive: 10 };
    const enemy = call(scene, 'spawnEnemy', dif, { x: 100, y: 120 });
    expect(scene.enemies).toHaveLength(1);
    expect(scene.enemies[0]).toBe(enemy);
    expect(enemy.def.id).toBe(pickEnemyType(3, 0.5).id);
    expect(enemy.def.baseId).toBe(enemy.def.id);
    expect(enemy.def.variant).toMatchObject({ id: 'heavy', cost: 2 });
    expect(enemy.variantId).toBe('heavy');
    // 属性公式仍按合成后的乘率算（难度基准 × 等级成长 × 变体乘率）
    const lv = levelStats(scene.run.progression.level);
    expect(enemy.maxHp).toBe(Math.max(1, Math.round(dif.hp * (enemy.def.hpMul ?? 1) * lv.hpMul)));
    expect(enemy.speed).toBeCloseTo(30 * (enemy.def.speedMul ?? 1) * lv.speedMul, 6);
    expect(enemy.x).toBe(100);
    // y 会被出生帧的 AI 朝向快照轻微修正，只断言仍是有限坐标
    expect(Number.isFinite(enemy.y)).toBe(true);
  });

  it('combatRng 固定 0.5：spawnEnemy 不抛错，命中 normal 时 variant 为 null 且 id 不变', () => {
    const scene = spawnScene(1);
    scene.combatRng = { next: () => 0.5 };
    const dif = { hp: 10, speed: 30, damage: 8, maxAlive: 10 };
    expect(() => call(scene, 'spawnEnemy', dif, { x: 120, y: 140 })).not.toThrow();
    const def = scene.enemies[0].def;
    expect(def.id).toBe(pickEnemyType(1, 0.5).id);
    expect(def.baseId).toBe(def.id);
    expect(def.variant).toBeNull();
  });

  it('spawnWave 按槽位预算：maxAlive=1 且 count=2 时最多只落 1 只', () => {
    const scene = spawnScene(1);
    scene.combatRng = { next: () => 0.5 };
    call(scene, 'spawnWave', { hp: 10, speed: 30, damage: 8, maxAlive: 1, wave: 2 }, 2);
    expect(scene.enemies).toHaveLength(1);
  });

  it('已超预算时仍落 1 只兜底（不会整波空转），但不会继续灌', () => {
    const scene = spawnScene(3);
    // 预置一只 cost=2 的重甲怪：load = 2 > maxAlive = 1
    scene.enemies = [{ x: 40, y: 40, alive: true, def: { variant: { id: 'heavy', cost: 2 } } }];
    scene.combatRng = { next: () => 0.5 };
    call(scene, 'spawnWave', { hp: 10, speed: 30, damage: 8, maxAlive: 1, wave: 2 }, 2);
    expect(scene.enemies).toHaveLength(2); // 原有 1 + 兜底 1
  });
});

describe('破盾与护盾受击表现', () => {
  it('onEnemyShieldBreak：播碎片爆散 + 破盾音，不震屏', () => {
    const scene = makeScene(3);
    const shieldBreak = vi.fn();
    scene.effects.shieldBreak = shieldBreak;
    scene.cameras.main.calls.length = 0;
    expect(() => call(scene, 'onEnemyShieldBreak', { x: 100, y: 120 })).not.toThrow();
    expect(shieldBreak).toHaveBeenCalledWith(100, 120);
    expect(sfxLog.some(c => c[0] === 'shieldBreak')).toBe(true);
    // 破盾不震屏（2026-11-17 收窄：震屏只留受伤/演出级/Boss 事件）
    expect(scene.cameras.main.calls.find(c => c[0] === 'shake')).toBeUndefined();
  });

  it('onEnemyHit：盾吸收时补青钢火花与金属音，低细节档不早退；无盾不补播', () => {
    const scene = makeScene(1);
    const hitSpark = vi.fn();
    const damageNumber = vi.fn();
    Object.assign(scene.effects, { hitSpark, impact: vi.fn(), damageNumber });
    const enemy = {
      x: 90, y: 80, radius: 6, maxHp: 10, viewExtent: null, hitPower: 0.6,
      lastBlocked: 4, lastHitAmount: 0, hitReact: vi.fn(),
    };
    call(scene, 'onEnemyHit', enemy, { x: 60, y: 80 }, 0, { color: 0xffffff }, false);
    expect(enemy.hitReact).toHaveBeenCalledTimes(1);
    expect(hitSpark).toHaveBeenCalledTimes(1);
    expect(hitSpark.mock.calls[0].slice(0, 5)).toEqual([90, 80, expect.any(Number), expect.any(Number), 0x5ed0c8]);
    expect(damageNumber).not.toHaveBeenCalled(); // 全吸收：不出现「0 伤害」飘字
    expect(sfxLog.filter(c => c[0] === 'shieldHit')).toHaveLength(1);

    // 没有吸收的普通受击（低细节档）不补盾反馈
    const plain = { ...enemy, lastBlocked: 0, hitReact: vi.fn() };
    call(scene, 'onEnemyHit', plain, { x: 60, y: 80 }, 0, { color: 0xffffff }, false);
    expect(hitSpark).toHaveBeenCalledTimes(1);
    expect(sfxLog.filter(c => c[0] === 'shieldHit')).toHaveLength(1);
  });

  it('击杀掉落：掉率门槛不变，drop = 基础 + variant.shardsAdd；精英 4 颗起', () => {
    const scene = spawnScene(3);
    const shards = [];
    scene.spawnShard = (x, y) => shards.push([x, y]);
    scene.spawnExpMote = noop;
    scene.spawnChest = noop;
    Object.assign(scene.effects, { deathScatter: vi.fn() });
    // 0.3 同时过「宝箱 0.008」与「碎片 0.45」两道门槛
    scene.combatRng = { next: () => 0.3 };
    const kill = (def) => {
      shards.length = 0;
      call(scene, 'onEnemyKilled', {
        x: 10, y: 20, alive: true, rewarded: false, destroy: noop,
        def: { id: 'skeleton', color: 0xffffff, ...def },
      });
      return shards.length;
    };
    expect(kill({})).toBe(1);
    expect(kill({ variant: { id: 'heavy', shardsAdd: 2 } })).toBe(3);
    expect(kill({ elite: true, variant: { id: 'elite', shardsAdd: 3 } })).toBe(7);
  });
});

// ---------- 敌方召唤物 / 近战结算（T3 接线）----------
// 这一组用「裸上下文 + 原型方法」驱动，只给场景逻辑真正读到的字段，
// 验证上下限、毁灭清扫、近战结算与符文引爆，不启动 Phaser。
function makeCombatCtx(overrides = {}) {
  const effects = {
    slashes: [], pulses: [], hurts: 0, bursts: 0, scatters: 0, impacts: 0,
    slash(...args) { this.slashes.push(args); },
    summonPulse(...args) { this.pulses.push(args); },
    hurt() { this.hurts++; },
    burst() { this.bursts++; },
    deathScatter() { this.scatters++; },
    impact() { this.impacts++; },
  };
  const ctx = {
    player: {
      x: 100, y: 100, radius: 5, alive: true, hp: 100, invulnUntil: 0, hits: [],
      takeDamage(amount, now) {
        if (!this.alive || now < this.invulnUntil) return false;
        this.invulnUntil = now + 1400;
        this.hp -= amount;
        this.hits.push({ amount, now });
        return true;
      },
    },
    enemies: [],
    summons: [],
    summonsSeq: -1,
    hostileShots: [],
    hostileG: makeGraphics(),
    summonG: makeGraphics(),
    engine: { now: 5000 },
    effects,
    phase: 'play',
    bossDefeated: false,
    cameras: { main: { shake: noop } },
    world: { w: 800, h: 600 },
    ...overrides,
  };
  for (const name of ['addEnemySummon', 'updateSummons', 'sweepSummons', 'onSummonDestroyed', 'detonateRune', 'drawSummons', 'addHostileShot', 'onEnemyMelee']) {
    ctx[name] = BattleScene.prototype[name].bind(ctx);
  }
  return ctx;
}

describe('敌方召唤物与近战接入', () => {
  it('addEnemySummon 规范化默认值、负数 id、炮台伤害 ×0.6、同 owner 只 1 个', () => {
    const ctx = makeCombatCtx();
    const turret = ctx.addEnemySummon({ id: 7, damage: 10 }, { kind: 'turret', x: 200, y: 200 });
    expect(turret).toBeTruthy();
    expect(turret.id).toBe(-1);
    expect(turret.kind).toBe('turret');
    expect(turret.owner).toBe(7);
    expect(turret.hp).toBe(12);
    expect(turret.lifeMs).toBe(5000);
    expect(turret.damage).toBe(6);                       // 召唤者 10 × 0.6
    expect(turret.def).toMatchObject({ id: 'summon_turret' });
    expect(ctx.summons).toHaveLength(1);
    expect(ctx.effects.pulses).toHaveLength(1);
    expect(sfxLog.some((c) => c[0] === 'summon')).toBe(true);

    // 同一个 owner 再来一个：被拒，且不产生任何表现
    expect(ctx.addEnemySummon({ id: 7, damage: 10 }, { kind: 'rune', x: 300, y: 300 })).toBeNull();
    expect(ctx.summons).toHaveLength(1);
    expect(ctx.effects.pulses).toHaveLength(1);

    // 换 owner 才放行；符文默认 8HP / 半径 44 / 引信 1200
    const rune = ctx.addEnemySummon({ id: 8, damage: 10 }, { kind: 'rune', x: 300, y: 300 });
    expect(rune.id).toBe(-2);
    expect(rune.hp).toBe(8);
    expect(rune.radius).toBe(44);
    expect(rune.lifeMs).toBe(1200);
    expect(rune.def).toMatchObject({ id: 'summon_rune' });
  });

  it('跨列表上限：炮台 12 / 符文 8 / 全场 20，满了直接拒绝且不出表现', () => {
    const ctx = makeCombatCtx();
    for (let i = 0; i < 12; i++) {
      expect(ctx.addEnemySummon({ id: 100 + i, damage: 1 }, { kind: 'turret', x: 10, y: 10 })).toBeTruthy();
    }
    expect(ctx.addEnemySummon({ id: 999, damage: 1 }, { kind: 'turret', x: 10, y: 10 })).toBeNull();
    for (let i = 0; i < 8; i++) {
      expect(ctx.addEnemySummon({ id: 200 + i, damage: 1 }, { kind: 'rune', x: 10, y: 10 })).toBeTruthy();
    }
    expect(ctx.summons).toHaveLength(20);
    expect(ctx.effects.pulses).toHaveLength(20);
    expect(ctx.addEnemySummon({ id: 500, damage: 1 }, { kind: 'rune', x: 10, y: 10 })).toBeNull();
    expect(ctx.summons).toHaveLength(20);
    expect(ctx.effects.pulses).toHaveLength(20);
  });

  it('sweepSummons：死亡召唤物爆散移除，不给经验/碎片/尸爆种子', () => {
    const ctx = makeCombatCtx();
    const turret = ctx.addEnemySummon({ id: 1, damage: 1 }, { kind: 'turret', x: 50, y: 50 });
    const rune = ctx.addEnemySummon({ id: 2, damage: 1 }, { kind: 'rune', x: 60, y: 60 });
    turret.hp = 0;
    turret.alive = false;
    expect(ctx.sweepSummons()).toBe(1);
    expect(ctx.summons).toEqual([rune]);
    expect(ctx.effects.scatters).toBe(1);
    expect(ctx.effects.bursts).toBe(1);
    expect(sfxLog.some((c) => c[0] === 'dissipate')).toBe(true);
    // 没有走任何击杀结算入口（奖励入口都挂 enemies 上，召唤物只是被移除）
    expect(ctx.enemies).toHaveLength(0);
  });

  it('onEnemyMelee：命中才 takeDamage，挥空与无敌帧都只出表现', () => {
    const ctx = makeCombatCtx();
    const enemy = { id: 3, damage: 7, def: { color: 0xff0000 } };
    const melee = { x: 100, y: 100, angle: 0, arc: Math.PI, range: 30, damage: 7 };
    expect(ctx.onEnemyMelee(enemy, melee)).toBe(true);
    expect(ctx.player.hits).toEqual([{ amount: 7, now: 5000 }]);
    expect(ctx.effects.slashes).toHaveLength(1);
    expect(sfxLog.some((c) => c[0] === 'meleeSwing')).toBe(true);
    expect(sfxLog.some((c) => c[0] === 'hurt')).toBe(true);

    // 无敌帧内：不扣血，但仍然出挥砍表现
    expect(ctx.onEnemyMelee(enemy, melee)).toBe(false);
    expect(ctx.player.hits).toHaveLength(1);
    expect(ctx.effects.slashes).toHaveLength(2);

    // 背向空挥（抬手点在玩家左侧、朝左扫）：同样只出表现
    ctx.player.invulnUntil = 0;
    expect(ctx.onEnemyMelee(enemy, { x: 90, y: 100, angle: Math.PI, arc: Math.PI / 4, range: 30, damage: 7 })).toBe(false);
    expect(ctx.player.hits).toHaveLength(1);
    expect(ctx.effects.slashes).toHaveLength(3);
  });

  it('updateSummons：炮台弹并入 hostileShots，符文引爆伤玩家 + 6 发环弹', () => {
    const ctx = makeCombatCtx();
    ctx.addEnemySummon({ id: 1, damage: 10 }, { kind: 'turret', x: 300, y: 300 });
    ctx.addEnemySummon({ id: 2, damage: 8 }, { kind: 'rune', x: 100, y: 100 }); // 玩家脚下
    ctx.updateSummons(1000);   // 符文还剩 200ms，炮台首轮 1200ms 未到
    expect(ctx.hostileShots).toHaveLength(0);
    ctx.engine.now = 6000;
    ctx.updateSummons(200);    // 引信归零 → 爆炸 + 环形弹；炮台累计 1200ms → 发 1 发
    expect(ctx.player.hits.map((h) => h.amount)).toContain(8);
    expect(ctx.effects.bursts).toBeGreaterThan(0);
    const bolts = ctx.hostileShots.filter((s) => s.kind === 'bolt');
    expect(bolts.length).toBeGreaterThanOrEqual(7);       // 6 发环弹 + 炮台 1 发
    expect(ctx.summons.map((s) => s.kind)).toEqual(['turret']);
  });

  it('combatTargets 是敌人 + 召唤物，只用于法术选敌', () => {
    const ctx = makeCombatCtx();
    ctx.enemies = [{ id: 1 }, { id: 2 }];
    ctx.summons = [{ id: -1 }, { id: -2 }];
    const targets = BattleScene.prototype.combatTargets.call(ctx);
    expect(targets).toHaveLength(4);
    expect(targets.slice(0, 2)).toEqual(ctx.enemies);
    expect(targets.slice(2)).toEqual(ctx.summons);
  });
});

// 技能库只来自玩家在升级三选一里选中的那张卡：开局为空，选攻击得攻击、选防御得护盾。
describe('道具技能库（随三选一选择变化）', () => {
  it('新 run 的技能库为空，不预置任何起手技能', () => {
    const run = createRun('skill-lib-seed');
    expect(run.skillLibrary).toEqual([]);
    expect(run.skillStage).toBe(1);
  });

  it('选中的卡决定技能功能：防御卡是 ward 护盾，攻击卡是 single，辅助卡不入库', () => {
    const scene = makeScene(1);
    expect(scene.run.skillLibrary ?? []).toHaveLength(0);

    // 三选一里选了「圣光壁垒」→ 技能库第一格就是护盾技能
    call(scene, 'grantSkill', 'holy_ward');
    expect(scene.run.skillLibrary).toHaveLength(1);
    expect(scene.run.skillLibrary[0]).toMatchObject({ defId: 'holy_ward', kind: 'ward' });

    // 另一次三选一选了「奥术飞弹」→ 第二格是攻击技能，功能随所选卡变化
    call(scene, 'grantSkill', 'arcane_bolt');
    expect(scene.run.skillLibrary.map(s => s.defId)).toEqual(['holy_ward', 'arcane_bolt']);
    expect(scene.run.skillLibrary[1].kind).toBe('single');

    // 辅助卡没有主动法术，不占用技能格
    call(scene, 'grantSkill', 'resonance_stone');
    expect(scene.run.skillLibrary.map(s => s.defId)).toEqual(['holy_ward', 'arcane_bolt']);
  });

  it('重复选同名卡只刷新、不重复占格；超过三格顶掉最早一格', () => {
    const scene = makeScene(1);
    for (const id of ['arcane_bolt', 'frost_arrow', 'flame_burst']) call(scene, 'grantSkill', id);
    expect(scene.run.skillLibrary.map(s => s.defId)).toEqual(['arcane_bolt', 'frost_arrow', 'flame_burst']);

    call(scene, 'grantSkill', 'arcane_bolt');
    expect(scene.run.skillLibrary).toHaveLength(3);
    // 重复选同名卡只刷新冷却，不移动槽位
    expect(scene.run.skillLibrary.map(s => s.defId)).toEqual(['arcane_bolt', 'frost_arrow', 'flame_burst']);

    call(scene, 'grantSkill', 'starfall');
    // 槽位满时新卡顶掉最早的一格（arcane_bolt）
    expect(scene.run.skillLibrary.map(s => s.defId)).toEqual(['frost_arrow', 'flame_burst', 'starfall']);
  });

  it('换场后技能库清零，只留本场选到的技能', () => {
    const scene = makeScene(1);
    call(scene, 'grantSkill', 'holy_ward');
    expect(scene.run.skillLibrary).toHaveLength(1);
    call(scene, 'swapStage', 2);
    expect(scene.run.skillLibrary).toEqual([]);
    expect(scene.run.skillStage).toBe(2);
  });
});
