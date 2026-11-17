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

vi.mock('../src/audio/Sfx.js', () => ({
  sfx: new Proxy({}, { get: () => () => {} }),
  toggleSound: () => {},
}));

import BattleScene from '../src/scenes/BattleScene.js';
import { createRun } from '../src/logic/run.js';
import { createGrid, rebuildDerived } from '../src/logic/grid.js';
import { SigilEngine } from '../src/logic/engine.js';
import { ACTS, WORLD_SIZES } from '../src/logic/constants.js';
import { chapterOf, firstStageOf, minorBossIdsOfStage, nextStage } from '../src/logic/acts.js';
import { MAJOR_BOSS_LEVEL } from '../src/logic/progression.js';
import { getEventPoints } from '../src/data/map-events.js';
import { getEncounterForStage, getMinibossEncounters } from '../src/data/encounters.js';
import { STAGE_CARDS } from '../src/data/cinematics.js';
import { stageSpellCard } from '../src/scenes/battle-pure.js';

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
  for (const name of ['finishStage', 'swapStage', 'startBossClearTransition', 'defeatBoss', 'buildSummary', 'checkProgressEvents', 'update', 'grantSkill', 'skillCdOf', 'saveProgress']) {
    scene[name] = BattleScene.prototype[name].bind(scene);
  }
  return scene;
}

const call = (scene, method, ...args) => BattleScene.prototype[method].call(scene, ...args);
// update() 把单帧 delta 夹到 50ms（顿帧保护），所以推进 N 毫秒必须按帧走，不能一次喂大 delta。
const advance = (scene, ms) => { for (let t = 0; t < ms; t += 50) call(scene, 'update', t, 50); };
const cutscenes = () => transition.calls;
const lastCutscene = () => transition.calls.at(-1);

beforeEach(() => { transition.calls.length = 0; transition.disabled = false; });

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
    expect(scene.run.hand['sigil:' + stageSpellCard(6)]).toBe(1);
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
