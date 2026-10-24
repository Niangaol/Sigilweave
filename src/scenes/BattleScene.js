// 战斗场景（P1 纵切核心）
// 地图占满 HUD 下方画面；法术罗盘固定右下角，不再上下分屏。
// 逻辑内核只读引用：SigilEngine / grid / sector / combo，所有时序与冷却都不在这里重写。
import Phaser from 'phaser';
import { SigilEngine } from '../logic/engine.js';
import { createGrid, rebuildDerived, toId, toRC, manhattan } from '../logic/grid.js';
import { buildComboCatalog } from '../logic/combo.js';
import { resolveTarget } from '../logic/sector.js';
import { ACTS, WORLD_SIZES } from '../logic/constants.js';
import { applyDraft, snapshotBuild, draftFromGrid, validateDraft, AUX_TARGETED } from '../logic/build.js';
import { SIGIL_DEFS, AUX_DEFS, resolveSigilTrigger, resolveComboBonus } from '../logic/effects.js';
import { createRun, recordAct } from '../logic/run.js';
import { createProgression, grantExp, levelStats, shouldTriggerMajorBoss, CHARACTER_BUFFS, COMPASS_BUFFS, rollBuff } from '../logic/progression.js';
import { getEventPoints, findTriggeredPoint } from '../data/map-events.js';
import { getEncounterById, getMinibossEncounters } from '../data/encounters.js';
import { Rng } from '../logic/rng.js';
import { CARD_POOL } from '../logic/workshop.js';
import { expNeeded } from '../logic/progression.js';
import { Pool } from '../logic/pool.js';
import { pickSpawnPoint, separateEnemies } from '../logic/spawn.js';
import { getEncounterForAct } from '../data/encounters.js';
import { createEncounterState, openEncounter, selectChoice, confirmChoice, finishEncounter } from '../logic/encounters.js';
import { resolveBossOnce } from '../logic/boss.js';
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
import { C, HEX, addText, pxRect, pxFrame, pxDiamond, applyPixelZoom, getRenderScale, uiLayerOffset } from '../ui/Palette.js';
import { sfx, toggleSound } from '../audio/Sfx.js';

const BATTLE = { left: 10, right: 470, top: 26, bottom: 262 };
const FREQ_WINDOW_MS = 5000;

export default class BattleScene extends Phaser.Scene {
  constructor() {
    super('BattleScene');
  }

  create(data = {}) {
    applyPixelZoom(this);
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
    this.durationMs = this.quickMode ? 15000 : [180000, 240000, 180000][this.act - 1];
    this.combatRng = new Rng(this.run.seed + ':combat:' + this.act);
    this.debugParams = params;
    this.phase = 'play';
    this.stressRunning = false;
    this.pendingPicks = 0;
    this.timeExpTimer = 0;
    this.run.encounters ??= createEncounterState(this.run.seed);
    this.run.bossResolutions ??= {};
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
    this.sampleTimer = 2000;
    this.enemySeq = 1;
    this.hintUntil = 13000;
    this.chests = [];

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
      restart: () => { if (this.menuOpen || this.editOpen) this.scene.restart(); },
      title: () => { if (this.menuOpen) this.scene.start('TitleScene'); },
      edit: () => { if (this.menuOpen && !this.editOpen) this.openGridEdit(); },
    });
    this.hostileG = this.add.graphics().setDepth(450);
    this.encounterPanel = new EncounterPanel(this, id => this.selectEncounterAnswer(id), () => this.confirmEncounterAnswer(), () => this.continueEncounter());
    // 面板交互：场景级命中测试（画布坐标，不受镜头滚动影响）
    // 面板交互挂 DOM window 事件：绕开 Phaser 输入插件在镜头滚动后的投递丢失
    this.panelPointerHandler = (ev) => {
      if (this.phase !== 'encounter' || !this.encounterPanel.view.visible) return;
      const rect = this.game.canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const px = (ev.clientX - rect.left) / rect.width * 480;
      const py = (ev.clientY - rect.top) / rect.height * 270;
      const action = this.encounterPanel.hitTest(px, py);
      if (action) { sfx.tick(); action(); }
    };
    window.addEventListener('pointerdown', this.panelPointerHandler);
    this.input.on('pointerdown', this.panelPointerHandler);

    // ---------- 世界与摄像机（每幕一张大地图） ----------
    this.worldBounds = { left: 24, top: 40, right: world.w - 24, bottom: world.h - 24 };
    this.battleBounds = this.worldBounds; // 敌人 AI 读取的世界活动范围

    // ---------- 玩家 ----------
    this.player = new Player(this, world.w / 2, world.h / 2);
    Object.assign(this.player, this.run.characterStats ?? {});
    this.cameras.main.setBounds(0, 0, world.w, world.h);
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);
    this.cameras.main.setDeadzone(60, 40);
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
      if (this.menuOpen) this.scene.restart();
    };
    this.onMute = () => {
      const on = toggleSound();
      this.effects.text(240, 150, on ? '音效已开启' : '音效已关闭', HEX.arcaneLight, true);
    };
    this.onTitle = () => {
      if (this.menuOpen) this.scene.start('TitleScene');
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

    // 操作提示（12 秒后淡出）
    this.hint = addText(this, 10, 250, 'WASD / 方向键 走位　·　按住空格 暂停观察　·　Esc 菜单', 8, HEX.parchment).setScrollFactor(0)
      .setOrigin(0, 0.5).setDepth(1005).setAlpha(0.9);
    this.pauseHint = addText(this, 10, 182, '观察中 · 松开空格继续　（Esc 打开菜单）', 8, HEX.arcaneLight).setScrollFactor(0)
      .setOrigin(0, 0.5).setDepth(1006).setVisible(false);

    // UI 收进固定屏幕容器：世界由摄像机 zoom 放大，UI 靠容器补偿维持逻辑坐标。
    this.mountUiLayer();

    this.cameras.main.fadeIn(220, 0, 0, 0);

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
        const center = cellCenter(cellId);
        // 方位索敌：只打本格对应扇区内的最近敌人；空区也朝区域中心空射
        const result = resolveTarget(
          cellId,
          { x: this.player.x, y: this.player.y },
          this.enemies,
        );
        this.board.flashTrigger(cellId);
        // 设计稿 2.3 核心：从该格指向对应战场方位的高亮光迹（空区也画）
        this.effects.directionTrace(center, result.aim, this.sectorRect(cellId), def.color, result.empty);
        if (SIGIL_DEFS[def.id]?.kind === 'ward') {
          this.applySigil(cellId, def.id);
        } else {
          const projectile = this.fireProjectile(center.x, center.y, result.aim.x, result.aim.y, def, result.target);
          if (projectile) projectile.cellId = cellId;
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
        resolveComboBonus({ grid: this.grid, order: data.order, defId: data.defId, bonus: data.bonus, state: this.combatState(), enemies: this.enemies });
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
    this.background.update(time);
    this.syncPauseState();

    if (this.phase === 'play' && !this.paused) {
      this.engine.advance(dt);
      this.updatePlayer(dt);
      this.updateSpawner(dt);
      this.updateEnemies(dt);
      this.updateHostileShots(dt);
      this.updateProjectiles(dt);
      this.updateShards(dt);
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
        this.resumeFollow();
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

  updateSpawner(dt) {
    if (this.bossStarted) return;
    this.spawnTimer -= dt;
    const dif = difficultyAt(this.engine.now);
    if (this.spawnTimer <= 0 && this.enemies.length < dif.maxAlive) {
      this.spawnEnemy(dif);
      this.spawnTimer = dif.spawnMs * (0.85 + this.combatRng.next() * 0.3);
    }
  }

  spawnEnemy(dif) {
    // 幸存者式：以玩家为中心、屏幕外环形生成。
    // 落点由纯逻辑 pickSpawnPoint 决定：环更宽（230..430）+ 与已有敌人保持最小间距，避免扎堆。
    const { x, y } = pickSpawnPoint({
      rng: () => this.combatRng.next(),
      player: this.player,
      world: this.world,
      enemies: this.enemies,
      minDist: 230, maxDist: 430, minGap: 36,
    });
    // 按幕权重抽敌人类型；腐尸更厚更慢、蝠更快更脆，伤害取各自定义
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
    // 逐帧轻量分离：数量上限提高了，靠这个把挤在一起的杂兵推开，避免视觉上堆成一坨。
    // 上限 26 时是 325 次配对；压测把数量灌到 150 时跳过，避免 O(n²) 拖累采样
    if (this.enemies.length > 1 && this.enemies.length <= 48) {
      separateEnemies(this.enemies, { gap: 24, player: this.player, contactDist: 30 });
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

  releaseProjectiles() {
    for (const p of this.projectiles) { p.deactivate(); this.projectilePool.release(p); }
    this.projectiles = [];
  }

  updateProjectiles(dt) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      const arrived = p.update(dt);
      if (arrived) {
        this.resolveProjectile(p);
        p.deactivate();
        this.projectilePool.release(p);
        this.projectiles.splice(i, 1);
      }
    }
  }

  combatState() {
    return {
      player: this.player, oath: this.grid.oath, now: this.engine.now,
      buffMul: this.run.compassBuffs.damageMul, hitBonus: this.run.compassBuffs.hitBonus,
    };
  }

  applySigil(cellId, defId, aimPoint) {
    const result = resolveSigilTrigger({ grid: this.grid, cellId, defId, state: this.combatState(), enemies: this.enemies, aimPoint });
    if (result.sacrificeApplied) {
      const c = cellCenter(cellId);
      this.effects.text(c.x, c.y - 10, '献祭 -8盾 双倍', HEX.blood, true);
    }
    for (const enemy of result.targets) {
      enemy.hitAt = this.engine.now;
      this.effects.impact(enemy.x, enemy.y, this.sigilOf(cellId).color, false);
    }
    this.collectDefeated();
    return result;
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
    const result = this.applySigil(p.cellId, p.def.id, { x: p.tx, y: p.ty });
    if (!result.hits) this.effects.impact(p.x, p.y, p.def.color, true);
  }

  // ---------- 暂停编辑法阵（保留冷却；战斗实时不可改，暂停可改） ----------
  openGridEdit() {
    if (this.editOpen) return;
    this.editOpen = true;
    this.editSelected = null;
    this.editAuxPending = null;
    this.editNote = '点手牌再点符位放置；点已放置的卡收回。';
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
    this.drawGridEdit();
  }

  editNames() { return { ...SIGIL_DEFS, ...AUX_DEFS }; }

  drawGridEdit() {
    if (this.editUI) { this.editUI.destroy(true); this.editUI = null; }
    const ui = this.add.container(0, 0).setDepth(3500).setScrollFactor(0);
    this.uiRoot?.add(ui);
    this.editUI = ui;
    this.editRects = [];
    const g = this.add.graphics();
    ui.add(g);
    pxRect(g, 0, 0, 480, 270, C.void, 0.94);
    pxFrame(g, 8, 8, 464, 254, C.brassDark, 2, 1);
    ui.add(addText(this, 16, 12, '编辑法阵（暂停中 · 冷却保留）', 10, HEX.brassLight));
    const names = this.editNames();
    const draft = this.editDraft;
    for (const id of draft.unlocked) {
      const x = 20 + (id % 4) * 92, y = 34 + Math.floor(id / 4) * 46;
      const slot = draft.slots?.[id];
      const g2 = this.add.graphics();
      pxRect(g2, x, y, 84, 38, slot ? C.stoneDark : C.nightDeep);
      pxFrame(g2, x, y, 84, 38, this.editSelected === id ? C.teal : C.brassDark, 1, 1);
      ui.add(g2);
      ui.add(addText(this, x + 4, y + 4, (id + 1) + '号 ' + (slot ? names[slot.defId]?.name ?? slot.defId : '空'), 7, slot?.kind === 'auxiliary' ? HEX.teal : HEX.parchment));
      if (slot) ui.add(addText(this, x + 4, y + 22, '点击收回', 7, HEX.mute));
      else ui.add(addText(this, x + 4, y + 22, '空', 7, HEX.mute));
      this.editRects.push({ x, y, w: 84, h: 38, action: () => this.editCellClick(id) });
    }
    ui.add(addText(this, 400, 34, '手牌', 9, HEX.brass));
    const hand = Object.entries(this.editHand).filter(([, count]) => count > 0);
    const lastPage = Math.max(0, Math.ceil(hand.length / 5) - 1);
    this.editHandPage = Math.min(this.editHandPage, lastPage);
    let row = 0;
    for (const [key, count] of hand.slice(this.editHandPage * 5, this.editHandPage * 5 + 5)) {
      const defId = key.split(':')[1];
      const y = 52 + row * 24;
      const bg = this.add.graphics();
      pxRect(bg, 396, y, 76, 20, C.stoneDark); pxFrame(bg, 396, y, 76, 20, this.editSelected === key ? C.teal : C.brassDark, 1, 1);
      ui.add(bg);
      ui.add(addText(this, 398, y + 3, (names[defId]?.name ?? defId) + '×' + count, 7, HEX.parchment));
      this.editRects.push({ x: 396, y, w: 76, h: 20, action: () => { this.editSelected = this.editSelected === key ? null : key; this.editNote = this.editSelected ? '选中，点符位放置' : ''; this.drawGridEdit(); } });
      row++;
    }
    ui.add(addText(this, 396, 200, this.editNote, 7, HEX.arcaneLight, { wordWrap: { width: 76 } }));
    if (lastPage > 0) {
      ui.add(addText(this, 398, 178, '◀ ' + (this.editHandPage + 1) + '/' + (lastPage + 1) + ' ▶', 8, HEX.teal));
      for (const [x, step] of [[396, -1], [434, 1]]) this.editRects.push({ x, y: 174, w: 38, h: 20, action: () => {
        this.editHandPage = (this.editHandPage + step + lastPage + 1) % (lastPage + 1); this.drawGridEdit();
      } });
    }
    const done = this.add.graphics();
    pxRect(done, 396, 232, 76, 18, C.stoneDark); pxFrame(done, 396, 232, 76, 18, C.teal, 1, 1);
    ui.add(done);
    ui.add(addText(this, 434, 236, '完成', 8, HEX.teal).setOrigin(0.5, 0.5));
    this.editRects.push({ x: 396, y: 232, w: 76, h: 18, done: true, action: () => this.closeGridEdit() });
  }

  editCellClick(id) {
    const draft = this.editDraft;
    const names = this.editNames();
    // 绑定模式：辅助等待目标
    if (this.editAuxPending !== null) {
      draft.auxTargets ??= {};
      draft.auxTargets[this.editAuxPending] = id;
      this.editAuxPending = null;
      this.editNote = '目标已绑定';
      this.drawGridEdit(); return;
    }
    const selKey = this.editSelected;
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
      if (kind === 'auxiliary' && AUX_TARGETED.has(defId)) {
        this.editAuxPending = id;
        this.editNote = '点相邻输出格绑定目标';
      }
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
    this.drawGridEdit();
  }

  closeGridEdit() {
    const errors = validateDraft(this.editDraft);
    if (errors.length) { this.editNote = '未通过校验：' + errors.map(e => e.code).join('、'); this.drawGridEdit(); return; }
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
          buff.apply(adapter);
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
          this.effects.text(this.player.x, this.player.y - 14, '宝箱 · ' + buff.name + '：' + buff.desc, HEX.brassLight, true);
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
    if (this.act < 3) {
      this.run.act++;
      this.scene.start('IntermissionScene', { run: this.run, report });
    } else {
      const totals = this.run.reports.reduce((out, report) => ({
        elapsedMs: out.elapsedMs + report.elapsedMs,
        kills: out.kills + report.kills,
        triggers: out.triggers + report.triggers,
        combos: out.combos + report.combos,
        blocked: out.blocked + report.blocked,
        peakRate: Math.max(out.peakRate, report.peakRate),
      }), { elapsedMs: 0, kills: 0, triggers: 0, combos: 0, blocked: 0, peakRate: 0 });
      this.scene.start('GameOverScene', { ...this.buildSummary(), ...totals, victory: true, bossResolutions: structuredClone(this.run.bossResolutions) });
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
    // 经验：普通+1、精英+6；4% 掉宝箱（人物本体增益）
    const expMul = this.run.compassBuffs.expMul * (this.quickMode ? 4 : 1);
    const gained = grantExp(this.run.progression, e.def?.elite ? 6 : 1, expMul);
    if (!this.stressRunning && gained.ok && gained.levelsGained > 0) this.queueLevelPicks(gained.levelsGained);
    if (this.combatRng.next() < 0.04 && this.chests.length < 6) this.spawnChest(e.x, e.y);
    this.effects.burst(e.x, e.y, C.bone, 10);
    this.effects.dissipate(e.x, e.y, C.groove);
    // 按敌种掉落：腐尸/邪教徒/骑士更值钱；18% 额外一颗保持稀有惊喜
    const drop = Math.max(1, Math.round(e.def?.shards ?? 1));
    for (let i = 0; i < drop; i++) this.spawnShard(e.x + (i - (drop - 1) / 2) * 4, e.y - (i % 2) * 3);
    if (this.combatRng.next() < 0.18) this.spawnShard(e.x + 5, e.y - 3);
    e.alive = false;
    e.destroy();
    const idx = this.enemies.indexOf(e);
    if (idx >= 0) this.enemies.splice(idx, 1);
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
      this.boss.y = Math.max(60, this.player.y - 110);
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
    const spellKey = 'sigil:' + ['frost_arrow', 'holy_ward', 'starfall'][this.act - 1];
    this.run.hand[spellKey] = (this.run.hand[spellKey] ?? 0) + 1;
    const buff = rollBuff(COMPASS_BUFFS, () => this.combatRng.next());
    if (buff) {
      buff.apply(this.run.compassBuffs);
      this.engine.comboWindowMul = this.run.compassBuffs.comboWindowMul;
      if (this.engine.combos) this.engine.combos.windowMul = this.engine.comboWindowMul;
      rebuildDerived(this.grid, ACTS[this.act - 1].baseIntervalMs * this.run.compassBuffs.intervalMul, { cooldownMul: this.run.compassBuffs.cooldownMul });
      this.effects.text(240, 96, '罗盘增益 · ' + buff.name + '：' + buff.desc, HEX.teal, true);
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
  }

  resumeFollow() {
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);
    this.cameras.main.setDeadzone(60, 40);
  }

  startBossClearTransition() {
    if (this.phase === 'bossDefeated' || this.phase === 'intermission') return;
    this.phase = 'bossDefeated'; this.paused = true; this.engine.paused = true; this.transitionLeft = 800;
    this.resumeFollow();
    this.hostileShots = []; this.hostileG.clear();
    for (const enemy of this.enemies) enemy.destroy(); this.enemies = [];
    this.releaseProjectiles();
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
      if (s.lifeMs <= 0 || s.x < 0 || s.x > 480 || s.y < 20 || s.y > 270) { this.hostileShots.splice(i, 1); continue; }
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
      if (this.phase === 'dying') this.scene.start('GameOverScene', summary);
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
        if (!this.fireProjectile(this.player.x, this.player.y, this.player.x - 220 + this.combatRng.next() * 440, this.player.y - 105 + this.combatRng.next() * 210, def, null)) break;
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
        pools: { projectile: this.projectilePool.stats(), shard: this.shardPool.stats() },
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
    window.removeEventListener('pointerdown', this.panelPointerHandler);
    this.time.removeAllEvents();
    this.encounterPanel.destroy();
    this.hostileG.destroy();
    this.hostileShots = [];
    for (const e of this.enemies) e.destroy();
    for (const p of this.projectiles) p.destroy();
    for (const s of this.shards) s.destroy();
    for (const p of this.projectilePool?.free ?? []) p.destroy();
    for (const s of this.shardPool?.free ?? []) s.destroy();
    this.enemies = [];
    this.projectiles = [];
    this.shards = [];
    if (window.__SIGILWEAVE_BATTLE__ === this) window.__SIGILWEAVE_BATTLE__ = null;
  }
}
