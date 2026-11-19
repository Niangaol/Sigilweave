// 战斗场景（P1 纵切核心）
// 地图占满 HUD 下方画面；法术罗盘固定右下角，不再上下分屏。
// 逻辑内核只读引用：SigilEngine / grid / sector / combo，所有时序与冷却都不在这里重写。
import Phaser from 'phaser';
import { SigilEngine } from '../logic/engine.js';
import { createGrid, rebuildDerived, toId, toRC, manhattan, neighborsOf } from '../logic/grid.js';
import { buildComboCatalog } from '../logic/combo.js';
import { resolveTarget, resolveVolley, volleyLimit, visibleFilter } from '../logic/sector.js';
import { ACTS, WORLD_SIZES, ORTHO_DIRS } from '../logic/constants.js';
import { applyDraft, snapshotBuild, draftFromGrid, validateDraft, AUX_TARGETED, missingAuxTargets, explainBuildErrors, auxTargetCandidates } from '../logic/build.js';
import { SIGIL_DEFS, AUX_DEFS, RUNE_DEFS, resolveSigilTrigger, resolveComboBonus, resolveDeathBursts, castTimeOf } from '../logic/effects.js';
import { createRun, recordAct } from '../logic/run.js';
import { createProgression, grantExp, levelStats, shouldTriggerMajorBoss, MAJOR_BOSS_LEVEL, CHARACTER_BUFFS, COMPASS_BUFFS, rollBuffWeighted } from '../logic/progression.js';
import { getEventPoints } from '../data/map-events.js';
import { getEncounterById } from '../data/encounters.js';
import { Rng } from '../logic/rng.js';
import { CARD_POOL, cardKeyOf, cardOf } from '../logic/workshop.js';
import { cardsForAct } from '../logic/spell-gating.js';
import { slotComboEligible, variantOf, rollVariant } from '../data/variants.js';
import { EVOLUTIONS, evolutionOf } from '../data/evolutions.js';
import { REACTIONS, FACTIONS, factionOf } from '../data/factions.js';
import { resonanceMultiplier, reactionAt } from '../logic/resonance.js';
import { expNeeded } from '../logic/progression.js';
import { Pool } from '../logic/pool.js';
import { pickSpawnPoint, pickWavePoints, separateEnemiesBucketed, enemySpawnLoad, rollFormation } from '../logic/spawn.js';
import { FORMATIONS, formationAuraOf } from '../data/formations.js';
import { pickEnemyVariant, composeEnemyDef } from '../data/enemy-variants.js';
import { getEncounterForStage } from '../data/encounters.js';
import { createEncounterState, openEncounter, selectChoice, confirmChoice, finishEncounter } from '../logic/encounters.js';
import { resolveBossOnce } from '../logic/boss.js';
import { bossControlFor } from '../data/boss-phases.js';
import { controlFor, CONTROL_DEFS, DEFAULT_CONTACT_CONTROL, DEFAULT_SHOT_CONTROL } from '../data/control.js';
import { HOSTILE_LIMITS, stepHostileShots, stepSummons, meleeHits, makeShot, normalizeSummon } from '../logic/hostile.js';
import { chapterOf, isValidStage, nextStage, firstStageOf } from '../logic/acts.js';
import { chapterDurationMs, stageSpellCard, stageAdvanceDecision } from './battle-pure.js';
import { loadMeta, metaLevel, applyPassiveToCharacter, applyPassiveToCompass, metaPassiveLabel } from '../logic/meta.js';
import Boss from '../entities/Boss.js';
import EncounterPanel from '../ui/EncounterPanel.js';
import {
  ACT1_CELLS, ACT1_SIGIL_BY_CELL, SIGILS, ENEMY_TYPES, SECTOR,
  COMBO_NAMES, difficultyAt, DIFFICULTY, PLAYER, cardVisual, pickEnemyType,
} from '../data/roster.js';
import Background from '../ui/Background.js';
import SigilBoard, { cellCenter } from '../ui/SigilBoard.js';
import EffectsLayer from '../ui/EffectsLayer.js';
import Hud from '../ui/Hud.js';
import { countPassives, appendPassive } from '../ui/passive-summary.js';
import BattleFrame from '../ui/battle-frame.js';
import PauseMenu from '../ui/PauseMenu.js';
import Player from '../entities/Player.js';
import Enemy from '../entities/Enemy.js';
import Projectile from '../entities/Projectile.js';
import Shard from '../entities/Shard.js';
import ExpMote from '../entities/ExpMote.js';
import { C, HEX, addText, pxRect, pxFrame, pxLine, pxDiamond, pxRing, applyPixelZoom, getRenderScale, uiLayerOffset, isPortrait, isTouchUI, CONSOLE_TOP, CANVAS_H_PORTRAIT } from '../ui/Palette.js';
import { kitPanel, kitBoard, kitBoardMotion, kitHeader, kitSteps, kitCell, kitHandRow, kitDetail, kitAction, clipText } from '../ui/editor-ui.js';
import { CARD_HINTS } from '../data/card-hints.js';
import { spellPunch as spellPunchOf, spellStrikeSequence as spellStrikeSequenceOf, spellLinkFx as spellLinkFxOf, reactionFx as reactionFxOf } from '../ui/spell-hit-fx.js';
import { shakeCamera } from '../ui/camera-shake.js';
import { bossFrameOffset, clampFollowOffset, leashIntoView, playerVisible, DEFAULT_DEADZONE_H } from '../ui/boss-framing.js';
import { followBaseY, viewRect as viewRectOf, updateBossCamera as updateBossCameraOf, resumeFollow as resumeFollowOf } from '../ui/battle-camera.js';
import { drawHostileShot } from '../ui/hostile-draw.js';
import { computeFrequency } from '../ui/battle-frequency.js';
import { readTuning as readTuningOf, pickStartCells as pickStartCellsOf, sampleStartCell as sampleStartCellOf } from './battle-setup.js';
import GridEditor from '../ui/grid-editor.js';
import LevelupPanel from '../ui/levelup-panel.js';
import { playBossIntro as playBossIntroOf, checkProgressEvents as checkProgressEventsOf, updateEventPointVisuals as updateEventPointVisualsOf, beginEncounter as beginEncounterOf, selectEncounterAnswer as selectEncounterAnswerOf, confirmEncounterAnswer as confirmEncounterAnswerOf, continueEncounter as continueEncounterOf } from './battle-encounters.js';
import { addHostileShot as addHostileShotOf, updateHostileShots as updateHostileShotsOf, combatTargets as combatTargetsOf, addEnemySummon as addEnemySummonOf, updateSummons as updateSummonsOf, sweepSummons as sweepSummonsOf, onSummonDestroyed as onSummonDestroyedOf, detonateRune as detonateRuneOf, drawSummons as drawSummonsOf } from './battle-hostiles.js';
import { grantSkill as grantSkillOf, skillCdOf as skillCdOfHelper, skillHostCell as skillHostCellOf, pickSkillAim as pickSkillAimOf, castSkill as castSkillOf } from './battle-skills.js';
import { updateSpawner as updateSpawnerOf, spawnFormation as spawnFormationOf, spawnWave as spawnWaveOf, spawnEnemy as spawnEnemyOf } from './battle-spawner.js';
import { refreshFormationAuras as refreshFormationAurasOf, updateEnemies as updateEnemiesOf, onEnemyKilled as onEnemyKilledOf, bumpKillStreak as bumpKillStreakOf, updateShards as updateShardsOf, onEnemyMelee as onEnemyMeleeOf } from './battle-enemies.js';
import { applySigil as applySigilOf, onEnemyHit as onEnemyHitOf, triggerDeathBursts as triggerDeathBurstsOf, collectDefeated as collectDefeatedOf, resolveProjectile as resolveProjectileOf, queueOrCommit as queueOrCommitOf, commitSigil as commitSigilOf, tickPendingCasts as tickPendingCastsOf } from './battle-hit-pipeline.js';
import { finishStage as finishStageOf, swapStage as swapStageOf, defeatBoss as defeatBossOf, startBossClearTransition as startBossClearTransitionOf, checkDeath as checkDeathOf, die as dieOf, buildSummary as buildSummaryOf } from './battle-stage-flow.js';
import TouchControls from '../ui/TouchControls.js';
import { sfx, toggleSound } from '../audio/Sfx.js';
import { playCutscene, cutscenesDisabled } from '../ui/transition.js';
import { STAGE_CARDS } from '../data/cinematics.js';
import { fireGuide, hideGuide } from '../logic/guide.js';
import { saveRun, clearRun } from '../logic/save.js';

// 编队 id → 模板：光环数值的唯一来源。表只有 8 条且模块已深冻，做成静态 Map
// 比每帧在数组里 find 更省，也避免「拿不到模板就静默无光环」这种半失效状态。

// 画框工厂：竖屏不创建（480×760 的画布上 8px 框会卡在地图区中间）
export function createBattleFrame(scene, { seed, stage }) {
  if (isPortrait()) return undefined;
  return new BattleFrame(scene, `${seed}:frame:${stage}`);
}

const BATTLE = { left: 10, right: 470, top: 26, bottom: 262 };
// 镜头取景：横屏把跟随中心上抬一点，人物略低于屏幕中心，多露上方战场与来袭方向。
// 死区高 40，半高 20 会吃掉一半偏移，所以这里给 50 → 实际净上抬约 30px。
// 竖屏沿用 190 的专用偏移（人物落在地图区中上部，下方留给触控台），不再叠加。
// 击杀经验折算：1 杀 1 点。这个常量保留成可调项——如果实机觉得升级三选一太频繁，
// 把它调到 2/3 即可整体降速，不需要改任何结算代码。
// 道具技能：按 1/2/3 主动释放，冷却 = 基础值 × 卡牌 cdMul。每场重置技能库。

export default class BattleScene extends Phaser.Scene {
  constructor() {
    super('BattleScene');
  }

  create(data = {}) {
    applyPixelZoom(this);
    // 由过场进入时，过场负责揭开，战斗不再自己从黑场淡入
    this.__cine = !!data.__cine;
    const params = new URLSearchParams(window.location.search);
    this.run = data.run ?? createRun(params.get('seed') ?? ('sigil-' + Date.now()), params.get('kit') ?? undefined);
    this.stage = isValidStage(this.run.stage) ? this.run.stage : 1;
    this.run.stage = this.stage;
    this.chapter = chapterOf(this.stage);
    this.run.chapter = this.chapter;
    this.stageOutcome = 'none';
    this.quickMode = params.get('quick') === '1';
    // 成长状态：跨幕持久在 run 上
    this.run.progression ??= createProgression();
    this.run.compassBuffs ??= { damageMul: 1, intervalMul: 1, cooldownMul: 1, hitBonus: 0, comboWindowMul: 1, expMul: 1 };
    // 局内被动清单：跨场持久在 run 上，暂停菜单直接读它，HUD 只读统计好的计数。
    this.run.passiveLog ??= [];
    this.passiveCounts = countPassives(this.run.passiveLog);
    this.run.hand ??= {};
    this.run.completedEvents ??= {};
    this.run.majorBossStages ??= {};
    // 每幕的参考时长（仅用于调试/结算口径；通幕由本幕各大 Boss 决定，不按计时）。
    // 合并幕后一幕含两场，时长按场参考秒数求和。
    this.durationMs = this.quickMode ? 15000 : chapterDurationMs(this.chapter);
    this.combatRng = new Rng(this.run.seed + ':combat:' + this.stage);
    // 编队批次序号：同一模板可以连着刷两批，两批是两支独立的队——
    // 只有「这一批的前排还活着」才给「这一批的后排」加成（spec §5.3 的「同编队」）。
    // 用它拼 formationUid（分组键）；formationId 仍然是模板 id（取光环数值、取标记色相）。
    this.formationSeq = 0;
    this.debugParams = params;
    this.phase = 'play';
    this.stressRunning = false;
    this.pendingPicks = 0;
    this.timeExpTimer = 0;
    this.run.encounters ??= createEncounterState(this.run.seed);
    this.run.bossResolutions ??= {};
    // —— 道具技能库（本场有效，随断点存档一起持久化）——
    // 技能库只来自玩家在升级三选一中实际选中的法术卡：选哪张，哪张就成为 1/2/3 技能。
    // 开局不预置任何技能；换场清空，读档回到同一场时保留已经选到的技能。
    this.run.skillLibrary ??= [];
    // skillStage 记录技能库归属的场：进新场时清空，读档回到同一场时保留。
    if (this.run.skillStage !== this.stage) {
      this.run.skillLibrary = [];
      this.run.skillStage = this.stage;
    }
    this.skillCooldowns = [0, 0, 0];
    this.skillSaveAccum = 0;
    // 引擎时间每次进场从 0 重新起算，存档里的 cooldownUntil 是旧时间轴上的值，需清零。
    for (const entry of this.run.skillLibrary) entry.cooldownUntil = 0;
    this.__resume = !!data.__resume;
    // 局外成长档：只读，宝箱/罗盘抽到被动时按此档的等级加成。
    this.metaSave = loadMeta();
    this.playerSlowUntil = 0;
    this.boss = null;
    this.bossStarted = false;
    this.bossDefeated = false;
    this.hostileShots = [];
    // 敌方召唤物（滞空炮台 / 地面符文）：独立实体列表，不进 enemies，也不吃击杀奖励
    this.summons = [];
    this.summonsSeq = -1;
    this.transitionLeft = 0;
    this.paused = false;
    this.menuOpen = false;
    this.focusPaused = false;
    this.spaceHeld = false;

    this.enemies = [];
    this.projectiles = [];
    this.pendingCasts = [];
    this.shards = [];
    this.kills = 0;
    this.shardCount = this.run.shards;
    this.peakRate = 0;
    this.recentRate = 0;
    this.freqBuckets = [0, 0, 0, 0, 0];
    this.freqStart = 0;
    this.spawnTimer = 900;
    // 编队轮次计数（spec §5.2）：每 DIFFICULTY.formationEvery 波试一次编队刷怪。
    // 只在 create() 归零，换场不重置——编队是「本场持续的战斗节奏」，
    // 换场重置会让玩家在每场开头都白等两轮普通波。
    this.waveIndex = 0;
    // 割草节奏：开场热身 + 连斩计数 + 击杀经验折算
    this.warmupMs = 1600;
    this.killStreak = 0;
    this.streakBest = 0;
    this.lastKillAt = -99999;
    this.expKillAccum = 0;      // 击杀经验累计；KILL_EXP_PER_POINT=1 时每杀 1 点，折成经验粒子飞出
    this.sampleTimer = 2000;
    this.enemySeq = 1;
    this.hintUntil = 13000;
    this.chests = [];
    // 命中重量感：重击顿帧剩余毫秒 + 上一次震屏时刻（按法术 gapMs 去重）
    this.hitstopLeft = 0;
    this.lastPunchAt = -99999;

    // 在背景构造前刷新世界尺寸，避免同一个Scene跨场复用上一场的world。
    const world = WORLD_SIZES[this.stage] ?? WORLD_SIZES[1];
    this.world = { w: world.w, h: world.h };

    // ---------- 视觉层 ----------
    this.background = new Background(this, this.stage, this.world);
    this.effects = new EffectsLayer(this);
    this.hud = new Hud(this);
    // 暂停菜单的每一项都挂真实动作，鼠标点击与键盘快捷键走同一条路径
    this.editor = new GridEditor(this);
    this.levelupPanel = new LevelupPanel(this);
    this.pauseMenu = new PauseMenu(this, {
      resume: () => this.closePause(),
      restart: () => { if (this.menuOpen || this.editOpen) playCutscene(this, { kind: 'retry', to: 'BattleScene', payload: { run: this.run, __cine: true }, act: this.chapter, stage: this.stage }); },
      title: () => { if (this.menuOpen) playCutscene(this, { kind: 'return', to: 'TitleScene', payload: { __cine: true }, act: this.chapter, stage: this.stage }); },
      edit: () => { if (this.menuOpen && !this.editOpen) this.openGridEdit(); },
      mute: () => { if (this.menuOpen) this.onMute(); },
    });
    this.hostileG = this.add.graphics().setDepth(450);
    // 召唤物分两层：符文贴地（449，低于敌人，避免盖住脚）；炮台悬浮（1150，高于敌人，
    // 否则「炮台落在施法者位置」时会被施法者自己的立绘整个盖住）。
    this.summonG = this.add.graphics().setDepth(449);
    this.summonAirG = this.add.graphics().setDepth(1150);
    this.encounterPanel = new EncounterPanel(this, id => this.selectEncounterAnswer(id), () => this.confirmEncounterAnswer(), () => this.continueEncounter());
    // 面板交互：场景级命中测试（画布坐标，不受镜头滚动影响）
    // 面板交互挂 DOM window 事件：绕开 Phaser 输入插件在镜头滚动后的投递丢失
    this.panelPointerHandler = (ev) => {
      if (this.phase !== 'encounter' || !this.encounterPanel.view.visible) return;
      const pos = this.encounterPanel.toCanvas(ev);
      if (!pos) return;
      const action = this.encounterPanel.hitTest(pos.px, pos.py);
      if (action) {
        this.encounterPanel.pressAt(pos.px, pos.py); // 按下反馈；翻页类动作随后重绘会盖掉它
        sfx.tick();
        action();
      }
    };
    window.addEventListener('pointerdown', this.panelPointerHandler);

    // ---------- 世界与摄像机（每幕一张大地图） ----------
    this.worldBounds = { left: 24, top: 40, right: world.w - 24, bottom: world.h - 24 };
    this.battleBounds = this.worldBounds; // 敌人 AI 读取的世界活动范围

    // ---------- 玩家 ----------
    this.player = new Player(this, world.w / 2, world.h / 2);
    Object.assign(this.player, this.run.characterStats ?? {});
    this.cameras.main.setBounds(0, 0, world.w, world.h);
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);
    this.cameras.main.setDeadzone(60, 40);
    // 镜头基准偏移：横屏上抬 CAMERA_LIFT；竖屏用专用偏移让人物落在地图区中上部
    this.cameras.main.setFollowOffset(0, followBaseY());
    // 事件点（依赖世界尺寸，必须在 world 赋值之后）
    this.eventPoints = getEventPoints(this.stage, this.world).map(p => ({ ...p, done: !!this.run.completedEvents[p.id], icon: null, label: null }));

    // 对象池：弹丸与碎片高频创建，复用图形对象；饱和时拒绝新建而不是抢占活动对象
    this.projectilePool = new Pool({
      name: 'projectile', capacity: 300,
      create: (x, y, tx, ty, def, target) => new Projectile(this, x, y, tx, ty, def, target),
      revive: (p, x, y, tx, ty, def, target) => p.revive(x, y, tx, ty, def, target),
    });
    this.shardPool = new Pool({
      name: 'shard', capacity: 200,
      create: (x, y) => new Shard(this, x, y),
      revive: (s, x, y) => s.revive(x, y),
    });
    // 经验粒子：击杀爆散时飞出，追到玩家身上才加经验。池子比碎片大一点，
    // 精英一次 6 颗；池满时不丢经验，直接入账兜底。
    this.expMotes = [];
    this.expMotePool = new Pool({
      name: 'expMote', capacity: 320,
      create: (x, y, value, mul) => new ExpMote(this, x, y, value, mul),
      revive: (m, x, y, value, mul) => m.revive(x, y, value, mul),
    });

    // 从上一幕确认的构筑快照恢复；战斗里不暴露任何编辑入口。
    this.grid = createGrid();
    const committed = applyDraft(this.grid, this.run.draft, { phase: 'intermission' });
    if (!committed.ok) throw new Error('战斗构筑快照无效');
    // 罗盘增益：间隔/冷却乘算在此生效（伤害/命中/窗口走 combatState/引擎）
    const buffs = this.run.compassBuffs;
    rebuildDerived(this.grid, ACTS[this.chapter - 1].baseIntervalMs * buffs.intervalMul, { cooldownMul: buffs.cooldownMul });
    // 平衡对照开关：只在 URL 显式给参时生效，默认玩法完全不变。
    this.tuning = this.readTuning(params);
    if (this.tuning.intervalMs) rebuildDerived(this.grid, this.tuning.intervalMs);
    this.board = new SigilBoard(this, this.grid);
    // 竖屏触控台背景：不透明压住地图 + 硬边竖纹 + 顶部金线（与幕间同一套语言）
    if (isPortrait()) {
      const cg = this.add.graphics().setDepth(499).setScrollFactor(0);
      pxRect(cg, 0, CONSOLE_TOP, 480, CANVAS_H_PORTRAIT - CONSOLE_TOP, C.void);
      for (let x = 0; x < 480; x += 24) pxRect(cg, x, CONSOLE_TOP, 12, CANVAS_H_PORTRAIT - CONSOLE_TOP, C.ink, 0.25);
      pxRect(cg, 0, CONSOLE_TOP, 480, 2, C.brassDark, 0.9);
      pxRect(cg, 0, CONSOLE_TOP + 2, 480, 1, C.brass, 0.35);
      // 罗盘面板外框（与幕间分区面板同款：双线 + 四角铆钉）
      const p = { x: 12, y: 280, w: 456, h: 184 };
      pxRect(cg, p.x, p.y, p.w, p.h, C.ink, 0.9);
      pxFrame(cg, p.x, p.y, p.w, p.h, C.brassDark);
      pxFrame(cg, p.x + 2, p.y + 2, p.w - 4, p.h - 4, C.brass, 1, 0.2);
      for (const [sx, sy] of [[p.x, p.y], [p.x + p.w - 3, p.y], [p.x, p.y + p.h - 3], [p.x + p.w - 3, p.y + p.h - 3]]) {
        pxRect(cg, sx, sy, 3, 3, C.brass, 0.9);
        pxRect(cg, sx + 1, sy + 1, 1, 1, C.brassLight, 1);
      }
    }

    // 起点：按玩家归一化位置映射到最近的已解封格
    this.startCell = this.sampleStartCell();
    this.board.setStart(this.startCell);

    // ---------- 脉流引擎（冻结内核） ----------
    this.engine = new SigilEngine({
      seed: this.run.seed + ':signal:' + this.stage,
      grid: this.grid,
      startCells: this.pickStartCells(),
      comboWindowMul: this.run.compassBuffs.comboWindowMul,
      combos: buildComboCatalog(['duo', 'line3', 'elbow3', 'ring4'])
        .map(inst => (inst.defId === 'duo' && this.tuning.duoBonus !== null
          ? { ...inst, bonus: this.tuning.duoBonus } : inst))
        .filter(inst => inst.order.every(id => this.grid.cells[id].unlocked && this.grid.cells[id].slot?.kind === 'sigil'
          && slotComboEligible(this.grid.cells[id].slot) && !this.grid.cells[id].mutedOutput)),
      comboEligible: slot => slotComboEligible(slot),
      onEvent: (type, data) => this.onEngineEvent(type, data),
    });
    this.engine.start();

    // ---------- 输入 ----------
    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys({
      up: 'W', down: 'S', left: 'A', right: 'D',
      space: 'SPACE', esc: 'ESC', restart: 'R', title: 'T', mute: 'M', edit: 'E',
      skill1: 'ONE', skill2: 'TWO', skill3: 'THREE',
    });
    this.input.keyboard.addCapture(['W', 'A', 'S', 'D', 'SPACE', 'ESC', 'R', 'T', 'M', 'ONE', 'TWO', 'THREE', 'UP', 'DOWN', 'LEFT', 'RIGHT']);
    this.input.keyboard.resetKeys();
    // 右键冲刺：与键盘走位并存，只在 play 相位生效（门槛见 tryDash）
    this.bindDashPointer();
    // 压测入口只在显式 ?stress=1 下启用，不改变正常玩法
    if (params.get('stress') === '1') this.time.delayedCall(900, () => this.startStress());
    this.bootCount = (this.bootCount ?? 0) + 1;
    window.__SIGILWEAVE_BATTLE__ = this;

    this.onEsc = () => {
      if (this.phase !== 'play') return;
      if (this.editOpen) { this.closeGridEdit(); return; }
      if (this.menuOpen) this.closePause();
      else this.openPause('menu');
    };
    this.onRestart = () => {
      if (this.menuOpen) playCutscene(this, { kind: 'retry', to: 'BattleScene', payload: { run: this.run, __cine: true }, act: this.chapter, stage: this.stage });
    };
    this.onMute = () => {
      const on = toggleSound();
      this.effects.text(240, 150, on ? '音效已开启' : '音效已关闭', HEX.arcaneLight, true);
    };
    this.onTitle = () => {
      if (this.menuOpen) playCutscene(this, { kind: 'return', to: 'TitleScene', payload: { __cine: true }, act: this.chapter, stage: this.stage });
    };
    this.handleBlur = () => {
      if (this.phase !== 'play') return;
      this.focusPaused = true;
      this.menuOpen = true;
      this.spaceHeld = false;
      this.pauseMenu.show('blur');
      this.board.setDetailVisible(true);
      this.hint.setVisible(false);
      this.pauseHint.setVisible(false);
      this.input.keyboard.resetKeys();
      this.engine.paused = true;
      this.paused = true;
    };
    this.handleFocus = () => {
      if (this.phase !== 'play' || !this.focusPaused) return;
      this.pauseMenu.show('focus');
    };

    this.onEdit = () => {
      if (this.phase === 'play' && this.menuOpen && !this.editOpen) this.openGridEdit();
    };
    this.input.keyboard.on('keydown-E', this.onEdit);
    this.input.keyboard.on('keydown-M', this.onMute);
    this.input.keyboard.on('keydown-ESC', this.onEsc);
    this.input.keyboard.on('keydown-R', this.onRestart);
    this.input.keyboard.on('keydown-T', this.onTitle);
    this.game.events.on(Phaser.Core.Events.BLUR, this.handleBlur);
    this.game.events.on(Phaser.Core.Events.FOCUS, this.handleFocus);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.onShutdown, this);

    // 操作提示（12 秒后淡出）；触屏设备换成摇杆文案
    this.hint = addText(this, 10, 250, isTouchUI()
      ? '方向键 走位　·　　按钮 打开菜单'
      : 'WASD / 方向键 走位　·　按住空格 暂停观察　·　Esc 菜单', 8, HEX.parchment).setScrollFactor(0)
      .setOrigin(0, 0.5).setDepth(1005).setAlpha(0.9);
    this.pauseHint = addText(this, 10, 182, '观察中 · 松开空格继续　（Esc 打开菜单）', 8, HEX.arcaneLight).setScrollFactor(0)
      .setOrigin(0, 0.5).setDepth(1006).setVisible(false);

    // 触屏设备：虚拟方向键 + 暂停按钮（桌面鼠标用户不创建）
    if (isTouchUI()) {
      this.touch = new TouchControls(this, { onPause: () => this.onEsc() });
    }

    // UI 收进固定屏幕容器：世界由摄像机 zoom 放大，UI 靠容器补偿维持逻辑坐标。
    this.frame = createBattleFrame(this, { seed: this.run.seed, stage: this.stage });
    this.mountUiLayer();

    if (!this.__cine) this.cameras.main.fadeIn(220, 0, 0, 0);

    // 调试：?pause=1 直接打开暂停菜单，便于截图验收
    if (params.get('pause') === '1') {
      this.time.delayedCall(650, () => this.openPause('debug'));
    }

    // 暴露给验收脚本：只读查看引擎状态
    this.bootCount = (this.bootCount ?? 0) + 1;
    window.__SIGILWEAVE_BATTLE__ = this;

    // 新手引导 · 各幕开场：第一幕 G01 / 第二幕 G07 / 第三幕 G09 / 幕四起 G12。
    // 由过场进入时延后到过场揭幕后（journey≈5.84s、act 标题卡≈3s），避免压在过场上。
    const stageGuideId = this.stage === 1 ? 'G01' : this.stage === 2 ? 'G07' : this.stage === 3 ? 'G09' : 'G12';
    const guideDelay = this.__cine ? (this.stage === 3 ? 6100 : 3300) : 500;
    this.time.delayedCall(guideDelay, () => {
      if (this.scene.isActive() && !this.transitionLeft) {
        fireGuide(this, this.run, stageGuideId, { act: this.chapter, stage: this.stage });
      }
    });
    // 进场即落盘一次（首次进入也有存档）；读档续玩时墨宝专门打招呼。
    this.saveProgress();
    if (this.__resume) {
      this.time.delayedCall(guideDelay + 200, () => {
        if (this.scene.isActive() && !this.transitionLeft) {
          fireGuide(this, this.run, 'SAVE_RESUME', { act: this.chapter, stage: this.stage });
        }
      });
    }
  }

  mountUiLayer() {
    const offset = uiLayerOffset(this);
    const root = this.add.container(offset.x, offset.y).setScrollFactor(0).setDepth(5000);
    // 按既有 depth 排序后再入容器：容器按插入顺序渲染，排序才能保持面板层级。
    const ui = this.children.list
      .filter((o) => o !== root && o.scrollFactorX === 0 && o.scrollFactorY === 0)
      .sort((a, b) => (a.depth ?? 0) - (b.depth ?? 0));
    for (const obj of ui) root.add(obj);
    this.uiRoot = root;
    return root;
  }

  readTuning(params) { return readTuningOf(params); }

  pickStartCells() { return pickStartCellsOf(this); }

  // ---------- 起点映射 ----------
  sampleStartCell() { return sampleStartCellOf(this); }

  sigilOf(cellId) {
    const defId = this.grid.cells[cellId]?.slot?.defId;
    return cardVisual(this.grid.cells[cellId].slot);
  }

  // 条带矩形：内区是屏幕四分之一，外区画到屏幕外一屏多（只用于光迹的四角括号提示）
  sectorRect(cellId) {
    const { r, c } = toRC(cellId);
    const px = this.player.x, py = this.player.y;
    const { halfW, halfH, farX, farY } = SECTOR;
    const x = c === 0 ? px - farX : c === 1 ? px - halfW : c === 2 ? px : px + halfW;
    const w = c === 0 || c === 3 ? farX - halfW : halfW;
    const y = r === 0 ? py - farY : r === 1 ? py - halfH : r === 2 ? py : py + halfH;
    const h = r === 0 || r === 3 ? farY - halfH : halfH;
    return { x, y, w, h };
  }

  // ---------- 引擎事件 -> 表现 ----------
  onEngineEvent(type, data) {
    switch (type) {
      case 'signal:trigger': {
        const cellId = data.cellId;
        const cell = this.grid.cells[cellId];
        this.board.flashTrigger(cellId);
        sfx.trigger();
        // 静默：本格触发时压制正交邻格，邻格被迫走完整冷却
        if (cell.runes.includes('silence')) for (const nb of this.grid.cells) {
          if (manhattan(cellId, nb.id) === 1 && nb.unlocked) nb.cooldownUntil = Math.max(nb.cooldownUntil, this.engine.now + nb.effCooldownMs);
        }
        if (!cell.slot || cell.slot.kind !== 'sigil' || cell.mutedOutput) {
          if (cell.slot?.kind === 'auxiliary') this.effects.dissipate(cellCenter(cellId).x, cellCenter(cellId).y, C.teal);
          break;
        }
        const def = this.sigilOf(cellId);
        const kind = SIGIL_DEFS[def.id]?.kind;
        // 所有法术特效统一从法杖尖端起手（世界坐标）；罗盘格子只负责闪灯提示
        const origin = this.player.staffTip();
        const owner = { x: this.player.x, y: this.player.y };
        // 索敌只在摄像机视口内进行：屏外的怪不锁、不打，等它走进屏幕后下一次触发再出手。
        const view = this.viewRect();
        const result = resolveTarget(cellId, owner, this.enemies, { view });
        // 罗盘格闪光用该法术主色：一眼能认出「刚才那一格打的是什么」
        this.board.flashTrigger(cellId, def.color);
        // 每个法术自己的起手爆发（spell-fx 按 defId 分派）
        const castAngle = Math.atan2(result.aim.y - origin.y, result.aim.x - origin.x);
        this.effects.spellCast(def.id, origin.x, origin.y, castAngle);
        if (kind === 'ward') {
          // 护盾是自身增益，不依赖敌方目标：始终能放，光迹收在玩家身上
          this.effects.directionTrace(origin, owner, this.sectorRect(cellId), def.color, false);
          this.applySigil(cellId, def.id);
          this.effects.spellWard(def.id, SIGIL_DEFS[def.id].radius ?? 40);
        } else if (kind === 'nova') {
          // 新星以自身为圆心，不需要锁敌：光迹收到自己身上，落点就是玩家位置（castMs 走前摇）
          this.effects.directionTrace(origin, owner, this.sectorRect(cellId), def.color, false);
          this.queueOrCommit(cellId, def.id, { x: owner.x, y: owner.y }, castAngle);
          this.effects.burst(owner.x, owner.y, def.color, 4);
        } else {
          // 割草齐射：单次触发对扇区内最近的 N 个敌人各打一发（各类型 N 见 sector.VOLLEY_LIMITS）。
          // 屏幕内一个可选目标都没有时「停火等待」：不放弹丸、不朝屏外画光迹，等怪进屏再打。
          const volley = resolveVolley(cellId, owner, this.enemies, { maxTargets: volleyLimit(kind), view });
          if (!volley.targets.length) {
            this.effects.hold(origin.x, origin.y, def.color);
            break;
          }
          this.effects.directionTrace(origin, volley.aims[0], this.sectorRect(cellId), def.color, false);
          let fired = 0;
          for (let i = 0; i < volley.targets.length; i++) {
            const projectile = this.fireProjectile(origin.x, origin.y, volley.aims[i].x, volley.aims[i].y, def, volley.targets[i]);
            if (projectile) {
              projectile.cellId = cellId;
              fired++;
            }
          }
          if (fired > 0) this.effects.burst(origin.x, origin.y, def.color, 3); // 起手微粒（法术本体已由 spell-fx 负责）
        }
        break;
      }
      case 'combo:break': {
        const labels = { cooldown: '冷却受阻', fallback: '保底改道', dissipate: '脉流消散' };
        const shapes = (data.shapes ?? []).map(s => COMBO_NAMES[s] ?? s).join('、');
        this.effects.text(402, 168, '联组断 · ' + (labels[data.reason] ?? data.reason) + (shapes ? '（' + shapes + '）' : ''), HEX.blood, true);
        this.comboBreakCount = (this.comboBreakCount ?? 0) + 1;
        sfx.comboBreak();
        break;
      }
      case 'signal:blocked': {
        sfx.blocked();
        // 冷却未就绪：格子上闪黄铜色冷却角标
        this.board.flashBlocked(data.cellId);
        break;
      }
      case 'signal:reroute': {
        // 改道短折线，青绿色属于「运行层」
        this.effects.reroute(cellCenter(data.blocked), cellCenter(data.to));
        break;
      }
      case 'signal:dissipate': {
        const id = data.cellId === null || data.cellId === undefined ? this.startCell : data.cellId;
        this.board.flashDissipate(id);
        const pos = cellCenter(id);
        this.effects.dissipate(pos.x, pos.y, C.groove);
        sfx.dissipate();
        this.onSignalDissipate(data);
        break;
      }
      case 'signal:fallback': {
        this.effects.fallback(cellCenter(data.from), cellCenter(data.to));
        break;
      }
      case 'combo:fire': {
        const centers = data.order.map((id) => cellCenter(id));
        for (const id of data.order) this.board.flashCombo(id);
        this.effects.combo(centers, COMBO_NAMES[data.defId] || data.defId);
        sfx.combo();
        const bonusResult = resolveComboBonus({ grid: this.grid, order: data.order, defId: data.defId, bonus: data.bonus, state: this.combatState(), enemies: this.enemies });
        const lastCell = data.order?.[data.order.length - 1];
        const bonusVisual = Number.isInteger(lastCell) && this.grid.cells[lastCell]?.slot ? this.sigilOf(lastCell) : null;
        for (const enemy of bonusResult.targets ?? []) this.onEnemyHit(enemy, null, null, bonusVisual, true);
        // 专属连携：在联组中心飘一个短词，命中目标再补一次元素色冲击
        if (bonusResult.linkage) {
          const center = centers?.[Math.floor((centers.length - 1) / 2)] ?? this.player;
          const pair = bonusResult.linkage;
          const color = HEX.brassLight;
          this.effects.labelPopup(center.x, center.y - 26, '连携 · ' + pair.name, color, 9);
          for (const enemy of pair.targets ?? []) {
            if (Number.isFinite(enemy?.x)) this.effects.hitSpark(enemy.x, enemy.y, 0, -1, C.brassLight, 0.55);
          }
        }
        this.triggerDeathBursts();
        this.collectDefeated();
        break;
      }
      default:
        break;
    }
  }

  // 消散后脉流会重生：此刻按玩家当前位置重新采样起点（引擎只在重生时读取 startCells）
  onSignalDissipate(data) {
    const sig = this.engine.signals.get(data.signalId);
    const index = sig ? sig.startIndex : 0;
    const next = this.sampleStartCell();
    this.engine.startCells[index] = next;
    if (index === 0) {
      this.startCell = next;
      this.board.setStart(next);
      this.effects.text(240, 178, '脉流从新方位重生', HEX.arcaneLight, true);
    }
  }

  // ---------- 输入与暂停状态机 ----------
  readMoveAxis() {
    let dx = 0;
    let dy = 0;
    if (this.cursors.left.isDown || this.keys.left.isDown) dx -= 1;
    if (this.cursors.right.isDown || this.keys.right.isDown) dx += 1;
    if (this.cursors.up.isDown || this.keys.up.isDown) dy -= 1;
    if (this.cursors.down.isDown || this.keys.down.isDown) dy += 1;
    // 触屏摇杆与键盘取或：手机上用方向键，桌面键盘照旧
    if (this.touch) { dx += this.touch.axis.x; dy += this.touch.axis.y; }
    return { dx, dy };
  }

  syncPauseState() {
    if (this.phase !== 'play') return;
    const spaceDown = !!(this.keys.space && this.keys.space.isDown) && !this.menuOpen && !this.focusPaused;
    if (spaceDown !== this.spaceHeld) {
      this.spaceHeld = spaceDown;
      if (!this.menuOpen) {
        this.board.setDetailVisible(spaceDown);
        this.pauseHint.setVisible(spaceDown);
        if (spaceDown) this.hint.setVisible(false);
      }
    }
    const wantPause = this.menuOpen || this.focusPaused || this.spaceHeld;
    if (wantPause !== this.paused) {
      this.paused = wantPause;
      this.engine.paused = wantPause;
      if (!wantPause) {
        this.board.setDetailVisible(false);
        this.pauseHint.setVisible(false);
        if (this.engine.now < this.hintUntil) this.hint.setVisible(true);
      } else {
        this.pauseMenu.setVisible?.(false);
      }
    }
  }

  openPause(mode = 'menu') {
    if (this.phase !== 'play') return;
    this.menuOpen = true;
    this.paused = true;
    this.engine.paused = true;
    this.pauseMenu.show(mode, {
      combos: this.engine.stats.combos,
      breaks: this.engine.summary(this.engine.now).comboBreaks,
      blocked: this.engine.stats.blocked,
      // 已获清单：直接把 run 上的被动流水与进化表喂给暂停菜单
      passives: this.run.passiveLog,
      evolutions: this.run.evolutions,
    });
    this.board.setDetailVisible(true);
    this.hint.setVisible(false);
    this.pauseHint.setVisible(false);
  }

  closePause() {
    if (this.editOpen) return;
    this.menuOpen = false;
    this.focusPaused = false;
    this.pauseMenu.hide();
    this.paused = this.spaceHeld;
    this.engine.paused = this.paused;
    this.board.setDetailVisible(this.spaceHeld || this.paused);
    this.pauseHint.setVisible(this.spaceHeld);
    // 两条提示共用同一行位置，必须互斥，否则会叠在一起
    this.hint.setVisible(!this.spaceHeld && !this.paused && this.engine.now < this.hintUntil);
  }

  // ---------- 每帧 ----------
  update(time, delta) {
    const dt = Math.min(50, delta);
    // 重击顿帧：只冻结战斗推进（本帧不跑引擎/敌人/弹丸），特效按 dt=0 重绘定格，HUD 照常可读
    const frozen = this.hitstopLeft > 0;
    if (frozen) this.hitstopLeft = Math.max(0, this.hitstopLeft - dt);
    this.background.update(time);
    this.syncPauseState();
    if (this.editOpen) this.tickEditBoardMotion(time, delta);

    if (this.phase === 'play' && !this.paused && !frozen) {
      // 道具技能：按 1/2/3 释放（用 Key 对象的 JustDown，不受升级弹窗的事件解绑影响）
      if (Phaser.Input.Keyboard.JustDown(this.keys.skill1)) this.castSkill(0);
      if (Phaser.Input.Keyboard.JustDown(this.keys.skill2)) this.castSkill(1);
      if (Phaser.Input.Keyboard.JustDown(this.keys.skill3)) this.castSkill(2);
      // 断点存档：每 4 秒补写一次，覆盖血量/成长/技能冷却等连续变化。
      this.skillSaveAccum += dt;
      if (this.skillSaveAccum >= 4000) { this.skillSaveAccum = 0; this.saveProgress(); }
      this.engine.advance(dt);
      this.tickPendingCasts();
      this.updatePlayer(dt);
      this.updateSpawner(dt);
      this.updateEnemies(dt);
      this.updateBossCamera();
      if (this.boss?.alive) {
        // B6 转阶段清场：只清杂兵弹幕，Boss 自己的大招弹（fromBoss）留在场上。
        // 一起清掉等于替玩家免掉一次大招伤害；phase 由 Boss.update 里的阶段机推进，
        // 而 updateEnemies 排在上一行，所以这里同帧就能读到新 phase。
        if (this.boss.model.phase !== (this.lastBossPhase ?? this.boss.model.phase)) {
          this.lastBossPhase = this.boss.model.phase;
          this.hostileShots = this.hostileShots.filter(s => s.fromBoss === true);
          // 新手引导 G18：第一次看到 Boss 换打法时，教「节奏更快、别硬接、右键躲」。
          // 埋点放在这里而不是 Player 层：换招是 Boss 侧事件，玩家那一侧只有「突然更难打了」。
          fireGuide(this, this.run, 'G18');
        }
        // Boss 拴绳：它停在原地放招时玩家会跑开，不夹回来就整只留在画面外。
        // 上边界要再让出大立绘的身高（脚在 boss.y，头顶在 boss.y - (displayH - 21)）。
        const view = this.viewRect();
        const headroom = Math.max(0, (this.boss.sprite?.displayHeight ?? 0) - 21);
        const feetView = { x: view.x, y: view.y + headroom, w: view.w, h: Math.max(40, view.h - headroom) };
        if (leashIntoView(this.boss, feetView)) this.boss.sprite?.setPosition(Math.round(this.boss.x), Math.round(this.boss.y) + 21);
      }
      this.updateHostileShots(dt);
      this.updateSummons(dt);
      // 新手引导 G16：第一次拿到护盾时解释蓝条与上限。
      if (this.player.shield > 0) fireGuide(this, this.run, 'G16');
      this.updateProjectiles(dt);
      this.updateShards(dt);
      this.updateExpMotes(dt);
      this.effects.update(dt);
      this.updateStartSample(dt);
      this.updateHint();
      this.checkDeath();
      if (this.phase === 'play' && this.bossDefeated) this.startBossClearTransition();
      else if (this.phase === 'play') {
        if (!this.stressRunning) this.checkProgressEvents();
        this.updateEventPointVisuals();
        this.updateChests(dt);
        this.timeExpTimer = (this.timeExpTimer ?? 0) + dt;
        if (!this.stressRunning && this.timeExpTimer >= 20000) {
          this.timeExpTimer -= 20000;
          const gained = grantExp(this.run.progression, 1, this.run.compassBuffs.expMul * (this.quickMode ? 4 : 1));
          if (gained.ok && gained.levelsGained > 0) this.queueLevelPicks(gained.levelsGained);
        }
      }
    } else if (this.phase === 'bossDefeated') {
      // 通幕余韵期间经验粒子继续飞完，别让刚捡到手的经验在过场里断掉
      this.updateExpMotes(dt);
      this.effects.update(dt);
      this.transitionLeft -= dt;
      if (this.transitionLeft <= 0) this.finishStage();
    } else if (this.phase === 'stageIntro') {
      // 幕内换场的场次卡：画面冻结，1.6 秒后接回战斗
      this.effects.update(dt);
      this.stageIntroLeft -= dt;
      if (this.stageIntroLeft <= 0) {
        this.phase = 'play'; this.paused = false; this.engine.paused = false;
        this.player.invulnUntil = this.engine.now + 900;
        this.resumeFollow();
      }
    } else if (this.phase === 'levelup') {
      this.effects.update(0);
    } else if (this.phase === 'intro') {
      this.effects.update(dt);
      this.introLeft -= dt;
      if (this.boss) {
        const k = Math.min(1, 1 - Math.max(0, this.introLeft) / this.introDur);
        this.boss.y = this.introFromY + (this.introToY - this.introFromY) * (1 - Math.pow(1 - Math.min(1, k * 1.6), 2));
        this.boss.draw(this.engine.now);
      }
      if (this.introLeft <= 0) {
        this.phase = 'play'; this.paused = false; this.engine.paused = false;
        this.player.invulnUntil = this.engine.now + 900;
        this.resumeFollow(this.bossCamOffset ?? 0);
      }
    } else if (this.phase === 'dying') {
      this.effects.update(dt);
    } else {
      // 暂停：特效冻结，但仍重绘一帧，避免画面变空白
      this.effects.update(0);
    }

    this.updateFrequency();
    this.board.updateDynamic(this.engine, this.engine.now, this.phase !== 'play' || this.paused);
    this.hud.update({
      hp: this.player.hp,
      maxHp: this.player.maxHp,
      lv: this.run.progression.level,
      exp: this.run.progression.exp,
      expNeed: expNeeded(this.run.progression.level),
      shield: this.player.shield,
      shards: this.shardCount,
      rate: this.recentRate,
      buckets: this.freqBuckets,
      elapsedMs: this.engine.now,
      chapter: this.chapter,
      stage: this.stage,
      // 顶栏常驻计数：人物被动 / 罗盘增益各拿到了几种（重复拿到只算一种，次数在暂停菜单里）
      passives: this.passiveCounts,
      // 道具技能库：三格技能槽 + 当前冷却，Hud 每帧按 now 重画遮罩
      skills: this.run.skillLibrary ?? [],
      now: this.engine.now,
      // 右键冲刺冷却：Hud 画技能栏左侧那枚 24×24 圆环（缺字段按 0 = 已就绪）
      dashReadyAt: this.player?.dashReadyAt ?? 0,
    });
    // 画框跟着同一颗心脏：暂停与顿帧时 dt 传 0，碎屑与脉动一起定格
    this.frame?.update({
      ratio: this.player.hp / Math.max(1, this.player.maxHp),
      now: this.engine.now,
      dt: this.phase === 'play' && !this.paused && !frozen ? dt : 0,
    });
  }

  updatePlayer(dt) {
    const now = this.engine.now;
    const { dx, dy } = this.readMoveAxis();
    // 冲刺中（含位移结束的那一帧，updateDash 的边界帧仍会插值到终点）不再读输入：
    // 位置完全由时间轴决定，普通移动整帧跳过。顿帧/暂停时 dt 已被上层置 0，不会漂。
    const dashing = now <= this.player.dashUntil;
    const blocked = this.player.moveBlocked(now);
    const factor = (now < this.playerSlowUntil ? 0.75 : 1) * this.player.speedFactorAt(now);
    this.player.update(dt * factor * (this.player.speedMult ?? 1),
      dashing || blocked ? 0 : dx, dashing || blocked ? 0 : dy, this.worldBounds, now);
  }

  // 右键冲刺（spec §3.1）：只认右键，左键留给走位与暂停编辑，避免误触。
  // 生命周期：create 里绑一次、shutdown 里 off，重复 create 不叠监听——注意这和 editPointer
  // 「开面板绑、关面板解」是两套写法（编辑面板期间要吞掉右键，所以它自己收 off）；
  // dashPointer 常驻，能不能冲由 tryDash 里的运行时门槛（相位/暂停/编辑/顿帧/死亡）把关。
  bindDashPointer() {
    if (this.dashPointer) return;
    this.dashPointer = (pointer) => { if (pointer.button === 2) this.tryDash(this.engine.now); };
    this.input.on('pointerdown', this.dashPointer);
  }

  // 冲刺放行门槛：非战斗相位（含升级三选一）/暂停/编辑/顿帧/死亡一律不响应。
  // 眩晕不在门槛里——startDash 不清 stunUntil，冲刺结束后照样被定住，「挣不开」指的是控制本身。
  tryDash(now = this.engine.now) {
    const p = this.player;
    if (this.phase !== 'play' || this.paused || this.menuOpen || this.editOpen
      || this.hitstopLeft > 0 || !p?.alive) return false;
    const { dx, dy } = this.readMoveAxis();
    if (!p.startDash(dx, dy, now)) return false;
    sfx.trigger();
    this.effects?.burst?.(p.x, p.y, C.teal, 8);
    return true;
  }

  // 敌人招式命中后的玩家硬控：查表 → 应用 → 飘字。返回控制名（没有配置时 null）。
  applyEnemyControl(enemy, path, now) {
    if (!this.player?.alive) return null;
    const defId = enemy?.defId ?? enemy?.def?.id ?? null;
    const cfg = controlFor(defId, path)
      ?? (path === 'contact' ? DEFAULT_CONTACT_CONTROL : null)
      ?? (path === 'shot' ? DEFAULT_SHOT_CONTROL : null);
    if (!cfg) return null;
    return this.applyPlayerControl(cfg, enemy?.x ?? this.player.x, enemy?.y ?? this.player.y, now);
  }

  applyPlayerControl(cfg, sx, sy, now) {
    const p = this.player;
    const def = CONTROL_DEFS[cfg.kind];
    if (cfg.kind === 'knock') {
      // 冲刺期间（now <= dashUntil）位置归 updateDash 的时间轴独占：这里照常写 p.x/p.y 也会被
      // 下一帧的插值覆盖掉，玩家看不出被撞开，反而像「击退失效」。所以冲刺中只挂僵直不位移，
      // 僵直照常生效（冲刺无敌只免伤不免控，见 spec）。位移留给冲刺结束后那一小段后摇补上。
      const dashing = now <= (p.dashUntil ?? 0);
      if (!dashing) {
        const dx = p.x - sx;
        const dy = p.y - sy;
        const len = Math.hypot(dx, dy) || 1;
        const force = cfg.force ?? 40;
        const b = this.worldBounds;
        p.x = Math.min(Math.max(p.x + (dx / len) * force, b.left + p.radius), b.right - p.radius);
        p.y = Math.min(Math.max(p.y + (dy / len) * force, b.top + p.radius), b.bottom - p.radius);
      }
      p.applyKnockStun(cfg.ms ?? 200, now);
      this.effects?.impact?.(p.x, p.y, def?.color ?? C.bone, true);
    } else {
      p.applyControl(cfg.kind, cfg.ms ?? 400, now);
      if (cfg.kind === 'slow') p.slowFactor = cfg.factor ?? 0.6;
    }
    if (def) this.effects?.labelPopup?.(p.x, p.y - 24, def.name, def.color, 12);
    // 新手引导 G17：第一次被硬控时教「右键冲刺能挣开」。眩晕（stun）故意不教——
    // 冲刺解不掉眩晕，给了提示只会让玩家白按一次 1.2s 冷却。
    if (cfg.kind !== 'stun') fireGuide(this, this.run, 'G17');
    return def?.name ?? null;
  }

  updateStartSample(dt) {
    // 不必每帧变：每 2 秒按归一化位置采样一次；引擎只在脉流重生时读取
    this.sampleTimer -= dt;
    if (this.sampleTimer > 0) return;
    this.sampleTimer = 2000;
    const next = this.sampleStartCell();
    if (next !== this.engine.startCells[0]) {
      this.engine.startCells[0] = next;
      this.startCell = next;
      this.board.setStart(next);
    }
  }

  updateHint() {
    if (this.engine.now < this.hintUntil) return;
    const a = Math.max(0, 1 - (this.engine.now - this.hintUntil) / 1200);
    this.hint.setAlpha(a);
    if (a <= 0.01) this.hint.setVisible(false);
  }

  // 刷怪：幸存者式波次，密度直接取自 roster.difficultyAt(now, act)。
  // 割草爽感的三个来源：①同屏上限高（30→64，按幕再放大）②间隔短（0.7s→0.52s）
  // ③一次抽 1~2 只同刷。落点由纯逻辑 pickWavePoints 一次抽出，同波之间也保证间距。
  // 上限按 scripts/density-sim.mjs 的清怪速度定标：刷怪快过清怪只会得到一堵墙，不是割草。
  updateSpawner(dt) { return updateSpawnerOf(this, dt); }

  // 编队波（spec §5.2）：rollFormation 按幕抽模板与怪种，抽不到就整轮降级
  // （返回 0，由调用方改刷普通波）。返回实际落地的只数，供轮次推进判断。
  spawnFormation(dif) { return spawnFormationOf(this, dif); }

  // 一波怪：一次抽出 count 个互不重叠的落点（屏幕外 275~380，避免贴脸刷出来）
  spawnWave(dif, count) { return spawnWaveOf(this, dif, count); }

  // opts.defId / opts.formationId：编队波指定怪种与编队 id（spec §5.2）。
  // 普通波不传 opts，行为与旧版逐字一致。
  spawnEnemy(dif, point = null, opts = {}) { return spawnEnemyOf(this, dif, point, opts); }

  // 护卫光环（spec §5.3）：每帧重扫一次，把「本队还有没有前排活着」翻译成成员身上的字段。
  // 不做节流：节流会让前排死后的那个窗口里加成还在，玩家看到的正是「前排死了加成没消失」。
  // 扫描成本是 O(n) 分桶 + O(队数 × 成员)，与同屏 60~90 只相比可忽略。
  // 三条硬规则都在这里落地（实体层只读字段，不判谁该吃）：
  //   1. Boss 不进编队、不吃光环，也不许当「前排还活着」的证据（它根本不在编队桶里）。
  //   2. 精英**可以当前排**并给后排发光环，但自己不吃（spec §5.3 表：「编队只给杂兵」讲的是收方）。
  //      这一条不能收严成「精英也不能当前排」：shield_wall 的前排池只有
  //      [page_golem, brass_warden]，第 3/5 幕的怪池里没有 page_golem，
  //      前排必然落到精英黄铜守誓者身上；把精英排除出证据，这两幕的光环就永远不生效，
  //      等于把表里写好的机制做成死代码。
  //   3. 前排自己不拿光环：spec 写的是「同编队其余成员」，前排同时拿甲+减速等于自罚。
  //      没有前排、或前排全灭时立刻 delete，绝不留上一帧的值。
  refreshFormationAuras() { return refreshFormationAurasOf(this); }

  updateEnemies(dt) { return updateEnemiesOf(this, dt); }

  fireProjectile(x, y, tx, ty, def, target) {
    const projectile = this.projectilePool.acquire(x, y, tx, ty, def, target);
    if (!projectile) return null;
    this.projectiles.push(projectile);
    return projectile;
  }

  spawnShard(x, y) {
    const shard = this.shardPool.acquire(x, y);
    if (!shard) return null;
    this.shards.push(shard);
    return shard;
  }

  // ---------- 经验粒子：击杀爆散 → 炸散 → 追玩家 → 碰到才入账 ----------
  spawnExpMote(x, y, value = 1, mul = 1) {
    const mote = this.expMotePool.acquire(x, y, value, mul);
    if (!mote) {
      // 池满兜底：经验绝不凭空消失，直接入账
      const gained = grantExp(this.run.progression, value, mul);
      if (!this.stressRunning && gained.ok && gained.levelsGained > 0) this.queueLevelPicks(gained.levelsGained);
      return null;
    }
    this.expMotes.push(mote);
    return mote;
  }

  collectExpMote(mote) {
    const gained = grantExp(this.run.progression, mote.value, mote.mul);
    if (!this.stressRunning && gained.ok && gained.levelsGained > 0) this.queueLevelPicks(gained.levelsGained);
    this.effects.expPop(mote.x, mote.y);
    sfx.exp();
  }

  updateExpMotes(dt) {
    for (let i = this.expMotes.length - 1; i >= 0; i--) {
      const mote = this.expMotes[i];
      if (!mote.update(dt, this.player)) continue;
      this.collectExpMote(mote);
      mote.deactivate();
      this.expMotePool.release(mote);
      this.expMotes.splice(i, 1);
    }
  }

  // 通幕/收尾时把还在飞的粒子一次结算掉，避免经验在过场里蒸发
  flushExpMotes() {
    if (!this.expMotes.length) return;
    for (const mote of this.expMotes) {
      const gained = grantExp(this.run.progression, mote.value, mote.mul);
      if (!this.stressRunning && gained.ok && gained.levelsGained > 0) this.queueLevelPicks(gained.levelsGained);
      mote.deactivate();
      this.expMotePool.release(mote);
    }
    this.expMotes.length = 0;
  }

  releaseProjectiles() {
    for (const p of this.projectiles) { p.deactivate(); this.projectilePool.release(p); }
    this.projectiles = [];
  }

  updateProjectiles(dt) {
    const onScreen = visibleFilter(this.viewRect());
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      // 目标走出屏幕就停止追踪：落点停在它最后所在的屏幕内位置，不在屏外结算命中
      if (p.targetEnemy && !onScreen(p.targetEnemy)) p.targetEnemy = null;
      const arrived = p.update(dt);
      if (arrived) {
        this.resolveProjectile(p);
        p.deactivate();
        this.projectilePool.release(p);
        this.projectiles.splice(i, 1);
      }
    }
  }

  // 当前镜头能看到的世界矩形。这是「屏幕内」的唯一判定来源：
  // worldView 已含 zoom、竖屏镜头偏移与跟随死区，比按玩家坐标硬算 480×270 更准。
  viewRect() { return viewRectOf(this); }

  // Boss 战取景：每帧按 Boss 头顶需要多少抬头量，再夹在玩家安全线以内。
  // 不这么做的话，跟随偏移会把玩家顶到画面下沿外（见 ui/boss-framing.js 的注释）。
  updateBossCamera() { return updateBossCameraOf(this); }

  combatState() {
    return {
      player: this.player, oath: this.grid.oath, now: this.engine.now,
      buffMul: this.run.compassBuffs.damageMul, hitBonus: this.run.compassBuffs.hitBonus,
      view: this.viewRect(),
      // 专属连携的同对冷却表挂在 run 上，跨帧保留
      linkageCd: (this.run.linkageCd ??= {}),
    };
  }

  // ---------- 道具技能库（按 1/2/3 主动释放，王者式冷却，每场重置） ----------
  // 只有升级三选一里玩家选中的法术卡才会登记进本场技能库：选哪张就是哪个技能。
  // 辅助卡不入技能库（没有主动法术）；技能库随断点存档持久化，换场清空。
  grantSkill(defId) { return grantSkillOf(this, defId); }

  skillCdOf(def) { return skillCdOfHelper(this, def); }

  // 技能不占用法阵格，但复制命中管线需要一个承载格：取已解锁、未静默、带符印的格子。
  skillHostCell() { return skillHostCellOf(this); }

  // 自动锁定屏幕内离玩家最近的敌人；没有目标时朝面向方向给一个落点。
  pickSkillAim() { return pickSkillAimOf(this); }

  castSkill(index) { return castSkillOf(this, index); }

  saveProgress() {
    saveRun(this.run);
  }

  applySigil(cellId, defId, aimPoint, impactAngle = null) { return applySigilOf(this, cellId, defId, aimPoint, impactAngle); }

  onEnemyHit(enemy, aimPoint, impactAngle, visual, detailed = true) { return onEnemyHitOf(this, enemy, aimPoint, impactAngle, visual, detailed); }

  triggerDeathBursts() { return triggerDeathBurstsOf(this); }

  onEnemyShieldBreak(enemy) {
    if (!enemy) return;
    const x = Number.isFinite(enemy.x) ? enemy.x : this.player.x;
    const y = Number.isFinite(enemy.y) ? enemy.y : this.player.y;
    this.effects.shieldBreak(x, y);
    sfx.shieldBreak();
  }

  // 精英践踏：圈内玩家受击（带无敌帧，不会连续吃满）
  onEnemyStomp(enemy, stomp) {
    if (!stomp || this.phase !== 'play' || !this.player.alive) return;
    const d = Math.hypot(this.player.x - stomp.x, this.player.y - stomp.y);
    if (d <= (stomp.radius ?? 26) + this.player.radius) {
      if (this.player.takeDamage(stomp.damage ?? 8, this.engine.now)) {
        this.effects.hurt();
        this.effects.impact(this.player.x, this.player.y, C.blood, true);
        shakeCamera(this, 'hurt', 120, 0.005);
        sfx.hurt();
        if (this.player.alive) this.applyEnemyControl?.(enemy, 'stomp', this.engine.now);
      }
    }
    this.effects.impact(stomp.x, stomp.y, C.stone, true);
  }

  collectDefeated() { return collectDefeatedOf(this); }

  resolveProjectile(p) { return resolveProjectileOf(this, p); }

  queueOrCommit(cellId, defId, point, angle) { return queueOrCommitOf(this, cellId, defId, point, angle); }

  commitSigil(cellId, defId, point, angle) { return commitSigilOf(this, cellId, defId, point, angle); }

  tickPendingCasts() { return tickPendingCastsOf(this); }

  spellPunch(defId, x = 0, y = 0, radius = 90, angle = 0) {
    return spellPunchOf(this, defId, x, y, radius, angle);
  }

  // 高级法术演出：多段特效层 + 暗角收缩 + （陨星）一帧白闪 + 强震屏 + 顿帧
  spellStrikeSequence(defId, x, y, radius, angle) {
    return spellStrikeSequenceOf(this, defId, x, y, radius, angle);
  }

  // 法术的「连接关系」表现：连锁逐跳电弧、贯穿光柱、回声对侧、噬魂/汲取的丝线
  spellLinkFx(defId, p, result) {
    return spellLinkFxOf(this, defId, p, result);
  }

  // 派系反应的表现层：落点飘反应名，补跳目标点各自补一次元素色冲击，
  // 净化回血在玩家头顶补一个绿色短词。数值全部已经在 effects.js 里结算完，这里只画。
  reactionFx(p, result) {
    return reactionFxOf(this, p, result);
  }

  // ---------- 暂停编辑法阵（保留冷却；战斗实时不可改，暂停可改） ----------
  openGridEdit() { return this.editor.open(); }


  editNames() { return this.editor.names(); }

  tickEditBoardMotion(time, delta) { return this.editor.tick(time, delta); }

  editHint(defId) { return this.editor.hint(defId); }

  drawGridEdit() { return this.editor.draw(); }


  editCellClick(id) { return this.editor.cellClick(id); }


  syncAuxPending() { return this.editor.syncAuxPending(); }


  closeGridEdit() { return this.editor.close(); }


  // Boss 进场演出：压降 + 震屏 + 名字条 + 时停无敌（答错进入实战前播放）
  playBossIntro(bossId) { return playBossIntroOf(this, bossId); }

  // 升级三选一：时停抽卡，卡片进手牌（配合暂停改阵自行放置）
  queueLevelPicks(count) { return this.levelupPanel.queue(count); }


  openLevelupPick() { return this.levelupPanel.open(); }


  // 进化候选：只从「已拥有且未升级」的法术里挑一条路线，避免三选一里出现用不上的进化。
  rollEvolutionPick() { return this.levelupPanel.rollEvolutionPick(); }


  // 选中进化：写进 run.evolutions，并把盘面上该法术的所有格子一起升级（立刻重建派生）。
  applyEvolution({ defId, evo }) {
    this.run.evolutions ??= {};
    this.run.evolutions[defId] = evo;
    let count = 0;
    for (const cell of this.grid.cells) {
      if (cell.slot?.kind === 'sigil' && cell.slot.defId === defId) {
        cell.slot = { ...cell.slot, evo };
        count++;
      }
    }
    rebuildDerived(this.grid, ACTS[this.chapter - 1].baseIntervalMs * this.run.compassBuffs.intervalMul, { cooldownMul: this.run.compassBuffs.cooldownMul });
    return count;
  }

  pickLevelupCard(card) { return this.levelupPanel.pick(card); }


  spawnChest(x, y) {
    this.chests.push({ x, y, g: null, opened: false });
  }

  // 局内被动清单的合并逻辑在 ui/passive-summary.js 的 appendPassive 纯函数里：
  // 同来源同 id 只留一行，stacks 记「这局拿到几次」（暂停菜单显示成 Lv），
  // level 记局外残响等级（抽到时只增不减），desc 留着给以后的详情页用。

  updateChests(dt) {
    for (let i = this.chests.length - 1; i >= 0; i--) {
      const chest = this.chests[i];
      if (!chest.g) {
        chest.g = this.add.graphics().setDepth(Math.floor(chest.y));
        pxRect(chest.g, chest.x - 4, chest.y - 3, 9, 7, C.brassDark, 1);
        pxFrame(chest.g, chest.x - 4, chest.y - 3, 9, 7, C.brass, 1, 1);
        pxRect(chest.g, chest.x - 1, chest.y - 1, 2, 2, C.brassLight, 1);
      }
      if (Math.hypot(this.player.x - chest.x, this.player.y - chest.y) < 16) {
        const buff = rollBuffWeighted(CHARACTER_BUFFS, () => this.combatRng.next(), this.run.kitAffinity);
        if (buff) {
          const adapter = {
            maxHp: this.player.maxHp,
            hp: this.player.hp,
            speed: PLAYER.speed * (this.player.speedMult ?? 1),
            pickupRadius: 38 + (this.player.pickupBonus ?? 0),
            iframeBonus: this.player.iframesBonus ?? 0,
            shieldCap: this.player.shieldCap ?? 40,
          };
          const level = metaLevel(this.metaSave, buff.id);
          const desc = applyPassiveToCharacter(buff, adapter, level);
          this.player.maxHpBonus = adapter.maxHp - PLAYER.hp;
          this.player.maxHp = adapter.maxHp;
          this.player.hp = Math.min(adapter.maxHp, adapter.hp);
          this.player.speedMult = adapter.speed / PLAYER.speed;
          this.player.pickupBonus = adapter.pickupRadius - 38;
          this.player.iframesBonus = adapter.iframeBonus;
          this.player.shieldCap = adapter.shieldCap;
          this.run.characterStats = {
            maxHp: this.player.maxHp, maxHpBonus: this.player.maxHpBonus,
            speedMult: this.player.speedMult, pickupBonus: this.player.pickupBonus,
            iframesBonus: this.player.iframesBonus, shieldCap: this.player.shieldCap,
          };
          appendPassive(this.run.passiveLog, 'chest', buff, level, desc);
          this.passiveCounts = countPassives(this.run.passiveLog);
          this.effects.text(this.player.x, this.player.y - 14, '宝箱 · ' + buff.name + metaPassiveLabel(level) + '：' + desc, HEX.brassLight, true);
        }
        sfx.pick();
        chest.g.destroy();
        this.chests.splice(i, 1);
      }
    }
  }

  // 本场大 Boss 解决后的去向：合并幕前半场原地换场，单场幕/合并幕末场通幕，第七场终局。
  // 计时结束只开启前置问答，通幕永远由大 Boss 决定。
  finishStage() { return finishStageOf(this); }

  swapStage(next) { return swapStageOf(this, next); }

  onEnemyKilled(e) { return onEnemyKilledOf(this, e); }

  bumpKillStreak(e) { return bumpKillStreakOf(this, e); }

  updateShards(dt) { return updateShardsOf(this, dt); }

  updateFrequency() {
    const r = computeFrequency(this.engine.stats.triggerTimes, this.engine.now, {
      freqStart: this.freqStart,
      peakRate: this.peakRate,
    });
    this.freqStart = r.freqStart;
    this.freqBuckets = r.buckets;
    this.recentRate = r.recentRate;
    this.peakRate = r.peakRate;
  }

  // 进度事件：地图事件点走近触发 + 大Boss等级触发（取代旧的纯计时遭遇）
  checkProgressEvents() { return checkProgressEventsOf(this); }

  // 绘制事件点图标与接近提示（每帧轻量）
  updateEventPointVisuals() { return updateEventPointVisualsOf(this); }

  beginEncounter(definition) { return beginEncounterOf(this, definition); }

  selectEncounterAnswer(choiceId) { return selectEncounterAnswerOf(this, choiceId); }

  confirmEncounterAnswer() { return confirmEncounterAnswerOf(this); }

  continueEncounter() { return continueEncounterOf(this); }

  defeatBoss(method, bossId, tier = 'major') { return defeatBossOf(this, method, bossId, tier); }

  resumeFollow(offsetY = 0) { return resumeFollowOf(this, offsetY); }

  startBossClearTransition() { return startBossClearTransitionOf(this); }

  addHostileShot(shot) { return addHostileShotOf(this, shot); }

  updateHostileShots(dt) { return updateHostileShotsOf(this, dt); }

  // 可被法术选中的目标：敌人 + 召唤物。只传给 resolveSigilTrigger 的 enemies 参数；
  // 经验/碎片/尸爆/连斩等结算循环仍只看 this.enemies，召唤物永远不算击杀。
  combatTargets() { return combatTargetsOf(this); }

  // 敌方召唤物入场：全场上限 20、跨列表炮台 12 / 符文 8、同一 owner 同时 1 个。
  // 入列前 normalizeSummon 并分配负数 id（与敌人正 id 不冲突）；被拒绝时不产生任何表现。
  addEnemySummon(enemy, spec) { return addEnemySummonOf(this, enemy, spec); }

  // 召唤物每帧：先兜底清扫死亡（stepSummons 会静默丢弃 dead 项，不扫就丢表现），
  // 再推进（炮台弹并入 hostileShots、符文引信产出 detonations），最后单批绘制。
  updateSummons(dt) { return updateSummonsOf(this, dt); }

  // 死亡扫描：applySigil 命中后 / 每帧推进前各兜底一次。
  // 召唤物死亡只做爆散表现，不给经验/碎片/掉落，也不进 collectDefeated。
  sweepSummons() { return sweepSummonsOf(this); }

  onSummonDestroyed(summon) { return onSummonDestroyedOf(this, summon); }

  // 符文引爆：半径内玩家吃伤害（走 takeDamage 尊重无敌帧）+ 向外 6 发环形弹 + 爆炸表现。
  detonateRune(det) { return detonateRuneOf(this, det); }

  // 召唤物绘制（两层）：符文贴地画在 summonG（低于敌人），炮台悬浮画在 summonAirG
  // （高于敌人）。炮台悬停菱形环（now 推导上下浮动，确定性）/ 符文地面菱形 + 引信进度。
  drawSummons() { return drawSummonsOf(this); }

  onEnemyMelee(enemy, melee) { return onEnemyMeleeOf(this, enemy, melee); }

  checkDeath() { return checkDeathOf(this); }

  die() { return dieOf(this); }

  buildSummary() { return buildSummaryOf(this); }

  startStress() {
    if (this.phase !== 'play') return;
    this.stressRunning = true;
    const simulationBegin = this.engine.now;
    this.player.invulnUntil = Number.MAX_SAFE_INTEGER;
    const spawnWave = () => {
      if (this.phase !== 'play') return;
      for (let i = 0; i < 25 && this.enemies.length < 150; i++) this.spawnEnemy({ hp: 10, speed: 30, damage: 8, maxAlive: 999 });
      while (this.shards.length < 200) this.spawnShard(this.player.x - 220 + this.combatRng.next() * 440, this.player.y - 105 + this.combatRng.next() * 210);
      while (this.projectiles.length < 300) {
        const def = cardVisual({ kind: 'sigil', defId: 'arcane_bolt' });
        const o = this.player.staffTip();
        if (!this.fireProjectile(o.x, o.y, this.player.x - 220 + this.combatRng.next() * 440, this.player.y - 105 + this.combatRng.next() * 210, def, null)) break;
      }
    };
    for (let i = 0; i < 6; i++) spawnWave();
    const topUp = this.time.addEvent({ delay: 250, loop: true, callback: spawnWave });
    this.stressTopUp = topUp;
    const deltas = [];
    const begin = performance.now();
    const windowMs = Math.min(180000, Math.max(20000, Number(this.debugParams?.get('stressMs')) || 20000));
    let last = begin;
    const tick = (t) => {
      deltas.push(t - last); last = t;
      if (t - begin < windowMs) { requestAnimationFrame(tick); return; }
      topUp.remove();
      const sorted = [...deltas].slice(2).sort((a, b) => a - b);
      const pick = (q) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] ?? 0;
      window.__STRESS__ = {
        frames: sorted.length,
        simulatedMs: +(this.engine.now - simulationBegin).toFixed(2),
        phase: this.phase,
        p50: +pick(0.5).toFixed(2), p95: +pick(0.95).toFixed(2), p99: +pick(0.99).toFixed(2),
        max: +(sorted[sorted.length - 1] ?? 0).toFixed(2),
        enemies: this.enemies.length, projectiles: this.projectiles.length, shards: this.shards.length,
        objects: this.children.list.length,
        pools: { projectile: this.projectilePool.stats(), shard: this.shardPool.stats(), expMote: this.expMotePool.stats() },
        errors: [],
      };
    };
    requestAnimationFrame(tick);
  }

  onShutdown() {
    hideGuide(this);
    this.game.events.off(Phaser.Core.Events.BLUR, this.handleBlur);
    this.game.events.off(Phaser.Core.Events.FOCUS, this.handleFocus);
    this.input.keyboard.off('keydown-ESC', this.onEsc);
    this.input.keyboard.off('keydown-R', this.onRestart);
    this.input.keyboard.off('keydown-T', this.onTitle);
    this.input.keyboard.off('keydown-M', this.onMute);
    this.input.keyboard.off('keydown-E', this.onEdit);
    if (this.editPointer) this.input.off('pointerdown', this.editPointer);
    this.editPointer = null;
    if (this.dashPointer) this.input.off('pointerdown', this.dashPointer);
    this.dashPointer = null;
    this.editUI?.destroy(true);
    this.editUI = null;
    this.editOpen = false;
    this.touch?.destroy();
    this.touch = null;
    window.removeEventListener('pointerdown', this.panelPointerHandler);
    this.time.removeAllEvents();
    this.background?.destroy();
    this.background = null;
    this.encounterPanel.destroy();
    this.hostileG.destroy();
    this.summonG?.destroy();
    this.summonAirG?.destroy();
    this.summonG = null;
    this.summonAirG = null;
    this.hostileShots = [];
    this.summons = [];
    for (const e of this.enemies) e.destroy();
    for (const p of this.projectiles) p.destroy();
    for (const s of this.shards) s.destroy();
    for (const m of this.expMotes) m.destroy();
    for (const p of this.projectilePool?.free ?? []) p.destroy();
    for (const s of this.shardPool?.free ?? []) s.destroy();
    for (const m of this.expMotePool?.free ?? []) m.destroy();
    this.enemies = [];
    this.projectiles = [];
    this.shards = [];
    if (window.__SIGILWEAVE_BATTLE__ === this) window.__SIGILWEAVE_BATTLE__ = null;
  }
}

