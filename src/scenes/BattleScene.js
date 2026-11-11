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
import { SIGIL_DEFS, AUX_DEFS, RUNE_DEFS, resolveSigilTrigger, resolveComboBonus, resolveDeathBursts } from '../logic/effects.js';
import { createRun, recordAct } from '../logic/run.js';
import { createProgression, grantExp, levelStats, shouldTriggerMajorBoss, CHARACTER_BUFFS, COMPASS_BUFFS, rollBuff } from '../logic/progression.js';
import { getEventPoints, findTriggeredPoint } from '../data/map-events.js';
import { getEncounterById, getMinibossEncounters } from '../data/encounters.js';
import { Rng } from '../logic/rng.js';
import { CARD_POOL } from '../logic/workshop.js';
import { expNeeded } from '../logic/progression.js';
import { Pool } from '../logic/pool.js';
import { pickSpawnPoint, pickWavePoints, separateEnemiesBucketed } from '../logic/spawn.js';
import { getEncounterForAct } from '../data/encounters.js';
import { createEncounterState, openEncounter, selectChoice, confirmChoice, finishEncounter } from '../logic/encounters.js';
import { resolveBossOnce } from '../logic/boss.js';
import { loadMeta, metaLevel, applyPassiveToCharacter, applyPassiveToCompass, metaPassiveLabel } from '../logic/meta.js';
import Boss from '../entities/Boss.js';
import EncounterPanel from '../ui/EncounterPanel.js';
import {
  ACT1_CELLS, ACT1_SIGIL_BY_CELL, SIGILS, ENEMY_TYPES, SECTOR,
  COMBO_NAMES, difficultyAt, PLAYER, cardVisual, pickEnemyType,
} from '../data/roster.js';
import Background from '../ui/Background.js';
import SigilBoard, { cellCenter } from '../ui/SigilBoard.js';
import EffectsLayer from '../ui/EffectsLayer.js';
import Hud from '../ui/Hud.js';
import PauseMenu from '../ui/PauseMenu.js';
import Player from '../entities/Player.js';
import Enemy from '../entities/Enemy.js';
import Projectile from '../entities/Projectile.js';
import Shard from '../entities/Shard.js';
import ExpMote from '../entities/ExpMote.js';
import { C, HEX, addText, pxRect, pxFrame, pxLine, pxDiamond, applyPixelZoom, getRenderScale, uiLayerOffset, isPortrait, isTouchUI, CONSOLE_TOP, CANVAS_H_PORTRAIT } from '../ui/Palette.js';
import { kitPanel, kitBoard, kitBoardMotion, kitHeader, kitSteps, kitCell, kitHandRow, kitDetail, kitAction, clipText } from '../ui/editor-ui.js';
import { CARD_HINTS } from '../data/card-hints.js';
import { punchFor, shouldPunch, strikePunchFor } from '../ui/spell-punch.js';
import TouchControls from '../ui/TouchControls.js';
import { sfx, toggleSound } from '../audio/Sfx.js';
import { playCutscene, cutscenesDisabled } from '../ui/transition.js';

const BATTLE = { left: 10, right: 470, top: 26, bottom: 262 };
const FREQ_WINDOW_MS = 5000;
// 击杀经验折算：1 杀 1 点。这个常量保留成可调项——如果实机觉得升级三选一太频繁，
// 把它调到 2/3 即可整体降速，不需要改任何结算代码。
const KILL_EXP_PER_POINT = 1;

export default class BattleScene extends Phaser.Scene {
  constructor() {
    super('BattleScene');
  }

  create(data = {}) {
    applyPixelZoom(this);
    // 由过场进入时，过场负责揭开，战斗不再自己从黑场淡入
    this.__cine = !!data.__cine;
    const params = new URLSearchParams(window.location.search);
    this.run = data.run ?? createRun(params.get('seed') ?? ('sigil-' + Date.now()));
    this.act = this.run.act;
    this.quickMode = params.get('quick') === '1';
    // 成长状态：跨幕持久在 run 上
    this.run.progression ??= createProgression();
    this.run.compassBuffs ??= { damageMul: 1, intervalMul: 1, cooldownMul: 1, hitBonus: 0, comboWindowMul: 1, expMul: 1 };
    this.run.hand ??= {};
    this.run.completedEvents ??= {};
    this.run.majorBossActs ??= {};
    // 每幕的参考时长（仅用于调试/结算口径；通幕由大 Boss 决定，不按计时）。
    this.durationMs = this.quickMode ? 15000 : ([180000, 240000, 180000, 180000, 180000, 180000, 180000][this.act - 1] ?? 180000);
    this.combatRng = new Rng(this.run.seed + ':combat:' + this.act);
    this.debugParams = params;
    this.phase = 'play';
    this.stressRunning = false;
    this.pendingPicks = 0;
    this.timeExpTimer = 0;
    this.run.encounters ??= createEncounterState(this.run.seed);
    this.run.bossResolutions ??= {};
    // 局外成长档：只读，宝箱/罗盘抽到被动时按此档的等级加成。
    this.metaSave = loadMeta();
    this.playerSlowUntil = 0;
    this.boss = null;
    this.bossStarted = false;
    this.bossDefeated = false;
    this.hostileShots = [];
    this.transitionLeft = 0;
    this.paused = false;
    this.menuOpen = false;
    this.focusPaused = false;
    this.spaceHeld = false;

    this.enemies = [];
    this.projectiles = [];
    this.shards = [];
    this.kills = 0;
    this.shardCount = this.run.shards;
    this.peakRate = 0;
    this.recentRate = 0;
    this.freqBuckets = [0, 0, 0, 0, 0];
    this.freqStart = 0;
    this.spawnTimer = 900;
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

    // 在背景构造前刷新世界尺寸，避免同一个Scene跨幕复用上一幕的world。
    const world = WORLD_SIZES[this.act] ?? WORLD_SIZES[1];
    this.world = { w: world.w, h: world.h };

    // ---------- 视觉层 ----------
    this.background = new Background(this, this.act, this.world);
    this.effects = new EffectsLayer(this);
    this.hud = new Hud(this);
    // 暂停菜单的每一项都挂真实动作，鼠标点击与键盘快捷键走同一条路径
    this.pauseMenu = new PauseMenu(this, {
      resume: () => this.closePause(),
      restart: () => { if (this.menuOpen || this.editOpen) playCutscene(this, { kind: 'retry', to: 'BattleScene', payload: { run: this.run, __cine: true }, act: this.act }); },
      title: () => { if (this.menuOpen) playCutscene(this, { kind: 'return', to: 'TitleScene', payload: { __cine: true }, act: this.act }); },
      edit: () => { if (this.menuOpen && !this.editOpen) this.openGridEdit(); },
      mute: () => { if (this.menuOpen) this.onMute(); },
    });
    this.hostileG = this.add.graphics().setDepth(450);
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
    // 竖屏：镜头中心压低，让人物落在地图区中上部，下方留给触控台
    if (isPortrait()) this.cameras.main.setFollowOffset(0, 190);
    // 事件点（依赖世界尺寸，必须在 world 赋值之后）
    this.eventPoints = getEventPoints(this.act, this.world).map(p => ({ ...p, done: !!this.run.completedEvents[p.id], icon: null, label: null }));

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
    rebuildDerived(this.grid, ACTS[this.act - 1].baseIntervalMs * buffs.intervalMul, { cooldownMul: buffs.cooldownMul });
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
      seed: this.run.seed + ':signal:' + this.act,
      grid: this.grid,
      startCells: this.pickStartCells(),
      comboWindowMul: this.run.compassBuffs.comboWindowMul,
      combos: buildComboCatalog(['duo', 'line3', 'elbow3', 'ring4'])
        .map(inst => (inst.defId === 'duo' && this.tuning.duoBonus !== null
          ? { ...inst, bonus: this.tuning.duoBonus } : inst))
        .filter(inst => inst.order.every(id => this.grid.cells[id].unlocked && this.grid.cells[id].slot?.kind === 'sigil' && !this.grid.cells[id].mutedOutput)),
      onEvent: (type, data) => this.onEngineEvent(type, data),
    });
    this.engine.start();

    // ---------- 输入 ----------
    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys({
      up: 'W', down: 'S', left: 'A', right: 'D',
      space: 'SPACE', esc: 'ESC', restart: 'R', title: 'T', mute: 'M', edit: 'E',
    });
    this.input.keyboard.addCapture(['W', 'A', 'S', 'D', 'SPACE', 'ESC', 'R', 'T', 'M', 'UP', 'DOWN', 'LEFT', 'RIGHT']);
    this.input.keyboard.resetKeys();
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
      if (this.menuOpen) playCutscene(this, { kind: 'retry', to: 'BattleScene', payload: { run: this.run, __cine: true }, act: this.act });
    };
    this.onMute = () => {
      const on = toggleSound();
      this.effects.text(240, 150, on ? '音效已开启' : '音效已关闭', HEX.arcaneLight, true);
    };
    this.onTitle = () => {
      if (this.menuOpen) playCutscene(this, { kind: 'return', to: 'TitleScene', payload: { __cine: true }, act: this.act });
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
    this.mountUiLayer();

    if (!this.__cine) this.cameras.main.fadeIn(220, 0, 0, 0);

    // 调试：?pause=1 直接打开暂停菜单，便于截图验收
    if (params.get('pause') === '1') {
      this.time.delayedCall(650, () => this.openPause('debug'));
    }

    // 暴露给验收脚本：只读查看引擎状态
    this.bootCount = (this.bootCount ?? 0) + 1;
    window.__SIGILWEAVE_BATTLE__ = this;
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

  // 解析 URL 平衡对照参数：interval（秒）、starts（1-4）、duo（对偶倍率）
  readTuning(params) {
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

  pickStartCells() {
    const unlocked = this.grid.unlockedIds();
    const count = this.tuning?.starts ?? ACTS[this.act - 1].starts;
    const cells = [this.startCell];
    for (const id of unlocked) {
      if (cells.length >= count) break;
      if (!cells.includes(id)) cells.push(id);
    }
    return cells;
  }

  // ---------- 起点映射 ----------
  sampleStartCell() {
    // 玩家在战场中的归一化位置 -> 4×4 虚拟格坐标，再找最近的已解封格
    const normC = Phaser.Math.Clamp(Math.floor((this.player.x / this.world.w) * 4), 0, 3);
    const normR = Phaser.Math.Clamp(
      Math.floor((this.player.y / this.world.h) * 4), 0, 3,
    );
    const anchor = toId(normR, normC);
    let best = null;
    let bestDist = Infinity;
    for (const id of this.grid.unlockedIds()) {
      const d = manhattan(anchor, id);
      if (d < bestDist || (d === bestDist && (best === null || id < best))) {
        bestDist = d;
        best = id;
      }
    }
    return best === null ? ACT1_CELLS[0] : best;
  }

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
      this.engine.advance(dt);
      this.updatePlayer(dt);
      this.updateSpawner(dt);
      this.updateEnemies(dt);
      this.updateHostileShots(dt);
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
      if (this.transitionLeft <= 0) this.completeAct();
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
      act: this.act,
    });
  }

  updatePlayer(dt) {
    const { dx, dy } = this.readMoveAxis();
    const factor = this.engine.now < this.playerSlowUntil ? 0.75 : 1;
    this.player.update(dt * factor * (this.player.speedMult ?? 1), dx, dy, this.worldBounds, this.engine.now);
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
    const dif = difficultyAt(this.engine.now, this.act);
    const warming = this.engine.now < this.warmupMs;
    const room = dif.maxAlive - this.enemies.length;
    if (room <= 0) {
      // 满场：短暂停手等击杀腾位，避免每帧空转
      this.spawnTimer = 160;
      return;
    }
    const wave = warming ? 1 : Math.max(1, Math.min(dif.wave ?? 1, room));
    this.spawnWave(dif, wave);
    const jitter = 0.85 + this.combatRng.next() * 0.3;
    this.spawnTimer = Math.max(150, dif.spawnMs * jitter * (warming ? 2.2 : 1));
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
    for (const point of points) this.spawnEnemy(dif, point);
  }

  spawnEnemy(dif, point = null) {
    // 幸存者式：以玩家为中心、屏幕外环形生成；压测等调用方可直接传 dif 不传落点。
    const { x, y } = point ?? pickSpawnPoint({
      rng: () => this.combatRng.next(),
      player: this.player,
      world: this.world,
      enemies: this.enemies,
      minDist: 275, maxDist: 380, minGap: 30,
      nearDist: 250, farDist: 430,
    });
    // 按幕权重抽敌人类型；属性 = 难度基准 × 等级成长 × 敌种倍率
    const def = pickEnemyType(this.act, this.combatRng.next());
    const lv = levelStats(this.run.progression.level);
    this.enemies.push(new Enemy(
      this,
      def,
      x, y,
      { x: this.player.x, y: this.player.y }, // 出生瞬间锁定，之后直线推进
      Math.max(1, Math.round(dif.hp * (def.hpMul ?? 1) * lv.hpMul)),
      dif.speed * (def.speedMul ?? 1) * lv.speedMul,
      Math.round((def.damage ?? dif.damage) * lv.damageMul),
      this.enemySeq++,
    ));
  }

  updateEnemies(dt) {
    // 逐帧轻量分离：同屏已经到 60~90，旧版「>48 只就跳过」会直接叠成一坨；
    // 改用空间分桶 O(n·k) 版本，压测灌到 150 只也不会退化成 O(n²)。
    if (this.enemies.length > 1) {
      separateEnemiesBucketed(this.enemies, { gap: 20, player: this.player, contactDist: 26 });
    }
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (!e.alive) {
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
        e.destroy();
        this.enemies.splice(i, 1);
        continue;
      }
      if (this.player.alive) {
        const d = Math.hypot(e.x - this.player.x, e.y - this.player.y);
        if (d < e.radius + this.player.radius) {
          const hit = this.player.takeDamage(e.damage, this.engine.now);
          if (hit) {
            this.effects.hurt();
            this.effects.impact(e.x, e.y, C.blood, true);
            this.cameras.main.shake(90, 0.004);
          }
          if (e.isBoss) continue; // Boss 接触不会像杂兵一样自行碎掉。
          // 碰到玩家就碎掉，避免贴脸反复扣血
          this.effects.burst(e.x, e.y, C.bone, 7);
          e.alive = false;
          e.destroy();
          this.enemies.splice(i, 1);
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
  viewRect() {
    const v = this.cameras?.main?.worldView;
    if (v && Number.isFinite(v.x) && Number.isFinite(v.y) && v.width > 0 && v.height > 0) {
      return { x: v.x, y: v.y, w: v.width, h: v.height };
    }
    return { x: this.player.x - 240, y: this.player.y - 135, w: 480, h: 270 };
  }

  combatState() {
    return {
      player: this.player, oath: this.grid.oath, now: this.engine.now,
      buffMul: this.run.compassBuffs.damageMul, hitBonus: this.run.compassBuffs.hitBonus,
      view: this.viewRect(),
    };
  }

  applySigil(cellId, defId, aimPoint, impactAngle = null) {
    // 防御：没有格号的弹丸（调试/压测里手工造出来的）不能把整局打崩
    const cell = this.grid.cells[cellId];
    if (!cell) {
      return { hits: 0, damage: 0, aim: null, empty: true, targets: [], sacrificeSpent: 0, sacrificeApplied: false };
    }
    // 清掉上一轮的伤害读数：applyDamage 会把这一下真实扣血写回 enemy.lastHitAmount
    for (const e of this.enemies) e.lastHitAmount = 0;
    const view = this.viewRect();
    const result = resolveSigilTrigger({ grid: this.grid, cellId, defId, state: this.combatState(), enemies: this.enemies, aimPoint, view });
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

  // 精英践踏：圈内玩家受击（带无敌帧，不会连续吃满）
  onEnemyStomp(enemy, stomp) {
    if (!stomp || this.phase !== 'play' || !this.player.alive) return;
    const d = Math.hypot(this.player.x - stomp.x, this.player.y - stomp.y);
    if (d <= (stomp.radius ?? 26) + this.player.radius) {
      if (this.player.takeDamage(stomp.damage ?? 8, this.engine.now)) {
        this.effects.hurt();
        this.effects.impact(this.player.x, this.player.y, C.blood, true);
        this.cameras.main.shake(120, 0.005);
        sfx.hurt();
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
    // 命中方向 = 弹道方向，供受击后坐使用（比用落点差值更稳，落点常常就在目标身上）
    const result = this.applySigil(p.cellId, p.def.id, { x: p.tx, y: p.ty }, impactAngle);
    const def = SIGIL_DEFS[p.def.id];
    const radius = Number.isFinite(def?.radius) ? def.radius
      : p.def.id === 'meteor_judgment' ? 95
        : p.def.id === 'quake_maw' ? 80
          : p.def.id === 'starfall' ? 70
            : 14;
    this.effects.spellImpact(p.def.id, p.tx, p.ty, radius, impactAngle);
    this.spellPunch(p.def.id, p.tx, p.ty, radius, impactAngle);
    this.spellLinkFx(p.def.id, p, result);
    if (!result.hits) this.effects.impact(p.x, p.y, p.def.color, true);
  }

  // 命中重量：按法术分级震屏，重击额外给短顿帧。同法术 gapMs 内只吃一次，
  // 否则一刀扫 3 只会把震屏叠成连续抖动，反而糊。
  spellPunch(defId, x = 0, y = 0, radius = 90, angle = 0) {
    // 演出级（陨星裁决 / 地裂之颚）：走多段演出 + 高一级的震屏/顿帧，不再叠加普通 punch
    const strike = strikePunchFor(defId);
    if (strike) {
      this.spellStrikeSequence(defId, x, y, radius, angle);
      return;
    }
    if (!shouldPunch(defId, this.engine.now, this.lastPunchAt)) return;
    const spec = punchFor(defId);
    this.lastPunchAt = this.engine.now;
    this.cameras.main.shake(spec.ms, spec.amp);
    if (spec.stopMs > 0) this.hitstopLeft = Math.max(this.hitstopLeft, spec.stopMs);
  }

  // 高级法术演出：多段特效层 + 暗角收缩 + （陨星）一帧白闪 + 强震屏 + 顿帧
  spellStrikeSequence(defId, x, y, radius, angle) {
    const spec = strikePunchFor(defId);
    if (!spec) return;
    this.effects.spellStrike(defId, x, y, radius, angle);
    this.effects.vignette(defId === 'meteor_judgment' ? 1 : 0.8, 520);
    if (defId === 'meteor_judgment') this.cameras.main.flash(80, 255, 246, 224);
    this.lastPunchAt = this.engine.now;
    this.cameras.main.shake(spec.ms, spec.amp);
    if (spec.stopMs > 0) this.hitstopLeft = Math.max(this.hitstopLeft, spec.stopMs);
  }

  // 法术的「连接关系」表现：连锁逐跳电弧、贯穿光柱、回声对侧、噬魂/汲取的丝线
  spellLinkFx(defId, p, result) {
    const targets = result.targets ?? [];
    if (!targets.length) return;
    if (defId === 'chain_lightning') {
      let prev = { x: this.player.x, y: this.player.y };
      targets.forEach((t, i) => { this.effects.spellLink(defId, prev, t, i); prev = t; });
    } else if (defId === 'pierce_lance') {
      this.effects.spellLink(defId, this.player, targets[targets.length - 1], 0);
    } else if (defId === 'echo_sigil') {
      for (const t of targets) this.effects.spellLink(defId, this.player, t, 0);
    } else if (defId === 'soul_lance' || defId === 'mana_siphon') {
      for (const t of targets) this.effects.spellLink(defId, t, this.player, 0);
    }
  }

  // ---------- 暂停编辑法阵（保留冷却；战斗实时不可改，暂停可改） ----------
  openGridEdit() {
    if (this.editOpen) return;
    this.editOpen = true;
    this.editSelected = null;
    this.editAuxPending = null;
    this.editFocus = null;
    this.editNote = '1 点右侧手牌 → 2 点左侧空符位 → 3 点完成；点已放置的卡可收回。';
    this.pauseMenu.hide();
    this.editHandPage = 0;
    this.editDraft = draftFromGrid(this.grid, { act: this.act });
    this.editHand = { ...this.run.hand };
    this.editUI = this.add.container(0, 0).setDepth(3500).setScrollFactor(0);
    this.uiRoot?.add(this.editUI);
    this.editPointer = (pointer) => {
      // 指针给的是游戏像素（= 逻辑坐标 × 倍率），命中区是逻辑坐标，必须先折算
      const scale = getRenderScale();
      const lx = pointer.x / scale, ly = pointer.y / scale;
      const hit = this.editRects?.find(r => lx >= r.x && lx <= r.x + r.w && ly >= r.y && ly <= r.y + r.h);
      if (hit) hit.action();
    };
    this.input.on('pointerdown', this.editPointer);
    // 悬停高亮独立成层（与幕间同一套交互语言）：移上去亮框 + 手型光标
    // 屏幕固定元素必须挂 uiRoot（场景根上的 scrollFactor-0 会被镜头位移甩出屏幕）
    this.editHoverG = this.add.graphics().setDepth(5001).setScrollFactor(0);
    this.uiRoot?.add(this.editHoverG);
    // 法阵盘动态层：在静态 UI 之上、悬停层之下，约 30fps 重绘
    this.editAnimG = this.add.graphics().setDepth(5000).setScrollFactor(0);
    this.uiRoot?.add(this.editAnimG);
    this.editAnimAcc = 0;
    this.editAnimFrames = 0;
    this.editHoverMove = (pointer) => {
      if (!this.editOpen) return;
      const scale = getRenderScale();
      const lx = pointer.x / scale, ly = pointer.y / scale;
      const hit = this.editRects?.find(r => lx >= r.x && lx <= r.x + r.w && ly >= r.y && ly <= r.y + r.h);
      const hg = this.editHoverG;
      hg.clear();
      if (hit) {
        pxRect(hg, hit.x, hit.y, hit.w, hit.h, C.stone, 0.35);
        pxFrame(hg, hit.x, hit.y, hit.w, hit.h, C.brassLight, 1, 0.85);
        this.game.canvas.style.cursor = 'pointer';
      } else if (this.game.canvas.style.cursor !== '') {
        this.game.canvas.style.cursor = '';
      }
    };
    this.input.on('pointermove', this.editHoverMove);
    this.drawGridEdit();
  }

  editNames() { return { ...SIGIL_DEFS, ...AUX_DEFS, ...RUNE_DEFS }; }

  // 暂停改阵期间约 30fps 重绘动态层；编辑关闭时根本不进这里
  tickEditBoardMotion(time, delta) {
    if (!this.editAnimG || !this.editDraft) return;
    this.editAnimAcc = (this.editAnimAcc ?? 0) + delta;
    if (this.editAnimAcc < 33) return;
    this.editAnimAcc = 0;
    this.editAnimFrames = (this.editAnimFrames ?? 0) + 1;
    const draft = this.editDraft;
    kitBoardMotion(this.editAnimG, {
      panel: { x: 10, y: 42, w: 224, h: 210 },
      cells: { x0: 14, y0: 56, cw: 51, ch: 26, gapX: 3, gapY: 3 },
      t: time,
      focusId: this.editFocus,
      selecting: !!this.editSelected,
      unlocked: draft.unlocked ?? [],
      slots: Object.entries(draft.slots ?? {}).map(([id, slot]) => ({ id: +id, slot })),
    });
  }

  editHint(defId) { return CARD_HINTS[defId] ?? ''; }

  drawGridEdit() {
    if (this.editUI) { this.editUI.destroy(true); this.editUI = null; }
    this.editHoverG?.clear();
    const ui = this.add.container(0, 0).setDepth(3500).setScrollFactor(0);
    this.uiRoot?.add(ui);
    // 容器内按插入序渲染：editUI 每次重建都会压住悬停层，必须重新带到最顶
    this.uiRoot?.bringToTop(this.editAnimG);
    this.uiRoot?.bringToTop(this.editHoverG);
    this.editUI = ui;
    this.editRects = [];
    this.editAnimG?.clear();
    const g = this.add.graphics();
    ui.add(g);
    const text = (x, y, s, size = 8, color = HEX.parchment, extra = {}) => {
      const t = addText(this, x, y, s, size, color, extra);
      ui.add(t);
      return t;
    };
    const names = this.editNames();
    const draft = this.editDraft;

    // 背景：与幕间同一套双层外框 + 硬边竖纹
    pxRect(g, 0, 0, 480, 270, C.void);
    for (let x = 0; x < 480; x += 24) pxRect(g, x, 0, 12, 270, C.ink, 0.22);
    pxFrame(g, 6, 6, 468, 258, C.brassDark, 2, 1);
    pxFrame(g, 9, 9, 462, 252, C.brass, 1, 0.18);

    kitHeader(g, text, {
      x: 10, y: 10, w: 460,
      title: '法阵编辑',
      subtitle: '暂停中 · 冷却保留',
      rightLabel: '碎片', rightValue: this.shardCount, rightColor: HEX.teal,
    });

    const unlocked = draft.unlocked ?? [];
    const emptyCount = unlocked.filter(id => !draft.slots?.[id]).length;
    kitSteps(g, text, 10, 27, 460, {
      active: this.editAuxPending !== null ? 2 : this.editSelected ? 1 : 0,
      right: unlocked.length + ' 格 · ' + emptyCount + ' 空位',
      rightColor: HEX.brass,
    });

    // 左：4×4 法阵
    kitPanel(g, 10, 42, 224, 210);
    kitBoard(g, {
      panel: { x: 10, y: 42, w: 224, h: 210 },
      cells: { x0: 14, y0: 56, cw: 51, ch: 26, gapX: 3, gapY: 3 },
    });
    // 小标题两侧的刻线与菱形，让「符位 · 4×4」像一块铭牌
    pxDiamond(g, 13, 49, 2, C.brass, 0.8, true);
    pxLine(g, 78, 49, 222, 49, C.brassDark, 0.5, 1);
    pxDiamond(g, 225, 49, 2, C.brass, 0.7, false);
    text(18, 45, '符位 · 4×4', 7, HEX.brass);
    const auxNeighbors = this.editAuxPending !== null
      ? new Set(neighborsOf(this.editAuxPending, ORTHO_DIRS).map(n => n.id))
      : null;
    for (let id = 0; id < 16; id++) {
      const rect = { x: 14 + (id % 4) * 54, y: 56 + Math.floor(id / 4) * 29, w: 51, h: 26 };
      const slot = draft.slots?.[id];
      kitCell(g, text, id, rect, {
        unlocked: unlocked.includes(id),
        slot,
        focus: this.editFocus,
        auxSrc: this.editAuxPending === id ? id : null,
        auxValid: !!auxNeighbors?.has(id) && slot?.kind === 'sigil',
        selecting: !!this.editSelected,
        target: draft.auxTargets?.[id],
        runes: (draft.runes?.[id] ?? []).filter(Boolean).length,
        exits: (draft.exits?.[id] ?? ['up', 'down', 'left', 'right']).length,
        exitList: draft.exits?.[id] ?? ['up', 'down', 'left', 'right'],
      });
      this.editRects.push({ ...rect, action: () => this.editCellClick(id) });
    }

    // 左下：待放置卡 / 当前符位详情 / 操作指引三选一
    const selDef = this.editSelected ? this.editSelected.split(':')[1] : null;
    if (selDef) {
      const visual = cardVisual({ kind: this.editSelected.split(':')[0], defId: selDef });
      kitDetail(g, text, { x: 10, y: 174, w: 224, h: 74 }, {
        title: '待放置 · 点左侧空符位', accent: C.brassLight, icon: visual.glyph,
        lines: [
          { text: (names[selDef]?.name ?? selDef) + ' ×' + (this.editHand[this.editSelected] ?? 0), color: HEX.arcaneLight, size: 8 },
          { text: this.editHint(selDef), color: HEX.mute, size: 7, max: 28 },
          { text: '放置后点「完成」才会生效', color: HEX.teal, size: 7 },
        ],
      });
    } else if (this.editFocus !== null) {
      const id = this.editFocus;
      const slot = draft.slots?.[id];
      const cell = this.grid.cells[id];
      const visual = slot ? cardVisual(slot) : null;
      const runeText = (draft.runes?.[id] ?? []).filter(Boolean).map(r => names[r]?.name ?? r).join(' / ') || '无';
      const exitText = (draft.exits?.[id] ?? ['up', 'down', 'left', 'right'])
        .map(d => ({ up: '上', down: '下', left: '左', right: '右' })[d]).join('') || '无';
      const tgt = draft.auxTargets?.[id];
      kitDetail(g, text, { x: 10, y: 174, w: 224, h: 74 }, {
        title: '符位详情 · ' + (id + 1) + ' 号',
        accent: slot?.kind === 'auxiliary' ? C.teal : C.arcane,
        icon: visual?.glyph ?? null,
        lines: [
          { text: slot ? (names[slot.defId]?.name ?? slot.defId) : (unlocked.includes(id) ? '空符位' : '未解封'), color: HEX.parchment, size: 8 },
          { text: '间隔 ' + (cell.effIntervalMs / 1000).toFixed(2) + 's / 冷却 ' + (cell.effCooldownMs / 1000).toFixed(2) + 's', color: HEX.mute, size: 7 },
          { text: '铭文 ' + runeText + ' · 出口 ' + exitText + (tgt !== undefined ? ' · 目标 ' + (tgt + 1) + '号' : ''), color: HEX.mute, size: 7, max: 28 },
        ],
      });
    } else {
      kitDetail(g, text, { x: 10, y: 174, w: 224, h: 74 }, {
        title: '操作指引',
        lines: [
          { text: '① 点右侧手牌选一张', color: HEX.arcaneLight, size: 8 },
          { text: '② 点左侧空符位放下', color: HEX.arcaneLight, size: 8 },
          { text: '③ 点已放置的卡可收回', color: HEX.arcaneLight, size: 8 },
        ],
      });
    }

    // 右：手牌
    const hand = Object.entries(this.editHand).filter(([, count]) => count > 0);
    const lastPage = Math.max(0, Math.ceil(hand.length / 5) - 1);
    this.editHandPage = Math.min(this.editHandPage, lastPage);
    kitPanel(g, 240, 42, 230, 120);
    text(245, 45, this.editSelected ? '已选 · 点空符位放置' : '手牌 · 点选一张', 7, this.editSelected ? HEX.teal : HEX.brass);
    text(465, 45, hand.reduce((a, [, c]) => a + c, 0) + ' 张', 7, HEX.mute).setOrigin(1, 0);
    let row = 0;
    for (const [key, count] of hand.slice(this.editHandPage * 5, this.editHandPage * 5 + 5)) {
      const defId = key.split(':')[1];
      const rect = { x: 244, y: 57 + row * 17, w: 216, h: 15 };
      const isSel = this.editSelected === key;
      kitHandRow(g, text, rect, {
        defId, kind: key.split(':')[0], count,
        hint: this.editHint(defId),
        selected: isSel,
      });
      this.editRects.push({ ...rect, action: () => {
        this.editSelected = isSel ? null : key;
        this.editAuxPending = null;
        this.editNote = this.editSelected
          ? '已选 ' + (names[defId]?.name ?? defId) + '：点左侧空符位放置'
          : '已取消选择';
        this.drawGridEdit();
      } });
      row++;
    }
    if (!row) text(248, 62, '暂时没有手牌，先打完一波再说。', 7, HEX.mute);
    if (lastPage > 0) {
      const p = { x: 244, y: 144, w: 216, h: 14 };
      pxRect(g, p.x, p.y, p.w, p.h, C.nightDeep, 0.9);
      pxFrame(g, p.x, p.y, p.w, p.h, C.stoneLight, 1, 0.7);
      text(352, p.y + 3, '◀ ' + (this.editHandPage + 1) + ' / ' + (lastPage + 1) + ' ▶', 7, HEX.teal).setOrigin(0.5, 0);
      this.editRects.push({ x: p.x, y: p.y, w: p.w / 2, h: p.h, action: () => {
        this.editHandPage = (this.editHandPage - 1 + lastPage + 1) % (lastPage + 1); this.drawGridEdit();
      } });
      this.editRects.push({ x: p.x + p.w / 2, y: p.y, w: p.w / 2, h: p.h, action: () => {
        this.editHandPage = (this.editHandPage + 1) % (lastPage + 1); this.drawGridEdit();
      } });
    }

    // 右下：卡片详情 / 操作提示
    kitDetail(g, text, { x: 240, y: 166, w: 230, h: 52 }, {
      title: this.editSelected ? '待放置卡' : '操作提示',
      accent: this.editSelected ? C.brassLight : C.stoneLight,
      lines: this.editSelected
        ? [
            { text: (names[selDef]?.name ?? selDef) + ' ×' + (this.editHand[this.editSelected] ?? 0), color: HEX.arcaneLight, size: 8 },
            { text: this.editHint(selDef), color: HEX.mute, size: 7, max: 30 },
            { text: '点空符位放下；点已放的卡替换', color: HEX.teal, size: 7 },
          ]
        : [
            { text: '先点手牌，再点符位。', color: HEX.arcaneLight, size: 8 },
            { text: '辅助卡放下后还要点相邻输出格。', color: HEX.mute, size: 7, max: 30 },
            { text: '改阵不会重置冷却。', color: HEX.mute, size: 7 },
          ],
    });

    // 校验状态 + 完成按钮 + 底部提示
    const errors = validateDraft(this.editDraft);
    const errText = errors.length ? explainBuildErrors(errors, this.editDraft) : '校验通过 · 可完成';
    text(244, 222, clipText(errText, 32), 7, errors.length ? HEX.blood : HEX.teal);
    const doneRect = { x: 240, y: 234, w: 230, h: 18 };
    kitAction(g, text, doneRect, '完成 · 返回暂停', { primary: errors.length === 0 });
    this.editRects.push({ ...doneRect, done: true, action: () => this.closeGridEdit() });
    text(10, 256, clipText(this.editNote || 'E / Esc 关闭 · 改阵在点完成后生效', 44), 7, HEX.arcaneLight);
  }

  editCellClick(id) {
    this.editFocus = id;
    const draft = this.editDraft;
    const names = this.editNames();
    const selKey = this.editSelected;
    if (!draft.unlocked?.includes(id)) {
      this.editNote = (id + 1) + ' 号尚未解封，不能放置';
      this.drawGridEdit();
      return;
    }
    // 选牌优先于绑定：等待目标期间如果玩家选了一张牌，他要能先改牌面（比如把符印补回去），
    // 否则「目标失效 → 进入绑定模式 → 却放不了牌」会把局面卡死。
    if (selKey) {
      const [kind, defId] = selKey.split(':');
      const card = { kind, defId };
      const old = draft.slots?.[id];
      // 收回原卡到手的副本
      if (old) { const k = old.kind + ':' + old.defId; this.editHand[k] = (this.editHand[k] ?? 0) + 1; }
      this.editHand[selKey]--;
      if (this.editHand[selKey] <= 0) delete this.editHand[selKey];
      draft.slots ??= {};
      draft.slots[id] = card;
      // 指向该格的辅助目标随之失效
      for (const [src, tgt] of Object.entries(draft.auxTargets ?? {})) if (src === String(id) || (tgt === id && kind !== 'sigil')) delete draft.auxTargets[src];
      this.editSelected = null;
      this.editNote = '已放置 ' + (names[defId]?.name ?? defId);
      if (kind === 'auxiliary' && AUX_TARGETED.has(defId) && auxTargetCandidates(this.editDraft, id).length) {
        this.editAuxPending = id;
        this.editNote = '点相邻输出格绑定目标';
      } else if (kind === 'auxiliary' && AUX_TARGETED.has(defId)) {
        this.editNote = (id + 1) + ' 号「' + (names[defId]?.name ?? defId) + '」相邻没有符印可指向，请收回或换个位置';
        this.syncAuxPending();
      } else {
        this.syncAuxPending();
      }
      this.drawGridEdit(); return;
    }
    // 绑定模式：辅助等待目标。这里必须当场校验，
    // 否则随便点一格也会被记成目标，等到点「完成」才报 aux_target_invalid。
    if (this.editAuxPending !== null) {
      const src = this.editAuxPending;
      // 再点一次自己 = 取消绑定，避免「相邻根本没有符印」时被挂在绑定模式里出不来
      if (id === src) {
        this.editAuxPending = null;
        this.editNote = '已取消绑定。这张辅助没目标就不能完成，建议收回或换个位置。';
        this.drawGridEdit(); return;
      }
      const adjacent = neighborsOf(src, ORTHO_DIRS).some(n => n.id === id);
      const slot = draft.slots?.[id];
      if (!adjacent || slot?.kind !== 'sigil') {
        this.editNote = (src + 1) + ' 号的作用目标必须是「相邻且装着符印」的格子';
        this.drawGridEdit(); return;
      }
      draft.auxTargets ??= {};
      draft.auxTargets[src] = id;
      this.editAuxPending = null;
      this.editNote = '目标已绑定：' + (id + 1) + ' 号符印';
      this.drawGridEdit(); return;
    }
    // 无选择：收回该格卡牌
    const old = draft.slots?.[id];
    if (!old) { this.editNote = (id + 1) + ' 号是空格'; this.drawGridEdit(); return; }
    const k = old.kind + ':' + old.defId;
    this.editHand[k] = (this.editHand[k] ?? 0) + 1;
    delete draft.slots[id];
    for (const [src, tgt] of Object.entries(draft.auxTargets ?? {})) if (tgt === id || src === String(id)) delete draft.auxTargets[src];
    this.editNote = '已收回 ' + (names[old.defId]?.name ?? old.defId);
    this.syncAuxPending();
    this.drawGridEdit();
  }

  // 改卡/收卡会连带把别的指向型辅助的目标弄失效（例如把它作用的那格符印换掉）。
  // 这种情况不能等玩家点「完成」才报错——直接切进那一格的绑定模式，把人带过去。
  syncAuxPending() {
    const missing = missingAuxTargets(this.editDraft);
    const names = this.editNames();
    if (!missing.length) { this.editAuxPending = null; return false; }
    // 优先保留玩家原本在绑的那一格
    const id = missing.includes(this.editAuxPending) ? this.editAuxPending : missing[0];
    const slot = this.editDraft.slots?.[id];
    this.editSelected = null;
    const cardName = names[slot?.defId]?.name ?? slot?.defId ?? '辅助';
    if (!auxTargetCandidates(this.editDraft, id).length) {
      // 没有可指向的邻居：进绑定模式等于把玩家挂死，只提示并保留目标失效状态
      this.editAuxPending = null;
      this.editNote = (id + 1) + ' 号「' + cardName + '」没有可指向的相邻符印，请收回或换个位置';
      return true;
    }
    this.editAuxPending = id;
    this.editNote = (id + 1) + ' 号「' + cardName + '」的目标失效了：点一个相邻符印重新绑定';
    return true;
  }

  closeGridEdit() {
    const errors = validateDraft(this.editDraft);
    if (errors.length) {
      // 指向型辅助缺目标是最常见的一种：与其甩错误码，不如把玩家送到那一格去绑
      if (!this.syncAuxPending()) this.editNote = '未通过校验：' + explainBuildErrors(errors, this.editDraft);
      this.drawGridEdit();
      return;
    }
    const preserve = { cells: this.grid.cells.map(c => ({ id: c.id, cooldownUntil: c.cooldownUntil })) };
    const result = applyDraft(this.grid, this.editDraft, { phase: 'intermission', preserveFrom: preserve });
    if (!result.ok) { this.editNote = '校验失败'; this.drawGridEdit(); return; }
    this.run.draft = result.snapshot;
    this.run.hand = { ...this.editHand };
    // 罗盘乘算在改阵后重放
    rebuildDerived(this.grid, ACTS[this.act - 1].baseIntervalMs * this.run.compassBuffs.intervalMul, { cooldownMul: this.run.compassBuffs.cooldownMul });
    this.engine.setCombos(buildComboCatalog(['duo', 'line3', 'elbow3', 'ring4']).filter(inst => inst.order.every(id => this.grid.cells[id].unlocked && this.grid.cells[id].slot?.kind === 'sigil' && !this.grid.cells[id].mutedOutput)));
    this.editOpen = false;
    if (this.editPointer) { this.input.off('pointerdown', this.editPointer); this.editPointer = null; }
    if (this.editHoverMove) { this.input.off('pointermove', this.editHoverMove); this.editHoverMove = null; }
    this.editHoverG?.destroy(true); this.editHoverG = null;
    this.editAnimG?.destroy(true); this.editAnimG = null;
    this.editAnimAcc = 0;
    this.game.canvas.style.cursor = '';
    this.editUI?.destroy(true); this.editUI = null;
    this.openPause('menu');
  }

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
    this.cameras.main.shake(mini ? 150 : 320, 0.005);
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
    const pool = [...CARD_POOL];
    const picks = [];
    while (picks.length < 3 && pool.length) picks.push(pool.splice(Math.floor(this.combatRng.next() * pool.length), 1)[0]);
    const names = { ...SIGIL_DEFS, ...AUX_DEFS };
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
      this.levelupUI.add(addText(this, x + 54, 108, names[card.defId]?.name ?? card.defId, 9, card.kind === 'auxiliary' ? HEX.teal : HEX.parchment).setOrigin(0.5, 0));
      this.levelupUI.add(addText(this, x + 54, 126, card.kind === 'auxiliary' ? '辅助' : '符印', 7, HEX.mute).setOrigin(0.5, 0));
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

  pickLevelupCard(card) {
    if (this.phase !== 'levelup' || !card) return;
    const key = card.kind + ':' + card.defId;
    this.run.hand[key] = (this.run.hand[key] ?? 0) + 1;
    if (this.levelupHandler) { this.input.off('pointerdown', this.levelupHandler); this.levelupHandler = null; }
    for (const key of ['ONE', 'TWO', 'THREE']) this.input.keyboard?.off('keydown-' + key);
    this.levelupUI?.destroy(true); this.levelupUI = null;
    this.levelupRects = null;
    this.pendingPicks--;
    sfx.correct();
    this.effects.text(240, 150, '已入手 ' + key.split(':')[1], HEX.teal, true);
    if (this.pendingPicks > 0) this.openLevelupPick();
    else { this.phase = 'play'; this.paused = false; this.engine.paused = false; }
  }

  spawnChest(x, y) {
    this.chests.push({ x, y, g: null, opened: false });
  }

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
        const buff = rollBuff(CHARACTER_BUFFS, () => this.combatRng.next());
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
          this.effects.text(this.player.x, this.player.y - 14, '宝箱 · ' + buff.name + metaPassiveLabel(level) + '：' + desc, HEX.brassLight, true);
        }
        sfx.pick();
        chest.g.destroy();
        this.chests.splice(i, 1);
      }
    }
  }

  // Boss被解决后才通幕；计时结束仅开启前置问答。
  completeAct() {
    if (this.phase !== 'bossDefeated' || !this.bossDefeated) return;
    this.phase = 'intermission'; this.paused = true; this.engine.paused = true;
    const report = { ...this.engine.summary(this.engine.now), elapsedMs: this.engine.now, kills: this.kills, peakRate: this.peakRate };
    recordAct(this.run, report);
    this.run.shards = this.shardCount;
    this.run.draft = snapshotBuild(this.grid, { act: this.act });
    if (this.act < 7) {
      this.run.act++;
      // 通关一幕：先播「契约解除」标题卡与本幕数据，再落到幕间工作台
      playCutscene(this, {
        kind: 'clear', act: this.act, report, to: 'IntermissionScene',
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
        kind: 'victory', act: this.act, report: totals, to: 'StoryScene',
        payload: { mode: 'ending', stats: victoryPayload, __cine: true },
      });
    }
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
    // 碎片：密度 ×10 后按概率掉（精英必掉 4 颗），避免工作台经济被瞬间刷爆
    if (e.def?.elite || this.combatRng.next() < 0.45) {
      const drop = e.def?.elite ? 4 : 1;
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
    if (this.killStreak === 20 || this.killStreak === 40 || this.killStreak === 60) {
      this.cameras.main.shake(70, 0.0025);
    }
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
    const times = this.engine.stats.triggerTimes;
    const now = this.engine.now;
    const floor = now - FREQ_WINDOW_MS;
    while (this.freqStart < times.length && times[this.freqStart] < floor) this.freqStart++;
    const buckets = [0, 0, 0, 0, 0];
    for (let i = this.freqStart; i < times.length; i++) {
      const b = Math.floor((times[i] - floor) / 1000);
      if (b >= 0 && b < 5) buckets[b]++;
    }
    const count = times.length - this.freqStart;
    this.freqBuckets = buckets;
    this.recentRate = count / (FREQ_WINDOW_MS / 1000);
    if (this.recentRate > this.peakRate) this.peakRate = this.recentRate;
  }

  // 进度事件：地图事件点走近触发 + 大Boss等级触发（取代旧的纯计时遭遇）
  checkProgressEvents() {
    // 1) 大Boss：等级达标（时间保底经验推着等级走，磨蹭也会触发）
    if (!this.bossStarted && !this.run.majorBossActs[this.act] && shouldTriggerMajorBoss(this.act, this.run.progression.level)) {
      const def = getEncounterForAct(this.act, 'boss');
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
      if (near && !point.label) point.label = addText(this, point.x, point.y - 24, point.name + '（' + point.hint + '）', 7, point.type === 'npc' ? HEX.teal : HEX.blood, { wordWrap: { width: 160 } }).setOrigin(0.5, 1).setDepth(300);
      if (!near && point.label) { point.label.destroy(); point.label = null; }
    }
  }

  beginEncounter(definition) {
    if (this.phase !== 'play') return;
    const opened = openEncounter(this.run.encounters, definition, { seed: this.run.seed + ':' + definition.id });
    if (!opened.ok) return;
    // 大Boss一旦触发过（无论答对处决/答错开战）就不再重复触发，防止等级条件恒真导致无限开问答
    if (definition.type === 'boss' && definition.tier !== 'mini') this.run.majorBossActs[this.act] = true;
    // 冻结镜头跟随：问答面板挂世界坐标，镜头再动面板就会漂移、点击全偏
    this.cameras.main.stopFollow();
    this.phase = 'encounter'; this.paused = true; this.engine.paused = true;
    this.menuOpen = false; this.spaceHeld = false; this.focusPaused = false;
    this.pauseMenu.hide(); this.hint.setVisible(false); this.pauseHint.setVisible(false);
    this.board.setDetailVisible(false); this.input.keyboard.resetKeys();
    if (definition.type === 'boss') {
      this.bossStarted = true;
      this.boss = new Boss(this, definition, this.act, this.enemySeq++);
      this.boss.x = this.player.x;
      // 新 Boss 立绘 72/104px：下限按实际显示高度算，保证整只 Boss 落在 HUD 下方。
      const bossMinY = 42 + (this.boss.sprite?.displayHeight ?? 0) - 21 + 4;
      this.boss.y = Math.max(bossMinY, this.player.y - 110);
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
    const receipt = resolveBossOnce(this.run, this.act, bossId, method, tier);
    if (!receipt.ok) return;
    this.shardCount += receipt.reward; this.kills++;
    // Boss 战利品：问答定义给出法术卡进手牌 + 随机一个罗盘本体增益
    const spellKey = 'sigil:' + ['frost_arrow', 'holy_ward', 'starfall', 'chain_lightning', 'pierce_lance', 'meteor_judgment', 'quake_maw'][this.act - 1];
    this.run.hand[spellKey] = (this.run.hand[spellKey] ?? 0) + 1;
    const buff = rollBuff(COMPASS_BUFFS, () => this.combatRng.next());
    if (buff) {
      const level = metaLevel(this.metaSave, buff.id);
      const desc = applyPassiveToCompass(buff, this.run.compassBuffs, level);
      this.engine.comboWindowMul = this.run.compassBuffs.comboWindowMul;
      if (this.engine.combos) this.engine.combos.windowMul = this.engine.comboWindowMul;
      rebuildDerived(this.grid, ACTS[this.act - 1].baseIntervalMs * this.run.compassBuffs.intervalMul, { cooldownMul: this.run.compassBuffs.cooldownMul });
      this.effects.text(240, 96, '罗盘增益 · ' + buff.name + metaPassiveLabel(level) + '：' + desc, HEX.teal, true);
    }
    this.cameras.main.flash(140, 255, 246, 224);
    sfx.bossShatter();
    if (tier !== 'mini') this.bossDefeated = true;
    this.bossStarted = false; // 复位：小Boss解决后，大Boss等级触发仍可生效
    this.hostileShots = []; this.hostileG.clear();
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

  resumeFollow(offsetY = 0) {
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);
    this.cameras.main.setDeadzone(60, 40);
    // 竖屏原本就有 190 的取景偏移；Boss 战再把镜头往上抬，避免 72/104px 立绘顶出 HUD。
    const base = isPortrait() ? 190 : 0;
    this.cameras.main.setFollowOffset(0, base + offsetY);
  }

  startBossClearTransition() {
    if (this.phase === 'bossDefeated' || this.phase === 'intermission') return;
    this.phase = 'bossDefeated'; this.paused = true; this.engine.paused = true; this.transitionLeft = 800;
    // 还在飞的经验粒子立刻结算：过场里不该出现「差一点没捡到」的损失
    this.flushExpMotes();
    this.bossCamOffset = 0;
    this.resumeFollow();
    this.hostileShots = []; this.hostileG.clear();
    for (const enemy of this.enemies) enemy.destroy(); this.enemies = [];
    this.releaseProjectiles();
    // 通幕瞬间的余韵：白闪 + 杖尖余波，再交给过场接住
    this.cameras.main.flash(160, 255, 246, 224);
    this.cameras.main.shake(120, 0.003);
    this.effects.burst(this.player.x, this.player.y, C.arcaneLight, 24);
    this.effects.text(240, 115, '契约解除 · Boss 已击败', HEX.arcaneLight, true);
  }

  addHostileShot(shot) {
    if (this.bossDefeated || this.hostileShots.length >= 64) return;
    this.hostileShots.push({ ...shot });
    sfx.enemyShot();
  }

  updateHostileShots(dt) {
    for (let i = this.hostileShots.length - 1; i >= 0; i--) {
      const s = this.hostileShots[i];
      s.lifeMs -= dt; s.x += s.vx * dt / 1000; s.y += s.vy * dt / 1000;
      // 弹丸是世界坐标（Boss/远程怪在玩家附近开火），清退边界必须跟世界尺寸走；
      // 旧单屏 480×270 边界会让地图左上角以外的战斗首发弹即消失（偶发弹幕失效的根因）。
      if (s.lifeMs <= 0 || s.x < 0 || s.x > this.world.w || s.y < 0 || s.y > this.world.h) { this.hostileShots.splice(i, 1); continue; }
      if (Math.hypot(s.x - this.player.x, s.y - this.player.y) < this.player.radius + 3) {
        if (this.player.takeDamage(s.damage, this.engine.now)) { this.effects.hurt(); sfx.hurt(); }
        this.hostileShots.splice(i, 1);
      }
    }
    this.hostileG.clear();
    for (const s of this.hostileShots) { this.hostileG.fillStyle(C.blood, 1); this.hostileG.fillRect(Math.round(s.x) - 1, Math.round(s.y) - 1, 3, 3); }
  }

  checkDeath() {
    if (this.phase === 'play' && !this.player.alive) this.die();
  }

  die() {
    if (this.phase !== 'play') return;
    this.phase = 'dying';
    this.paused = true;
    this.engine.paused = true;
    this.pauseMenu.hide();
    this.board.setDetailVisible(false);
    this.pauseHint.setVisible(false);
    this.hint.setVisible(false);
    this.player.draw(this.engine.now); // 让玩家绘制成倒地状态
    this.effects.deathBurst(this.player.x, this.player.y);
    this.cameras.main.shake(240, 0.006);
    const summary = this.buildSummary();
    this.time.delayedCall(1000, () => {
      // 死亡：先演魂火熄灭，再揭开结算页；合计约 2.1 秒，仍可按键跳过
      if (this.phase === 'dying') playCutscene(this, { kind: 'death', act: this.act, to: 'GameOverScene', payload: { ...summary, __cine: true }, report: summary });
    });
  }

  buildSummary() {
    const s = this.engine.summary(this.engine.now);
    return {
      elapsedMs: this.engine.now,
      act: this.act,
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
    this.game.events.off(Phaser.Core.Events.BLUR, this.handleBlur);
    this.game.events.off(Phaser.Core.Events.FOCUS, this.handleFocus);
    this.input.keyboard.off('keydown-ESC', this.onEsc);
    this.input.keyboard.off('keydown-R', this.onRestart);
    this.input.keyboard.off('keydown-T', this.onTitle);
    this.input.keyboard.off('keydown-M', this.onMute);
    this.input.keyboard.off('keydown-E', this.onEdit);
    if (this.editPointer) this.input.off('pointerdown', this.editPointer);
    this.editPointer = null;
    this.editUI?.destroy(true);
    this.editUI = null;
    this.editOpen = false;
    this.touch?.destroy();
    this.touch = null;
    window.removeEventListener('pointerdown', this.panelPointerHandler);
    this.time.removeAllEvents();
    this.encounterPanel.destroy();
    this.hostileG.destroy();
    this.hostileShots = [];
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
