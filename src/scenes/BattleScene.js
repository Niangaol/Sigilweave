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
import TouchControls from '../ui/TouchControls.js';
import { sfx, toggleSound } from '../audio/Sfx.js';
import { playCutscene, cutscenesDisabled } from '../ui/transition.js';
import { STAGE_CARDS } from '../data/cinematics.js';
import { fireGuide, hideGuide } from '../logic/guide.js';
import { saveRun, clearRun } from '../logic/save.js';

// 编队 id → 模板：光环数值的唯一来源。表只有 8 条且模块已深冻，做成静态 Map
// 比每帧在数组里 find 更省，也避免「拿不到模板就静默无光环」这种半失效状态。
const FORMATION_BY_ID = new Map(FORMATIONS.map((f) => [f.id, f]));

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
const KILL_EXP_PER_POINT = 1;
// 道具技能：按 1/2/3 主动释放，冷却 = 基础值 × 卡牌 cdMul。每场重置技能库。
const SKILL_CD_BASE = 5200;
const SKILL_SLOT_MAX = 3;

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
  updateSpawner(dt) {
    if (this.bossStarted) return;
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;
    const dif = difficultyAt(this.engine.now, this.stage);
    const warming = this.engine.now < this.warmupMs;
    // 槽位预算：变体 cost 2 的怪顶两只，所以 room 按 enemySpawnLoad 而不是只数算
    const room = dif.maxAlive - enemySpawnLoad(this.enemies);
    if (room <= 0) {
      // 满场：短暂停手等击杀腾位，避免每帧空转。
      // 这一支是提前 return：本轮不刷，编队轮次也不消耗——waveIndex 只在真正
      // spawn 出怪之后才 +1，否则满场期会把轮次空烧掉，腾位那一刻刷的就不是编队。
      this.spawnTimer = 160;
      return;
    }
    let spawned = 0;
    // 每 formationEvery 波试一次编队（spec §5.2）。waveIndex 从 0 起算，
    // 所以第一波必是普通波：开场先让玩家看到杂兵，别一上来就是队形。
    if (this.waveIndex > 0 && this.waveIndex % DIFFICULTY.formationEvery === 0) {
      spawned = this.spawnFormation(dif);
    }
    if (spawned === 0) {
      const wave = warming ? 1 : Math.max(1, Math.min(dif.wave ?? 1, room));
      spawned = this.spawnWave(dif, wave);
    }
    // 只有真的刷出怪才推进轮次：满场早退（上面那个 return）一只没刷，不推进；
    // 编队没编成时降级成的普通波也是真刷了怪的一轮，照常推进——
    // 这样「每 3 轮一次编队」的节拍始终稳定，不会因为某幕编队常年抽不到
    // 就变成「每轮都试一次编队再降级」，把普通波的兵种多样性挤掉。
    if (spawned > 0) this.waveIndex++;
    const jitter = 0.85 + this.combatRng.next() * 0.3;
    this.spawnTimer = Math.max(150, dif.spawnMs * jitter * (warming ? 2.2 : 1));
  }

  // 编队波（spec §5.2）：rollFormation 按幕抽模板与怪种，抽不到就整轮降级
  // （返回 0，由调用方改刷普通波）。返回实际落地的只数，供轮次推进判断。
  spawnFormation(dif) {
    const roll = rollFormation({
      chapter: this.chapter,
      load: enemySpawnLoad(this.enemies),
      maxAlive: dif.maxAlive,
      rng: () => this.combatRng.next(),
    });
    if (!roll) return 0;
    // 这一批的实例 id：分组（谁给谁加成）用 uid，取数值/取色相仍用模板 id。
    // 不这么拆的话，同模板两批同屏时 A 队前排已死、B 队前排还活着，
    // A 队后排仍会被加成——「打掉前排光环就散」在正常节奏下不成立。
    const formationUid = `${roll.formation.id}#${++this.formationSeq}`;
    // 扇区取「玩家反方向」：整队从一个方向压过来，队形才读得出来。
    // Player 只有 facing（±1）没有速度矢量，所以按朝向取反当扇区中心；
    // spread 1.2 = spec 的 ±0.6rad（扇区公式里 spread 是全宽）。
    const sectorAngle = (this.player?.facing ?? 1) < 0 ? 0 : Math.PI;
    const sectorSpread = 1.2;
    let spawned = 0;
    for (const pick of roll.picks) {
      const points = pickWavePoints({
        rng: () => this.combatRng.next(),
        player: this.player,
        world: this.world,
        enemies: this.enemies,
        count: pick.count,
        sectorAngle, sectorSpread,
        minDist: 275, maxDist: 380, minGap: 30,
        nearDist: 250, farDist: 430,
      });
      for (const point of points) {
        // 槽位预算与普通波同一套：已落地 ≥1 只后超载就收手，
        // 但已经落地的成员留着——半支编队比整轮回滚更自然。
        if (spawned > 0 && enemySpawnLoad(this.enemies) >= dif.maxAlive) return spawned;
        this.spawnEnemy(dif, point, {
          defId: pick.defId,
          formationId: roll.formation.id,
          formationUid,
          formationPath: pick.path,
        });
        spawned++;
      }
    }
    return spawned;
  }

  // 一波怪：一次抽出 count 个互不重叠的落点（屏幕外 275~380，避免贴脸刷出来）
  spawnWave(dif, count) {
    const points = pickWavePoints({
      rng: () => this.combatRng.next(),
      player: this.player,
      world: this.world,
      enemies: this.enemies,
      count,
      minDist: 275, maxDist: 380, minGap: 30,
      nearDist: 250, farDist: 430,
    });
    let spawned = 0;
    for (const point of points) {
      // 槽位预算：变体 cost 2（持盾/精英/天生精英）时一波可能只塞得下 1 只。
      // 已刷出 ≥1 只后超载就 break；一只都还没刷时仍落第一只，避免整波空转。
      if (spawned > 0 && enemySpawnLoad(this.enemies) >= dif.maxAlive) break;
      this.spawnEnemy(dif, point);
      spawned++;
    }
    return spawned;
  }

  // opts.defId / opts.formationId：编队波指定怪种与编队 id（spec §5.2）。
  // 普通波不传 opts，行为与旧版逐字一致。
  spawnEnemy(dif, point = null, opts = {}) {
    // 幸存者式：以玩家为中心、屏幕外环形生成；压测等调用方可直接传 dif 不传落点。
    const { x, y } = point ?? pickSpawnPoint({
      rng: () => this.combatRng.next(),
      player: this.player,
      world: this.world,
      enemies: this.enemies,
      minDist: 275, maxDist: 380, minGap: 30,
      nearDist: 250, farDist: 430,
    });

    // 按幕权重抽敌人类型，再按幕权重叠一层变体；天生精英（def.elite）不再叠变体。
    // RNG 顺序固定：类型 roll → 变体 roll，同一 seed 的刷怪序列可复现。
    // 编队波由 opts.defId 指定怪种（rollFormation 已按幕过滤过），此时不抽类型，
    // 变体照抽——所以编队波比普通波少一次 rng 调用，这是编队波固有的消耗差异。
    const base = opts.defId && ENEMY_TYPES[opts.defId]
      ? ENEMY_TYPES[opts.defId]
      : pickEnemyType(this.chapter, this.combatRng.next());
    const variant = base.elite ? null : pickEnemyVariant(this.chapter, base, this.combatRng.next());
    const def = composeEnemyDef(base, variant);
    // 属性 = 难度基准 × 等级成长 × 敌种/变体倍率
    // 新手引导 G10：第三幕首次刷出精英「咒誓主教」时给一条战斗内短提示
    if (this.chapter === 3 && def?.id === 'oath_bishop') {
      fireGuide(this, this.run, 'G10', { highlight: '敌人' });
    }
    // 新手引导 G13：第一次刷出带变体的敌人（迅捷/重甲/精英），讲清边色与重甲盾
    if (variant) fireGuide(this, this.run, 'G13', { highlight: '敌人' });
    const lv = levelStats(this.run.progression.level);
    const enemy = new Enemy(
      this,
      def,
      x, y,
      { x: this.player.x, y: this.player.y }, // 出生瞬间锁定，之后直线推进
      Math.max(1, Math.round(dif.hp * (def.hpMul ?? 1) * lv.hpMul)),
      dif.speed * (def.speedMul ?? 1) * lv.speedMul,
      Math.round((def.damage ?? dif.damage) * lv.damageMul),
      this.enemySeq++,
    );
    this.enemies.push(enemy);
    // 编队成员打标（spec §5.2）：C4 的光环判定（前排活着 → 同队加甲减速）按编队分组。
    // formationPath 记的职能决定「谁算前排」——没有这个标记，updateEnemies 只能靠 defId 反查
    // 编队模板，而同一个 defId 在不同编队里可能站在不同职能上（例如 page_golem 既做 vanguard
    // 也出现在 elite 池），反查会串队。随成员一起落库，一次写入、之后只读。
    // formationId 是模板（数值/色相），formationUid 是这一批（分组）：
    // 同模板的两批是两支独立的队，A 队前排死了不该给 B 队后排加成。
    if (opts.formationId) enemy.formationId = opts.formationId;
    if (opts.formationId) enemy.formationUid = opts.formationUid ?? opts.formationId;
    if (opts.formationId && opts.formationPath) enemy.formationPath = opts.formationPath;
    // 新手引导 G19（spec §6.4）：第一次出现带三角标记的怪时讲清「脚下一伙的会互相加成」。
    // 放在打标之后、返回之前：只有真的成为编队成员才会触发，普通波（无 formationId）不会误报。
    // 用 oncePerRun 去重，整局只出现一次——玩家看懂标记后不需要再听第二遍。
    if (opts.formationId) fireGuide(this, this.run, 'G19', { highlight: '敌人' });
    return enemy;
  }

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
  refreshFormationAuras() {
    // 第一遍按「这一批」分桶：收「活着的编队成员」，Boss 不收。
    // 键用 formationUid 而不是 formationId：同模板可以连着刷两批，两批是两支独立的队。
    // 按模板分组时，A 队前排已死、B 队前排还活着 → A 队后排仍带光环，
    // 「打掉前排光环就散」在正常节奏下（约每 10s 一批、走过来要 4~7s）不成立。
    // 精英留在桶里是刻意的——它是合格的前排，只是自己不吃加成（下一段判收方时剔除）。
    const groups = new Map();
    for (const e of this.enemies) {
      if (!e?.alive || !e.formationId || e.isBoss) continue;
      const key = e.formationUid ?? e.formationId;
      const arr = groups.get(key);
      if (arr) arr.push(e); else groups.set(key, [e]);
    }

    // 第二遍逐只定字段。遍历的是「场上所有敌人」而不是仅分组成员：
    // Boss/精英/刚死亡的成员也要走到这里被删一次，否则它们上一帧残留的字段
    // 会一直留到对象被销毁为止（对象池复用时会白拿一次加成）。
    for (const e of this.enemies) {
      const inFormation = !!e && e.alive === true && !e.isBoss && !!e.formationId;
      const members = inFormation ? groups.get(e.formationUid ?? e.formationId) : null;
      // 模板缺失（存档里的旧 id / 拼错的 id）时按「无光环」处理：
      // 宁可这队没有加成，也不要凭 id 猜一组数值。
      const aura = members ? formationAuraOf(FORMATION_BY_ID.get(e.formationId)) : null;
      // 前排判定只看「带 vanguard 路径的成员还活着没有」：路径在刷怪时随成员落库，
      // 不由 defId 反查模板——同一个 defId 在不同编队可能站不同位置，反查会串队。
      const hasVanguard = aura != null && members.some((m) => m.alive && m.formationPath === 'vanguard');
      // 收方剔除两类：精英（spec §5.3）与上前排的那只自己（spec 说的是「其余成员」）。
      const receives = hasVanguard && !e.def?.elite && e.formationPath !== 'vanguard';
      if (!receives) {
        // delete 而不是置 null：'formationAura' in e 是测试与调试都想读的「有没有」语义，
        // 留一个 null 会让 applyDamage 的 ?. 与后续排查都变成两套判断。
        delete e.formationAura;
      } else {
        // 每帧新对象、不共享引用：某只怪被单独改字段时不能污染全队。
        e.formationAura = { armorBonus: aura.armorBonus, speedMul: aura.speedMul };
      }
    }
  }

  updateEnemies(dt) {
    // 光环必须先于逐只结算：同一帧里前排刚死、后排这一帧算速度时就必须已经没加成。
    this.refreshFormationAuras();
    // 逐帧轻量分离：同屏已经到 60~90，旧版「>48 只就跳过」会直接叠成一坨；
    // 改用空间分桶 O(n·k) 版本，压测灌到 150 只也不会退化成 O(n²)。
    if (this.enemies.length > 1) {
      separateEnemiesBucketed(this.enemies, { gap: 20, player: this.player, contactDist: 26 });
    }
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (!e.alive) {
        // 死掉的成员不带走光环字段：对象本身会被销毁，但对象池/复用路径上
        // 残留的 formationAura 会让「复活的同一只」白拿一次加成。
        delete e.formationAura;
        // 任何来源造成的Boss死亡都必须汇到统一通幕结算，不能直接跳过
        if (e.isBoss && !this.bossDefeated) this.defeatBoss('combat', e.definition.bossId, e.definition.tier === 'mini' ? 'mini' : 'major');
        if (!this.enemies.includes(e)) continue; // defeatBoss 已将其移出并销毁
        e.destroy();
        this.enemies.splice(i, 1);
        continue;
      }
      e.update(dt, this.engine.now);
      // 罗盘属于 HUD，不是地图地形；怪物可穿过旧分界线。
      // 大地图：杂兵离玩家过远即回收（Boss 不受此限），不再按屏幕边界退场
      if (!e.isBoss && Math.hypot(e.x - this.player.x, e.y - this.player.y) > 560) e.alive = false;
      if (!e.alive) {
        delete e.formationAura;
        e.destroy();
        this.enemies.splice(i, 1);
        continue;
      }
      if (this.player.alive) {
        const d = Math.hypot(e.x - this.player.x, e.y - this.player.y);
        if (d < e.radius + this.player.radius) {
          // 接触不再是「撞一下自毁」：改击退 + 接触冷却，怪留下来反复施压。
          if (this.engine.now >= (e.contactCdUntil ?? 0)) {
            e.contactCdUntil = this.engine.now + 600;
            const hit = this.player.takeDamage(e.damage, this.engine.now);
            if (hit) {
              this.effects.hurt();
              this.effects.impact(e.x, e.y, C.blood, true);
              shakeCamera(this, 'hurt', 90, 0.004);
            }
            if (this.player.alive) this.applyEnemyControl?.(e, 'contact', this.engine.now);
            if (!e.isBoss && d > 0.001) {
              // 撞完把怪顶开一点，避免整只怪陷在玩家身体里
              e.x += ((e.x - this.player.x) / d) * 18;
              e.y += ((e.y - this.player.y) / d) * 18;
            }
          }
        }
      }
    }
  }

  // 池化生成：池满返回 null，调用方不需要处理“被抢占”的对象
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
  grantSkill(defId) {
    if (!Object.hasOwn(SIGIL_DEFS, defId)) return;
    const def = SIGIL_DEFS[defId];
    const lib = this.run.skillLibrary ?? (this.run.skillLibrary = []);
    const existing = lib.find(s => s.defId === defId);
    if (existing) { existing.cdMs = this.skillCdOf(def); return; }
    const entry = { defId, name: def.name, kind: def.kind, cdMs: this.skillCdOf(def), cooldownUntil: 0 };
    if (lib.length < SKILL_SLOT_MAX) lib.push(entry);
    else { lib.shift(); lib.push(entry); } // 槽位已满：顶掉最早的一格
    const slot = lib.indexOf(entry) + 1;
    this.effects.text(240, 116, '技能入库 · ' + def.name + '（按 ' + slot + '）', HEX.teal, true);
    fireGuide(this, this.run, 'SKILL_GAIN', { name: def.name, slot });
    this.saveProgress();
  }

  skillCdOf(def) {
    return Math.round(SKILL_CD_BASE * (Number.isFinite(def.cdMul) ? def.cdMul : 1));
  }

  // 技能不占用法阵格，但复制命中管线需要一个承载格：取已解锁、未静默、带符印的格子。
  skillHostCell() {
    const cells = this.grid?.cells ?? [];
    for (const cell of cells) {
      if (cell.unlocked && !cell.mutedOutput && cell.slot?.kind === 'sigil') return cell.id;
    }
    return Number.isInteger(this.startCell) ? this.startCell : (cells.find(c => c.unlocked)?.id ?? 4);
  }

  // 自动锁定屏幕内离玩家最近的敌人；没有目标时朝面向方向给一个落点。
  pickSkillAim() {
    const visible = visibleFilter(this.viewRect());
    let best = null, bestD = Infinity;
    for (const e of this.enemies) {
      if (!e.alive || !visible(e)) continue;
      const d = Math.hypot(e.x - this.player.x, e.y - this.player.y);
      if (d < bestD) { bestD = d; best = e; }
    }
    if (best) return { x: best.x, y: best.y };
    const facing = Number.isFinite(this.player.facing) ? this.player.facing : 0;
    return { x: this.player.x + Math.cos(facing) * 60, y: this.player.y + Math.sin(facing) * 60 };
  }

  castSkill(index) {
    if (this.phase !== 'play' || this.paused || this.hitstopLeft > 0 || !this.player.alive) return;
    const entry = this.run.skillLibrary?.[index];
    if (!entry) return;
    if (this.engine.now < (entry.cooldownUntil ?? 0)) {
      this.effects.text(240, 116, '技能冷却中', HEX.mute, true);
      return;
    }
    const def = SIGIL_DEFS[entry.defId];
    if (!def) return;
    const origin = this.player.staffTip();
    const aim = this.pickSkillAim();
    const angle = Math.atan2(aim.y - origin.y, aim.x - origin.x);
    entry.cooldownUntil = this.engine.now + entry.cdMs;
    sfx.trigger();
    this.effects.spellCast(entry.defId, origin.x, origin.y, angle);
    // 复用法术命中管线：伤害/命中数字/连锁/经验/碎片全部照常结算。
    const result = this.applySigil(this.skillHostCell(), entry.defId, aim, angle);
    if (def.kind === 'ward') this.effects.spellWard(entry.defId, def.radius ?? 40);
    else if (!result.empty) this.effects.spellImpact(entry.defId, aim.x, aim.y, def.radius ?? 14, angle);
    fireGuide(this, this.run, 'SKILL_CAST', { name: entry.name });
    this.saveProgress();
  }

  saveProgress() {
    saveRun(this.run);
  }

  applySigil(cellId, defId, aimPoint, impactAngle = null) {
    // 防御：没有格号的弹丸（调试/压测里手工造出来的）不能把整局打崩
    const cell = this.grid.cells[cellId];
    if (!cell) {
      return { hits: 0, damage: 0, aim: null, empty: true, targets: [], sacrificeSpent: 0, sacrificeApplied: false };
    }
    // 清掉上一轮的伤害读数：applyDamage 会把这一下真实扣血写回 enemy.lastHitAmount。
    // lastBlocked 也清零，避免 applyDamage 早退（已死/非法伤害）时残留上一发的护盾火花。
    for (const e of this.enemies) {
      e.lastHitAmount = 0;
      e.lastBlocked = 0;
    }
    // 召唤物的读数一起清（它们走同一套 onEnemyHit 反馈，但不进敌人列表）
    for (const s of this.summons ?? []) {
      if (!s) continue;
      s.lastHitAmount = 0;
      s.lastBlocked = 0;
    }
    const view = this.viewRect();
    // 召唤物也能被法术选中/打掉：只在这一处把敌人列表换成「敌人 + 召唤物」，
    // 其余结算循环（经验/碎片/尸爆/连斩）仍只看 this.enemies。
    const result = resolveSigilTrigger({ grid: this.grid, cellId, defId, state: this.combatState(), enemies: this.combatTargets(), aimPoint, view });
    if (result.sacrificeApplied) {
      const c = cellCenter(cellId);
      this.effects.text(c.x, c.y - 10, '献祭 -8盾 双倍', HEX.blood, true);
    }
    // 命中反馈：单体/护盾给逐目标小火花；范围/贯穿/连锁交给 spellImpact 的整片图案，
    // 否则一次扫 20 只会叠出 20 份描边，帧时间会崩。
    const visual = this.sigilOf(cellId);
    const perTarget = result.targets.length <= 3;
    for (const enemy of result.targets) this.onEnemyHit(enemy, aimPoint, impactAngle, visual, perTarget);
    this.triggerDeathBursts();
    this.collectDefeated();
    // 被法术打掉的召唤物：只做爆散，不给经验/碎片/尸爆种子（不进 collectDefeated）
    this.sweepSummons();
    return result;
  }

  // 小怪受击：先算「这一下从哪来」，交给实体做后坐/挤压/闪白，再补火花与飘字。
  // 公式与方向只在这里算一次，实体只负责表现，不改逻辑坐标（碰撞/索敌不受影响）。
  onEnemyHit(enemy, aimPoint, impactAngle, visual, detailed = true) {
    const now = this.engine.now;
    const ax = Number.isFinite(aimPoint?.x) ? aimPoint.x : this.player.x;
    const ay = Number.isFinite(aimPoint?.y) ? aimPoint.y : this.player.y;
    let dx = enemy.x - ax;
    let dy = enemy.y - ay;
    if (Math.hypot(dx, dy) < 0.5) {
      const ang = Number.isFinite(impactAngle)
        ? impactAngle
        : Math.atan2(enemy.y - this.player.y, enemy.x - this.player.x);
      dx = Math.cos(ang);
      dy = Math.sin(ang);
    }
    const amount = Number.isFinite(enemy.lastHitAmount) ? enemy.lastHitAmount : 0;
    enemy.hitAt = now;
    enemy.hitReact?.(dx, dy, amount, now);
    // 护盾吸收：青钢色火花 + 金属音，和普通受击叠加（护盾档伤害时 amount=0，不会重复飘字）。
    // 放在 detailed 早退之前：低细节档（群伤）也要有「这只有盾」的反馈。
    if (Number.isFinite(enemy.lastBlocked) && enemy.lastBlocked > 0) {
      this.effects.hitSpark(enemy.x, enemy.y, dx, dy, C.teal, 0.5);
      sfx.shieldHit();
    }
    if (!detailed) return;
    const color = visual?.color ?? C.arcane;
    this.effects.hitSpark(enemy.x, enemy.y, dx, dy, color, enemy.hitPower ?? 0.6);
    if (amount > 0) {
      const heavy = enemy.maxHp > 0 && amount / enemy.maxHp >= 0.28;
      // 飘字落在头顶而不是脸前：视觉外框的 top 是负值（向上），素材怪比逻辑半径高得多
      const ext = enemy.viewExtent;
      const topOffset = ext && Number.isFinite(ext.top)
        ? Math.abs(ext.top) + 2
        : (Number.isFinite(enemy.radius) ? enemy.radius : 6) + 14;
      this.effects.damageNumber(enemy.x, enemy.y - topOffset, amount, heavy ? HEX.brassLight : HEX.white, heavy);
    }
    this.effects.impact(enemy.x, enemy.y, color, false);
  }

  // 割草连锁：被法术打死的怪炸开，按最大生命比例炸伤周围的怪；炸死的继续引爆（纯逻辑在 effects.js）。
  // 奖励/经验/碎片统一走 onEnemyKilled，不在这里重复结算。
  triggerDeathBursts() {
    const seeds = this.enemies.filter((e) => !e.alive && e.hp === 0 && !e.rewarded);
    if (!seeds.length) return 0;
    const burst = resolveDeathBursts({ enemies: this.enemies, seeds, view: this.viewRect() });
    // 连锁炸死 4 只以上给一层骨屑冲击（只画在第一个爆点，避免满屏叠加）
    if (burst.killed >= 4) this.effects.burst(seeds[0].x, seeds[0].y, C.bone, 6);
    return burst.killed;
  }

  // 破盾：碎片爆散 + 金属碎裂音 + 一次 ≤2px/120ms 的轻震屏。
  // 由 Enemy.consumeShieldBreak 在 update 里只回调一次；这里不重复结算伤害/碎片。
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

  collectDefeated() {
    for (const enemy of [...this.enemies]) if (!enemy.alive && enemy.hp === 0) this.onEnemyKilled(enemy);
  }

  resolveProjectile(p) {
    if (!Number.isInteger(p.cellId)) return;   // 没有格号的弹丸不结算，见 applySigil 的防御
    const impactAngle = Math.atan2(p.ty - p.sy, p.tx - p.sx);
    // 有前摇的法术：先亮预警圈，castMs 后再真正结算（弹丸这一下已经飞到了，等的是「落点要爆」）
    this.queueOrCommit(p.cellId, p.def.id, { x: p.tx, y: p.ty }, impactAngle);
  }

  // 前摇统一入口：castMs > 0 只排队 + 预警，否则立刻结算。
  queueOrCommit(cellId, defId, point, angle) {
    const def = SIGIL_DEFS[defId];
    const castMs = castTimeOf(defId);
    if (castMs > 0) {
      this.pendingCasts.push({ cellId, defId, x: point.x, y: point.y, angle, at: this.engine.now + castMs });
      this.effects.telegraph(point.x, point.y, castMs, def.color, def.radius ?? 46);
      return null;
    }
    return this.commitSigil(cellId, defId, point, angle);
  }

  // 真正结算一次命中 + 播全部命中表现。resolveProjectile 与前摇到点都走这里，保证两路表现一致。
  commitSigil(cellId, defId, point, angle) {
    const result = this.applySigil(cellId, defId, point, angle);
    const def = SIGIL_DEFS[defId];
    const radius = Number.isFinite(def?.radius) ? def.radius
      : defId === 'meteor_judgment' ? 95
        : defId === 'quake_maw' ? 80
          : defId === 'starfall' ? 70
            : 14;
    this.effects.spellImpact(defId, point.x, point.y, radius, angle);
    this.spellPunch(defId, point.x, point.y, radius, angle);
    this.spellLinkFx(defId, {}, result);
    this.reactionFx({ tx: point.x, ty: point.y }, result);
    if (!result.hits) this.effects.impact(point.x, point.y, def?.color ?? C.arcane, true);
    return result;
  }

  // 前摇到点：engine.now 到 at 才结算。暂停/顿帧时 engine.now 不走，前摇自然停住。
  tickPendingCasts() {
    if (!this.pendingCasts?.length) return;
    const now = this.engine.now;
    const due = this.pendingCasts.filter(cast => now >= cast.at);
    if (!due.length) return;
    this.pendingCasts = this.pendingCasts.filter(cast => now < cast.at);
    for (const cast of due) this.commitSigil(cast.cellId, cast.defId, { x: cast.x, y: cast.y }, cast.angle);
  }

  // 命中重量：按法术分级震屏，重击额外给短顿帧。同法术 gapMs 内只吃一次，
  // 否则一刀扫 3 只会把震屏叠成连续抖动，反而糊。
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
  // Boss 进场演出：压降 + 震屏 + 名字条 + 时停无敌（答错进入实战前播放）
  playBossIntro(bossId) {
    const def = getEncounterById(bossId);
    const mini = def?.tier === 'mini';
    const dur = mini ? 900 : 1600;
    this.phase = 'intro'; this.paused = true; this.engine.paused = true;
    // 大立绘需要更多上方取景：镜头整体上移，玩家被推到画面下半区，Boss 完整落在 HUD 下方。
    this.bossCamOffset = mini ? 50 : 80;
    this.resumeFollow(this.bossCamOffset);
    this.introDur = dur; this.introLeft = dur;
    if (this.boss) {
      this.introToY = this.boss.y;
      this.introFromY = Math.max(60, this.boss.y - 140);
      this.boss.y = this.introFromY;
    }
    sfx.bossRoar();
    shakeCamera(this, 'major', mini ? 150 : 320, 0.005);
    this.effects.text(240, 92, (def ? def.name + ' · ' + def.title : '未知的威胁'), 12, HEX.brassLight, true);
    this.effects.text(240, 112, mini ? '小 Boss 拦路' : '大 Boss 降临', 9, HEX.blood, true);
    this.effects.text(240, 128, mini ? '它挡住了去路' : '它的眼神锁定了你', 8, HEX.mute, true);
  }

  // 升级三选一：时停抽卡，卡片进手牌（配合暂停改阵自行放置）
  queueLevelPicks(count) {
    this.pendingPicks = (this.pendingPicks ?? 0) + count;
    if (this.phase === 'play') this.openLevelupPick();
  }

  openLevelupPick() {
    if (!this.pendingPicks) return;
    this.phase = 'levelup'; this.paused = true; this.engine.paused = true;
    this.input.keyboard.resetKeys();
    // 新手引导 G02：第一次升级三选一（弹窗本身即讲解场景）
    fireGuide(this, this.run, 'G02');
    // 升级三选一也走按幕解锁：前两幕不会刷出陨星裁决/地裂之颚这类演出级法术。
    const pool = cardsForAct(CARD_POOL, this.chapter);
    const picks = [];
    // 进化优先：盘面/手牌里已有、还没升级的法术，有 45% 概率占一个候选位。
    const evoPick = this.rollEvolutionPick();
    if (evoPick) {
      picks.push(evoPick);
      // 新手引导 G15：第一次见到进化牌时讲清「不占格、整条强化、连携相邻」。
      fireGuide(this, this.run, 'G15', { highlight: 'hand' });
    }
    while (picks.length < 3 && pool.length) {
      const base = pool.splice(Math.floor(this.combatRng.next() * pool.length), 1)[0];
      picks.push(base.kind === 'sigil' ? { kind: 'sigil', defId: base.defId, variant: rollVariant(this.combatRng, base.defId) } : base);
    }
    const names = { ...SIGIL_DEFS, ...AUX_DEFS };
    const cardLabel = card => card.kind === 'evolution'
      ? '进化 · ' + card.route.name
      : card.kind === 'auxiliary'
        ? (names[card.defId]?.name ?? card.defId) : variantOf(card.defId, card.variant).name;
    const cardSub = card => card.kind === 'evolution' ? (names[card.defId]?.name ?? card.defId) + ' 全部强化'
      : card.kind === 'auxiliary' ? '辅助'
        : card.variant === 'harmon' ? '符印 · 谐' : card.variant === 'sharp' ? '符印 · 锐' : '符印 · 标';
    this.levelupUI = this.add.container(0, 0).setDepth(2600).setScrollFactor(0);
    this.uiRoot?.add(this.levelupUI);
    const g = this.add.graphics();
    pxRect(g, 60, 70, 360, 130, C.ink, 0.97); pxFrame(g, 60, 70, 360, 130, C.brass, 1, 1);
    this.levelupUI.add(g);
    this.levelupUI.add(addText(this, 240, 80, '升 级 ！ 选 择 一 张 法 术 （ 入 手 牌 ）', 10, HEX.brassLight).setOrigin(0.5, 0));
    picks.forEach((card, i) => {
      const x = 78 + i * 118;
      const bg = this.add.graphics();
      pxRect(bg, x, 102, 108, 66, C.stoneDark); pxFrame(bg, x, 102, 108, 66, this.combatRng.next() < 0.5 ? C.brass : C.teal, 1, 1);
      this.levelupUI.add(bg);
      this.levelupUI.add(addText(this, x + 54, 108, cardLabel(card), 9,
        card.kind === 'evolution' ? HEX.brassLight : card.kind === 'auxiliary' ? HEX.teal : HEX.parchment).setOrigin(0.5, 0));
      this.levelupUI.add(addText(this, x + 54, 126, cardSub(card), 7, card.variant === 'harmon' ? HEX.teal : HEX.mute).setOrigin(0.5, 0));
      this.levelupUI.add(addText(this, x + 54, 156, '点击或按 ' + (i + 1), 7, HEX.brass).setOrigin(0.5, 0));
    });
    this.levelupRects = picks.map((card, i) => ({ card, x: 78 + i * 118, y: 102, w: 108, h: 66 }));
    this.levelupHandler = (pointer) => {
      const scale = getRenderScale();
      const lx = pointer.x / scale, ly = pointer.y / scale;
      for (const r of this.levelupRects ?? []) {
        if (lx >= r.x && lx <= r.x + r.w && ly >= r.y && ly <= r.y + r.h) { this.pickLevelupCard(r.card); return; }
      }
    };
    this.levelupKeys = ['ONE', 'TWO', 'THREE'].map((code, i) => {
      const key = this.input.keyboard.on('keydown-' + code, () => this.pickLevelupCard(this.levelupRects[i]?.card));
      return key;
    });
    this.input.on('pointerdown', this.levelupHandler);
    this.levelupUI.add(addText(this, 240, 182, '点击卡片或按 1/2/3 选择；卡片进手牌，暂停菜单→编辑法阵 可放置', 7, HEX.mute).setOrigin(0.5, 0));
  }

  // 进化候选：只从「已拥有且未升级」的法术里挑一条路线，避免三选一里出现用不上的进化。
  rollEvolutionPick() {
    if (this.combatRng.next() > 0.45) return null;
    const owned = new Set();
    for (const cell of this.grid.cells) if (cell.slot?.kind === 'sigil') owned.add(cell.slot.defId);
    for (const key of Object.keys(this.run.hand ?? {})) {
      const card = cardOf(key);
      if (card?.kind === 'sigil') owned.add(card.defId);
    }
    const options = [];
    for (const defId of owned) {
      if (this.run.evolutions?.[defId]) continue;
      for (const route of EVOLUTIONS[defId] ?? []) options.push({ kind: 'evolution', defId, evo: route.id, route });
    }
    if (!options.length) return null;
    return options[Math.floor(this.combatRng.next() * options.length)];
  }

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

  pickLevelupCard(card) {
    if (this.phase !== 'levelup' || !card) return;
    const evolved = card.kind === 'evolution';
    if (evolved) this.applyEvolution(card);
    else {
      const key = cardKeyOf(card);
      this.run.hand[key] = (this.run.hand[key] ?? 0) + 1;
      // 三选一里玩家选中的这张卡就是本场技能：选攻击就是攻击技能，选防御（圣光壁垒/圣环）就是护盾技能。
      // 辅助卡与进化卡没有主动法术（进化作用于已有法术），grantSkill 内部会安全忽略，不占技能格。
      this.grantSkill(card.defId);
    }
    if (this.levelupHandler) { this.input.off('pointerdown', this.levelupHandler); this.levelupHandler = null; }
    for (const key of ['ONE', 'TWO', 'THREE']) this.input.keyboard?.off('keydown-' + key);
    this.levelupUI?.destroy(true); this.levelupUI = null;
    this.levelupRects = null;
    this.pendingPicks--;
    sfx.correct();
    this.effects.text(240, 150, evolved
      ? '已进化 ' + (SIGIL_DEFS[card.defId]?.name ?? card.defId) + ' → ' + card.route.name
      : '已入手 ' + (card.kind === 'auxiliary'
        ? (AUX_DEFS[card.defId]?.name ?? card.defId) : variantOf(card.defId, card.variant).name), evolved ? HEX.brassLight : HEX.teal, true);
    if (this.pendingPicks > 0) this.openLevelupPick();
    else { this.phase = 'play'; this.paused = false; this.engine.paused = false; }
  }

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
  finishStage() {
    if (this.phase !== 'bossDefeated' || !this.bossDefeated) return;
    if (this.stageOutcome === 'swap') { this.swapStage(nextStage(this.stage)); return; }
    this.phase = 'intermission'; this.paused = true; this.engine.paused = true;
    const report = { ...this.engine.summary(this.engine.now), elapsedMs: this.engine.now, kills: this.kills, peakRate: this.peakRate };
    recordAct(this.run, report);
    this.run.shards = this.shardCount;
    this.run.draft = snapshotBuild(this.grid, { act: this.chapter });
    if (this.stageOutcome !== 'victory') {
      // 通幕：幕号 +1，落回该幕第一场；先播「契约解除」标题卡与本幕数据，再落到幕间工作台。
      const clearedChapter = this.chapter;
      const clearedStage = this.stage;
      this.chapter = Math.min(5, this.chapter + 1);
      this.stage = firstStageOf(this.chapter);
    this.run.chapter = this.chapter;
    this.run.stage = this.stage;
    this.stageOutcome = 'none';
    // 进入新的一幕/新场：落盘当前游标，供「继续冒险」从此处读档。
    this.saveProgress();
    // 通幕卡按「刚打完的那一幕」出卡：stage 显式传刚清空的场（合并幕=后半场），
      // payload.run 已指向下一幕第一场，供幕间工作台使用。
      playCutscene(this, {
        kind: 'clear', act: clearedChapter, stage: clearedStage, report, to: 'IntermissionScene',
        payload: { run: this.run, report, __cine: true },
      });
    } else {
      const totals = this.run.reports.reduce((out, report) => ({
        elapsedMs: out.elapsedMs + report.elapsedMs,
        kills: out.kills + report.kills,
        triggers: out.triggers + report.triggers,
        combos: out.combos + report.combos,
        blocked: out.blocked + report.blocked,
        peakRate: Math.max(out.peakRate, report.peakRate),
      }), { elapsedMs: 0, kills: 0, triggers: 0, combos: 0, blocked: 0, peakRate: 0 });
      // 通关：本局已结束，清除断点存档，避免标题页还提示续玩一个已通关的局。
      clearRun();
      // 终局：三道契约环碎裂 → 结局演出（StoryScene ending）→ 胜利结算。
      // ?cine=0 / ?stress=1 时不播结局直达面板，保持调试契约（playCutscene 兜底会把结局照播）。
      const victoryPayload = { ...this.buildSummary(), ...totals, victory: true, bossResolutions: structuredClone(this.run.bossResolutions), __cine: true };
      if (cutscenesDisabled()) {
        const fallback = { ...victoryPayload };
        delete fallback.__cine;
        this.scene.start('GameOverScene', fallback);
        return;
      }
      playCutscene(this, {
        kind: 'victory', act: this.chapter, stage: this.stage, report: totals, to: 'StoryScene',
        payload: { mode: 'ending', stats: victoryPayload, __cine: true },
      });
    }
  }

  // 幕内换场：同一幕的下一场，不切场景、不弹工作台，只在原地重建世界层。
  // 保留：构筑/手牌/碎晶/击杀数/引擎时间/成长/血量；重置：敌人/弹幕/宝箱/事件点/刷怪节奏。
  swapStage(next) {
    if (!isValidStage(next) || next === this.stage) return;
    this.stage = next;
    this.run.stage = next;
    this.chapter = chapterOf(next);
    this.run.chapter = this.chapter;
    this.stageOutcome = 'none';
    // 换场即换关：技能库清零，冷却复位，下一场只看本场发放了什么道具。
    this.run.skillLibrary = [];
    this.run.skillStage = next;
    this.skillCooldowns = [0, 0, 0];
    this.saveProgress();
    const world = WORLD_SIZES[next] ?? WORLD_SIZES[1];
    this.world = { w: world.w, h: world.h };
    this.worldBounds = { left: 24, top: 40, right: world.w - 24, bottom: world.h - 24 };
    this.battleBounds = this.worldBounds;
    this.background.setAct(next);
    this.cameras.main.setBounds(0, 0, world.w, world.h);
    // 清场：旧场的敌人、弹幕、宝箱全部回收；经验粒子先结算，避免「差一点没捡到」。
    this.flushExpMotes();
    for (const enemy of this.enemies) enemy.destroy();
    this.enemies = [];
    this.boss = null;
    this.bossStarted = false;
    this.bossDefeated = false;
    this.releaseProjectiles();
    this.hostileShots = []; this.hostileG.clear();
    this.summons = []; this.summonG?.clear(); this.summonAirG?.clear();
    for (const chest of this.chests) chest.g?.destroy();
    this.chests = [];
    // 新场中心落位 + 事件点按新场重建（旧场已完成点仍记在 run.completedEvents）
    this.player.x = world.w / 2;
    this.player.y = world.h / 2;
    this.player.moving = false;
    this.player.draw(this.engine.now);
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);
    this.cameras.main.setDeadzone(60, 40);
    this.cameras.main.setFollowOffset(0, followBaseY());
    this.eventPoints = getEventPoints(next, this.world).map(p => ({ ...p, done: !!this.run.completedEvents[p.id], icon: null, label: null }));
    // 刷怪节奏轻启，但引擎时间/等级/构筑全部延续（密度按新的幕生效）。
    this.spawnTimer = 700;
    this.warmupMs = 1400;
    this.timeExpTimer = 0;
    this.lastKillAt = this.engine.now - 9999;
    this.killStreak = 0;
    // 场次卡：1.6 秒原地停留，期间战斗冻结
    const card = STAGE_CARDS[next];
    this.phase = 'stageIntro'; this.paused = true; this.engine.paused = true;
    this.input.keyboard.resetKeys();
    this.stageIntroLeft = 1600;
    sfx.bossRoar();
    this.cameras.main.flash(180, 255, 246, 224);
    this.effects.text(240, 90, card ? card.numeral + ' · ' + card.title : '第 ' + next + ' 场', 12, HEX.brassLight, true);
    this.effects.text(240, 110, card ? card.star + ' 位 · 第 ' + this.chapter + ' 幕' : '', 9, HEX.brass, true);
    this.effects.text(240, 126, '新的场地已经展开', 8, HEX.mute, true);
  }

  onEnemyKilled(e) {
    if (e.rewarded) return;
    if (e.isBoss) {
      e.rewarded = true;
      this.defeatBoss('combat', e.definition.bossId, e.definition.tier === 'mini' ? 'mini' : 'major');
      return;
    }
    e.rewarded = true;
    this.kills++;
    this.bumpKillStreak(e);
    // 经验：普通 1 点、精英 6 点。击杀不再直接入账，而是从爆散中心飞出青色经验粒子，
    // 粒子追到玩家身上才结算 —— 玩家看到的是「打碎它 → 碎片和经验一起炸出来 → 吸进身体」。
    const expMul = this.run.compassBuffs.expMul * (this.quickMode ? 4 : 1);
    this.expKillAccum += e.def?.elite ? 6 : 1;
    const expPoints = Math.floor(this.expKillAccum / KILL_EXP_PER_POINT);
    if (expPoints > 0) {
      this.expKillAccum -= expPoints * KILL_EXP_PER_POINT;
      for (let i = 0; i < expPoints; i++) {
        // 环绕错开出生点，精英 6 颗不会叠在同一像素上
        const a = (i / expPoints) * Math.PI * 2;
        this.spawnExpMote(e.x + Math.cos(a) * 4, e.y - 6 + Math.sin(a) * 3, 1, expMul);
      }
    }
    // 宝箱：击杀量涨了约 10 倍，掉率同步压到 0.8%、同屏最多 4 个，否则增益会糊满地图
    if (this.combatRng.next() < 0.008 && this.chests.length < 4) this.spawnChest(e.x, e.y);
    // 击杀爆散：小怪碎成骨屑与身体碎片飞出去（精英更大一圈），经验粒子就在这团里飞出
    this.effects.deathScatter(e.x, e.y, e.def?.color ?? C.bone, { elite: !!e.def?.elite });
    // 碎片：密度 ×10 后按概率掉（精英必掉 4 颗，变体再按 shardsAdd 加量），避免工作台经济被瞬间刷爆
    if (e.def?.elite || this.combatRng.next() < 0.45) {
      const drop = (e.def?.elite ? 4 : 1) + (e.def?.variant?.shardsAdd ?? 0);
      for (let i = 0; i < drop; i++) this.spawnShard(e.x + (i - (drop - 1) / 2) * 4, e.y - (i % 2) * 3);
    }
    e.alive = false;
    e.destroy();
    const idx = this.enemies.indexOf(e);
    if (idx >= 0) this.enemies.splice(idx, 1);
  }

  // 连斩：1.5 秒内连续击杀累计，超过就断。每 12 连斩回 1 点血，
  // 20/40/60 连斩给一次极轻震屏 —— 割草的手感反馈，不改变任何结算数值。
  bumpKillStreak(e) {
    const now = this.engine.now;
    if (now - this.lastKillAt > 1500) this.killStreak = 0;
    this.lastKillAt = now;
    this.killStreak++;
    if (this.killStreak > this.streakBest) this.streakBest = this.killStreak;
    this.effects.killStreak(this.killStreak);
    sfx.kill(this.killStreak);
    if (this.killStreak % 12 === 0 && this.player.alive && this.player.hp < this.player.maxHp) {
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + 1);
      this.effects.text(this.player.x, this.player.y - 16, '连斩回复 +1', HEX.teal);
    }
    // 连斩 20/40/60 只走文字与音效，不再震屏
  }

  updateShards(dt) {
    // 碎片共鸣：扩大吸取半径，不直接拾取
    const magnet = this.grid.cells.some(c => c.unlocked && c.slot?.defId === 'shard_resonance');
    const opts = magnet ? { pullRadius: 96, pullSpeed: 92 } : undefined;
    for (let i = this.shards.length - 1; i >= 0; i--) {
      const s = this.shards[i];
      const picked = s.update(dt, this.player, this.engine.now, opts);
      if (picked) {
        this.shardCount++;
        sfx.pick();
        this.effects.text(s.x, s.y - 6, '+1', HEX.teal);
        s.deactivate();
        this.shardPool.release(s);
        this.shards.splice(i, 1);
      }
    }
  }

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
  checkProgressEvents() {
    // 新手引导：大 Boss 前置提示（各幕 G04/G08/G11）——等级逼近门槛时先给一句，不剧透答案
    const bossLv = MAJOR_BOSS_LEVEL[this.stage];
    const guideId = this.stage === 1 ? 'G04' : this.stage === 2 ? 'G08' : this.stage === 3 ? 'G11' : null;
    if (guideId && !this.run.majorBossStages[this.stage]
      && this.run.progression.level >= bossLv - 1
      && this.phase === 'play' && !this.paused) {
      fireGuide(this, this.run, guideId, { act: this.chapter, stage: this.stage });
    }
    // 1) 大Boss：等级达标（时间保底经验推着等级走，磨蹭也会触发）
    if (!this.bossStarted && !this.run.majorBossStages[this.stage] && shouldTriggerMajorBoss(this.stage, this.run.progression.level)) {
      const def = getEncounterForStage(this.stage, 'boss');
      if (def) { this.beginEncounter(def); return; }
    }
    // 2) 地图事件点：NPC 问答 / 小Boss 门
    for (const point of this.eventPoints) {
      if (point.done) continue;
      if (Math.hypot(this.player.x - point.x, this.player.y - point.y) <= point.radius) {
        const def = getEncounterById(point.id);
        if (def) { this.beginEncounter(def); return; }
      }
    }
  }

  // 绘制事件点图标与接近提示（每帧轻量）
  updateEventPointVisuals() {
    for (const point of this.eventPoints) {
      if (point.done) { if (point.icon) { point.icon.destroy(); point.icon = null; } if (point.label) { point.label.destroy(); point.label = null; } continue; }
      const d = Math.hypot(this.player.x - point.x, this.player.y - point.y);
      if (!point.icon) {
        point.icon = this.add.graphics().setDepth(Math.floor(point.y));
        const g = point.icon;
        const col = point.type === 'npc' ? C.teal : C.blood;
        pxRect(g, point.x - 5, point.y - 9, 10, 12, C.nightDeep, 1);
        pxFrame(g, point.x - 5, point.y - 9, 10, 12, col, 1);
        pxRect(g, point.x - 2, point.y + 3, 4, 2, C.stoneDark, 1);
        if (point.type === 'miniboss') pxDiamond(g, point.x, point.y - 3, 2, C.blood, 1, true);
        else pxRect(g, point.x - 1, point.y - 7, 2, 4, C.teal, 1);
      }
      const near = d < 130;
      if (near && !point.label) {
        // 新手引导 G03：首次靠近发光事件点（此时游戏原生提示标签也刚出现）
        fireGuide(this, this.run, 'G03', { highlight: 'eventPoint' });
      }
      if (near && !point.label) point.label = addText(this, point.x, point.y - 24, point.name + '（' + point.hint + '）', 7, point.type === 'npc' ? HEX.teal : HEX.blood, { wordWrap: { width: 160 } }).setOrigin(0.5, 1).setDepth(300);
      if (!near && point.label) { point.label.destroy(); point.label = null; }
    }
  }

  beginEncounter(definition) {
    if (this.phase !== 'play') return;
    const opened = openEncounter(this.run.encounters, definition, { seed: this.run.seed + ':' + definition.id });
    if (!opened.ok) return;
    // 大Boss一旦触发过（无论答对处决/答错开战）就不再重复触发，防止等级条件恒真导致无限开问答
    if (definition.type === 'boss' && definition.tier !== 'mini') this.run.majorBossStages[this.stage] = true;
    // 冻结镜头跟随：问答面板挂世界坐标，镜头再动面板就会漂移、点击全偏
    this.cameras.main.stopFollow();
    this.phase = 'encounter'; this.paused = true; this.engine.paused = true;
    this.menuOpen = false; this.spaceHeld = false; this.focusPaused = false;
    this.pauseMenu.hide(); this.hint.setVisible(false); this.pauseHint.setVisible(false);
    this.board.setDetailVisible(false); this.input.keyboard.resetKeys();
    if (definition.type === 'boss') {
      this.bossStarted = true;
      this.boss = new Boss(this, definition, this.stage, this.enemySeq++);
      // 阶段基线归零：否则上一只 Boss 的 phase 会让新 Boss 登场同帧误判一次「转阶段」。
      // model.phase 在 createBossModel 时还是 undefined，由 stepBoss 首次调用补成 0，
      // 所以这里必须写 0（而不是 model.phase）：写 undefined 会让新 Boss 第一帧
      // updateEnemies 之后被误判成一次转阶段，G18 引导也会在开战瞬间就弹。
      this.lastBossPhase = this.boss.model.phase ?? 0;
      this.boss.x = this.player.x;
      // 新 Boss 立绘 72/104px：下限按实际显示高度算，保证整只 Boss 落在 HUD 下方。
      const bossMinY = 42 + (this.boss.sprite?.displayHeight ?? 0) - 21 + 4;
      // 92 而不是 110：大立绘 104px 时，110 的间距会把 Boss 头顶顶到 HUD 里
      this.boss.y = Math.max(bossMinY, this.player.y - 92);
      this.enemies.push(this.boss);
    }
    this.encounterPanel.show(this.run.encounters.active);
    sfx.quiz();
  }

  selectEncounterAnswer(choiceId) {
    if (this.phase !== 'encounter') return;
    const response = selectChoice(this.run.encounters, choiceId);
    window.__LAST_SELECT__ = { choiceId, ok: response.ok, message: response.message };
    this.encounterPanel.show(this.run.encounters.active, response.ok ? '' : response.message);
  }

  confirmEncounterAnswer() {
    if (this.phase !== 'encounter') return;
    const response = confirmChoice(this.run.encounters);
    if (!response.ok) { this.encounterPanel.show(this.run.encounters.active, response.message); return; }
    const result = response.result;
    this.shardCount += result.reward.shards ?? 0;
    this.player.hp = Math.min(this.player.maxHp, this.player.hp + (result.reward.heal ?? 0));
    if (result.correct) sfx.correct(); else sfx.wrong();
    if (!result.correct && result.penalty.slowMs) this.playerSlowUntil = this.engine.now + result.penalty.slowMs;
    if (result.action === 'bossDefeated') this.defeatBoss('quiz', result.bossId, this.run.encounters.active?.tier === 'mini' ? 'mini' : 'major');
    this.encounterPanel.show(this.run.encounters.active);
  }

  continueEncounter() {
    if (this.phase !== 'encounter') return;
    const response = finishEncounter(this.run.encounters);
    if (!response.ok) return;
    this.encounterPanel.hide(); this.input.keyboard.resetKeys();

    // 新手引导 · 答题反应在面板隐藏后才弹出，避免气泡与「继续前进」按钮的点击命中冲突。
    // QUIZ_FIRST_CORRECT / QUIZ_WRONG 均由 fireGuide 的 run.guideSeen 去重，整局各只出现一次。
    const correct = response.result.correct === true;
    fireGuide(this, this.run, correct ? 'QUIZ_FIRST_CORRECT' : 'QUIZ_WRONG', { act: this.chapter, stage: this.stage });

    // 标记事件点完成（小Boss门/NPC点），罗盘小地图不再显示
    const finishedId = response.result.encounterId;
    for (const point of this.eventPoints) if (point.id === finishedId) point.done = true;
    this.run.completedEvents[finishedId] = true;
    if (this.bossDefeated) { this.startBossClearTransition(); return; }
    if (response.result.action === 'bossBattle') {
      for (const enemy of this.enemies) if (!enemy.isBoss) enemy.destroy();
      this.enemies = this.enemies.filter(enemy => enemy.isBoss);
      this.releaseProjectiles();
      this.playBossIntro(this.run.encounters.history.at(-1)?.bossId);
      return;
    }
    this.phase = 'play'; this.paused = false; this.engine.paused = false;
    this.resumeFollow();
    this.player.invulnUntil = this.engine.now + 800;
    // 若浏览器在读题阶段失焦，关闭对话也不能悄悄恢复战斗。
    if (!document.hasFocus()) { this.focusPaused = true; this.openPause('focus'); }
  }

  defeatBoss(method, bossId, tier = 'major') {
    const receipt = resolveBossOnce(this.run, this.stage, bossId, method, tier);
    if (!receipt.ok) return;
    this.shardCount += receipt.reward; this.kills++;
    // Boss 战利品：问答定义给出法术卡进手牌 + 随机一个罗盘本体增益。
    // 这张卡只进手牌，不自动进技能库——技能库严格来自升级三选一玩家自己选的卡。
    const spellDefId = stageSpellCard(this.stage);
    const spellKey = cardKeyOf({ kind: 'sigil', defId: spellDefId, variant: rollVariant(this.combatRng, spellDefId) });
    this.run.hand[spellKey] = (this.run.hand[spellKey] ?? 0) + 1;
    const buff = rollBuffWeighted(COMPASS_BUFFS, () => this.combatRng.next(), this.run.kitAffinity);
    if (buff) {
      const level = metaLevel(this.metaSave, buff.id);
      const desc = applyPassiveToCompass(buff, this.run.compassBuffs, level);
      this.engine.comboWindowMul = this.run.compassBuffs.comboWindowMul;
      if (this.engine.combos) this.engine.combos.windowMul = this.engine.comboWindowMul;
      rebuildDerived(this.grid, ACTS[this.chapter - 1].baseIntervalMs * this.run.compassBuffs.intervalMul, { cooldownMul: this.run.compassBuffs.cooldownMul });
      appendPassive(this.run.passiveLog, 'compass', buff, level, desc);
      this.passiveCounts = countPassives(this.run.passiveLog);
      this.effects.text(240, 96, '罗盘增益 · ' + buff.name + metaPassiveLabel(level) + '：' + desc, HEX.teal, true);
    }
    this.cameras.main.flash(140, 255, 246, 224);
    sfx.bossShatter();
    if (tier !== 'mini') {
      this.bossDefeated = true;
      // 本场大 Boss 已清空：合并幕前半场换场，单场幕/末场通幕，第七场通关。
      this.stageOutcome = stageAdvanceDecision({ stage: this.stage, majorCleared: true });
    }
    this.bossStarted = false; // 复位：小Boss解决后，大Boss等级触发仍可生效
    this.hostileShots = []; this.hostileG.clear();
    this.summons = []; this.summonG?.clear(); this.summonAirG?.clear();
    if (this.boss) {
      const x = this.boss.x, y = this.boss.y;
      this.boss.alive = false; this.boss.rewarded = true; this.boss.destroy();
      this.effects.burst(x, y, C.arcane, 20);
      sfx.bossDown();
      this.enemies = this.enemies.filter(e => e !== this.boss);
    }
    // 小 Boss 打完不经过通幕，镜头立刻回到常规取景；大 Boss 由 startBossClearTransition 复位。
    if (tier === 'mini') { this.bossCamOffset = 0; this.resumeFollow(); }
  }

  resumeFollow(offsetY = 0) { return resumeFollowOf(this, offsetY); }

  startBossClearTransition() {
    if (this.phase === 'bossDefeated' || this.phase === 'intermission') return;
    this.phase = 'bossDefeated'; this.paused = true; this.engine.paused = true; this.transitionLeft = 800;
    // 还在飞的经验粒子立刻结算：过场里不该出现「差一点没捡到」的损失
    this.flushExpMotes();
    this.bossCamOffset = 0;
    this.resumeFollow();
    this.hostileShots = []; this.hostileG.clear();
    this.summons = []; this.summonG?.clear(); this.summonAirG?.clear();
    for (const enemy of this.enemies) enemy.destroy(); this.enemies = [];
    this.releaseProjectiles();
    // 通幕瞬间的余韵：白闪 + 杖尖余波，再交给过场接住
    this.cameras.main.flash(160, 255, 246, 224);
    shakeCamera(this, 'major', 120, 0.003);
    this.effects.burst(this.player.x, this.player.y, C.arcaneLight, 24);
    this.effects.text(240, 115, '契约解除 · Boss 已击败', HEX.arcaneLight, true);
  }

  addHostileShot(shot) {
    if (!shot || this.bossDefeated) return;
    const shots = Array.isArray(this.hostileShots) ? this.hostileShots : (this.hostileShots = []);
    // 上限 96（spec §5.1：64 → 96），超限直接丢弃新弹，不抢占场上已有的弹
    if (shots.length >= HOSTILE_LIMITS.shots) return;
    shots.push({ ...shot });
    sfx.enemyShot();
  }

  updateHostileShots(dt) {
    // 推进/命中/出界/寿命/上限全部在 hostile.js；这里只做受击结算与绘制。
    // 测试假场景可能没有 summons/summonG，此处不假设它们存在。
    const shots = Array.isArray(this.hostileShots) ? this.hostileShots : (this.hostileShots = []);
    const result = stepHostileShots(shots, {
      dtMs: dt,
      player: this.player,
      world: this.world,
      maxShots: HOSTILE_LIMITS.shots,
    });
    this.hostileShots = result.list;
    for (const hit of result.hits) {
      // 命中只走玩家 takeDamage（含 1400ms 无敌帧），命中反馈与旧版一致
      if (typeof this.player?.takeDamage !== 'function') continue;
      if (this.player.takeDamage(hit.damage, this.engine?.now ?? 0)) {
        this.effects?.hurt?.();
        this.effects?.impact?.(hit.x, hit.y, C.blood, true);
        sfx.hurt();
        // B5 硬控分流：只有 Boss 大招弹带 fromBoss，挂该场专属控制；
        // 普通弹（含阶段倍率放大后的）仍走全场统一的轻迟滞。
        // 不按 fromBoss 一刀切，是因为普通 Boss 弹若跳过 DEFAULT_SHOT_CONTROL
        // 又在场 1/2 拿不到 bossControlFor（那两场为 null），等于完全没有控制。
        if (hit.fromBoss === true) {
          const cfg = this.boss ? bossControlFor(this.stage) : null;
          if (cfg) this.applyPlayerControl(cfg, hit.x, hit.y, this.engine?.now ?? 0);
        } else {
          this.applyPlayerControl?.(DEFAULT_SHOT_CONTROL, hit.x, hit.y, this.engine?.now ?? 0);
        }
      }
    }
    const g = this.hostileG;
    if (!g) return;
    g.clear();
    for (const shot of this.hostileShots) drawHostileShot(g, shot);
  }

  // 可被法术选中的目标：敌人 + 召唤物。只传给 resolveSigilTrigger 的 enemies 参数；
  // 经验/碎片/尸爆/连斩等结算循环仍只看 this.enemies，召唤物永远不算击杀。
  combatTargets() {
    const enemies = Array.isArray(this.enemies) ? this.enemies : [];
    const summons = Array.isArray(this.summons) ? this.summons : [];
    return enemies.concat(summons);
  }

  // 敌方召唤物入场：全场上限 20、跨列表炮台 12 / 符文 8、同一 owner 同时 1 个。
  // 入列前 normalizeSummon 并分配负数 id（与敌人正 id 不冲突）；被拒绝时不产生任何表现。
  addEnemySummon(enemy, spec) {
    if (!spec || this.bossDefeated) return null;
    const list = Array.isArray(this.summons) ? this.summons : (this.summons = []);
    if (list.length >= HOSTILE_LIMITS.summons) return null;
    const kind = spec.kind === 'rune' ? 'rune' : 'turret';
    // owner 可能是数字 id 或字符串键（enemy-ai 两种都允许），只认非空值
    const hasOwner = (typeof spec.owner === 'string' && spec.owner.length > 0) || Number.isFinite(spec.owner);
    const owner = hasOwner ? spec.owner : (Number.isFinite(enemy?.id) ? enemy.id : -1);
    const cap = kind === 'rune' ? HOSTILE_LIMITS.rune : HOSTILE_LIMITS.turret;
    let sameKind = 0;
    let ownerBusy = false;
    for (const s of list) {
      if (!s || s.alive === false) continue;
      if (s.kind === kind) sameKind++;
      const sHasOwner = (typeof s.owner === 'string' && s.owner.length > 0) || Number.isFinite(s.owner);
      const sOwner = sHasOwner ? s.owner : -1;
      if (sOwner === owner) ownerBusy = true;
    }
    if (sameKind >= cap || ownerBusy) return null;
    // 炮台弹伤 = 召唤者伤害 ×0.6（hostile.js 明确不在这里打折，由场景侧折算一次）；
    // T2 若已在事件里给了折算后的 damage，就直接用，绝不二次乘。
    const fallbackDamage = Math.max(1, Math.round((enemy?.damage ?? enemy?.baseDamage ?? 6) * (kind === 'turret' ? 0.6 : 1)));
    const damage = Number.isFinite(spec.damage) && spec.damage > 0 ? spec.damage : fallbackDamage;
    this.summonsSeq = Number.isFinite(this.summonsSeq) ? this.summonsSeq : -1;
    const summon = normalizeSummon({
      ...spec,
      kind,
      owner,
      id: this.summonsSeq--,
      damage,
      def: {
        id: kind === 'rune' ? 'summon_rune' : 'summon_turret',
        color: spec.def?.color ?? (kind === 'rune' ? C.blood : C.arcane),
      },
      lastHitAmount: 0,
      lastBlocked: 0,
    });
    summon.lifeMax = summon.lifeMs;
    list.push(summon);
    this.effects?.summonPulse?.(summon.x, summon.y, kind, summon.def.color);
    sfx.summon();
    return summon;
  }

  // 召唤物每帧：先兜底清扫死亡（stepSummons 会静默丢弃 dead 项，不扫就丢表现），
  // 再推进（炮台弹并入 hostileShots、符文引信产出 detonations），最后单批绘制。
  updateSummons(dt) {
    this.sweepSummons();
    const summons = Array.isArray(this.summons) ? this.summons : (this.summons = []);
    const result = stepSummons(summons, {
      dtMs: dt,
      player: this.player,
      world: this.world,
      maxShots: HOSTILE_LIMITS.shots,
    });
    this.summons = result.list;
    for (const shot of result.shots) this.addHostileShot(shot);
    for (const det of result.detonations) this.detonateRune(det);
    this.drawSummons();
  }

  // 死亡扫描：applySigil 命中后 / 每帧推进前各兜底一次。
  // 召唤物死亡只做爆散表现，不给经验/碎片/掉落，也不进 collectDefeated。
  sweepSummons() {
    const list = this.summons;
    if (!Array.isArray(list) || !list.length) return 0;
    let removed = 0;
    for (let i = list.length - 1; i >= 0; i--) {
      const summon = list[i];
      if (summon && summon.alive !== false && summon.hp > 0) continue;
      if (summon) this.onSummonDestroyed(summon);
      list.splice(i, 1);
      removed++;
    }
    return removed;
  }

  onSummonDestroyed(summon) {
    if (!summon) return;
    const x = Number.isFinite(summon.x) ? summon.x : this.player.x;
    const y = Number.isFinite(summon.y) ? summon.y : this.player.y;
    const color = summon.def?.color ?? C.bone;
    this.effects?.deathScatter?.(x, y, color, { elite: false });
    this.effects?.burst?.(x, y, color, 6);
    sfx.dissipate();
  }

  // 符文引爆：半径内玩家吃伤害（走 takeDamage 尊重无敌帧）+ 向外 6 发环形弹 + 爆炸表现。
  detonateRune(det) {
    if (!det) return;
    const x = Number.isFinite(det.x) ? det.x : this.player.x;
    const y = Number.isFinite(det.y) ? det.y : this.player.y;
    const radius = Number.isFinite(det.radius) ? det.radius : 44;
    const damage = Number.isFinite(det.damage) && det.damage > 0 ? det.damage : 8;
    this.effects?.burst?.(x, y, C.blood, 14);
    this.effects?.impact?.(x, y, C.blood, true);
    if (this.player?.alive && typeof this.player.takeDamage === 'function') {
      const dist = Math.hypot(this.player.x - x, this.player.y - y);
      if (dist <= radius + (this.player.radius ?? 0)) {
        if (this.player.takeDamage(damage, this.engine?.now ?? 0)) {
          this.effects?.hurt?.();
          sfx.hurt();
        }
      }
    }
    const ringDamage = Math.max(1, Math.round(damage * 0.5));
    for (let i = 0; i < 6; i++) {
      if (this.hostileShots.length >= HOSTILE_LIMITS.shots) break;
      const a = (i / 6) * Math.PI * 2;
      this.hostileShots.push(makeShot({ x, y }, { x: Math.cos(a), y: Math.sin(a) }, {
        kind: 'bolt', speed: 90, damage: ringDamage, radius: 3, lifeMs: 5200,
      }));
    }
    sfx.enemyShot();
  }

  // 召唤物绘制（两层）：符文贴地画在 summonG（低于敌人），炮台悬浮画在 summonAirG
  // （高于敌人）。炮台悬停菱形环（now 推导上下浮动，确定性）/ 符文地面菱形 + 引信进度。
  drawSummons() {
    const ground = this.summonG;
    const air = this.summonAirG ?? this.summonG;
    if (!ground && !air) return;
    ground?.clear();
    if (air !== ground) air?.clear();
    // 符文与炮台都画在上层：符文在玩家脚下（会被玩家身体遮住一半），炮台在施法者头顶。
    // 若场景只提供了 summonG（测试假场景），退回同一张画布即可。
    const g = air ?? ground;
    const now = Number.isFinite(this.engine?.now) ? this.engine.now : 0;
    for (const s of this.summons ?? []) {
      if (!s || s.alive === false) continue;
      const x = Math.round(s.x);
      const y = Math.round(s.y);
      if (s.kind === 'rune') {
        const lifeMax = Number.isFinite(s.lifeMax) && s.lifeMax > 0 ? s.lifeMax : 1200;
        const progress = Math.max(0, Math.min(1, 1 - s.lifeMs / lifeMax));
        const gy = y + 5; // 视觉落点在脚前，逻辑判定仍在 (x, y)
        pxDiamond(g, x, gy, 6, C.outline, 0.9, false);
        pxDiamond(g, x, gy, 5, C.blood, 0.85, false);
        pxDiamond(g, x, gy, 2, C.bloodDark, 1, true);
        pxRing(g, x, gy, 10 - Math.round(6 * progress), C.blood, 0.6 + 0.4 * progress, 1);
        // 引信条：符头上方 9×1，随时间缩短；最后 300ms 闪白提示「马上炸」
        const flash = s.lifeMs < 300 && Math.floor(now / 80) % 2 === 0;
        pxRect(g, x - 5, gy - 10, 11, 1, C.void, 0.8);
        pxRect(g, x - 4, gy - 10, Math.max(1, Math.round(9 * (1 - progress))), 1, flash ? C.white : C.arcane, 1);
        continue;
      }
      const bob = Math.round(Math.sin((now + (s.id ?? 0) * 97) / 240) * 1.5);
      // 炮台画在施法者侧上方（视觉偏移 +14，逻辑位置不变），避免和施法者立绘糊成一团；
      // 地面投影留在视觉位置下方，读作「悬浮装置」。
      const sx = x + 14;
      const hy = y - 26 + bob;
      pxRect(g, sx - 5, y + 1, 11, 1, C.void, 0.45);
      pxRing(g, sx, hy, 7, C.arcane, 0.45, 1);
      pxDiamond(g, sx, hy, 4, C.outline, 0.95, false);
      pxDiamond(g, sx, hy, 3, C.arcane, 1, false);
      pxDiamond(g, sx, hy, 1, C.white, 1, true);
      // 两侧稳定翼 + 下垂天线 + 虚线锚索，读起来像「装置」而不是宝石
      pxRect(g, sx - 9, hy, 2, 3, C.arcaneLight, 0.85);
      pxRect(g, sx + 7, hy, 2, 3, C.arcaneLight, 0.85);
      pxRect(g, sx, hy + 4, 1, 3, C.arcaneLight, 0.9);
      for (let d = 10; d < 26; d += 5) pxRect(g, sx, y - d, 1, 1, C.arcane, 0.35);
    }
  }

  // 近战出手：扇形判定走 hostile.meleeHits（距离 ≤ range + 玩家半径、夹角 ≤ arc/2）。
  // 命中才 takeDamage（尊重无敌帧）；无论命中都出 slash + meleeSwing + 轻震屏。
  // 不走 applyDamage —— 那是敌人受伤的口径。
  onEnemyMelee(enemy, melee) {
    if (!melee || this.phase !== 'play' || !this.player?.alive) return false;
    const x = Number.isFinite(melee.x) ? melee.x : (enemy?.x ?? this.player.x);
    const y = Number.isFinite(melee.y) ? melee.y : (enemy?.y ?? this.player.y);
    const angle = Number.isFinite(melee.angle) ? melee.angle : 0;
    const range = Number.isFinite(melee.range) && melee.range > 0 ? melee.range : 24;
    const arc = Number.isFinite(melee.arc) && melee.arc > 0 ? melee.arc : Math.PI / 2;
    this.effects?.slash?.(x, y, angle, range, arc, enemy?.def?.color ?? C.blood);
    sfx.meleeSwing();
    if (!meleeHits(melee, this.player)) return false;
    if (typeof this.player.takeDamage !== 'function') return false;
    const damage = Number.isFinite(melee.damage) ? melee.damage : (enemy?.damage ?? 8);
    const dealt = this.player.takeDamage(damage, this.engine?.now ?? 0);
    if (dealt) {
      this.effects?.hurt?.();
      this.effects?.impact?.(this.player.x, this.player.y, C.blood, true);
      sfx.hurt();
      shakeCamera(this, 'hurt', 120, 0.004);
      this.applyEnemyControl?.(enemy, 'melee', this.engine?.now ?? 0);
    }
    return !!dealt;
  }

  checkDeath() {
    if (this.phase === 'play' && !this.player.alive) this.die();
  }

  die() {
    if (this.phase !== 'play') return;
    this.phase = 'dying';
    // 死亡：本局结束，清除断点存档；再战从第一幕重来。
    clearRun();
    this.paused = true;
    this.engine.paused = true;
    // 玩家死亡：清空敌方弹幕与召唤物（炮台/符文不再继续打）
    this.hostileShots = []; this.hostileG?.clear();
    this.summons = []; this.summonG?.clear(); this.summonAirG?.clear();
    this.pauseMenu.hide();
    this.board.setDetailVisible(false);
    this.pauseHint.setVisible(false);
    this.hint.setVisible(false);
    this.player.draw(this.engine.now); // 让玩家绘制成倒地状态
    this.effects.deathBurst(this.player.x, this.player.y);
    shakeCamera(this, 'major', 240, 0.006);
    const summary = this.buildSummary();
    this.time.delayedCall(1000, () => {
      // 死亡：先演魂火熄灭，再揭开结算页；合计约 2.1 秒，仍可按键跳过
      if (this.phase === 'dying') playCutscene(this, { kind: 'death', act: this.chapter, stage: this.stage, to: 'GameOverScene', payload: { ...summary, __cine: true }, report: summary });
    });
  }

  buildSummary() {
    const s = this.engine.summary(this.engine.now);
    return {
      elapsedMs: this.engine.now,
      chapter: this.chapter,
      stage: this.stage,
      hp: 0,
      kills: this.kills,
      shards: this.shardCount,
      triggers: s.triggers,
      triggersPerSec: s.triggersPerSec,
      combos: s.combos,
      blocked: s.blocked,
      reroutes: s.reroutes,
      dissipations: s.dissipations,
      peakRate: this.peakRate,
      cells: this.grid.unlockedIds().length,
      // 结算给局外成长用：首杀/问答击破的原始凭据。
      bossResolutions: structuredClone(this.run.bossResolutions ?? {}),
      miniBossResolutions: structuredClone(this.run.miniBossResolutions ?? {}),
      quick: this.quickMode,
    };
  }

  // 压测：真实实体类堆到 150 敌 / 300 弹丸 / 200 碎片，采样 20 秒帧时间
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

