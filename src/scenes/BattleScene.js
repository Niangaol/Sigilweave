// 战斗场景（P1 纵切核心）
// 地图占满 HUD 下方画面；法术罗盘固定右下角，不再上下分屏。
// 逻辑内核只读引用：SigilEngine / grid / sector / combo，所有时序与冷却都不在这里重写。
import Phaser from 'phaser';
import { SigilEngine } from '../logic/engine.js';
import { createGrid, rebuildDerived, toId, toRC, manhattan } from '../logic/grid.js';
import { buildComboCatalog } from '../logic/combo.js';
import { resolveTarget } from '../logic/sector.js';
import { ACTS } from '../logic/constants.js';
import { applyDraft, snapshotBuild } from '../logic/build.js';
import { SIGIL_DEFS, AUX_DEFS, resolveSigilTrigger, resolveComboBonus } from '../logic/effects.js';
import { createRun, recordAct } from '../logic/run.js';
import { Rng } from '../logic/rng.js';
import { Pool } from '../logic/pool.js';
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
import { C, HEX, addText } from '../ui/Palette.js';
import { sfx, toggleSound } from '../audio/Sfx.js';

const BATTLE = { left: 10, right: 470, top: 26, bottom: 262 };
const FREQ_WINDOW_MS = 5000;

export default class BattleScene extends Phaser.Scene {
  constructor() {
    super('BattleScene');
  }

  create(data = {}) {
    const params = new URLSearchParams(window.location.search);
    this.run = data.run ?? createRun(params.get('seed') ?? ('sigil-' + Date.now()));
    this.act = this.run.act;
    this.durationMs = params.get('quick') === '1' ? 15000 : [180000, 240000, 180000][this.act - 1];
    this.combatRng = new Rng(this.run.seed + ':combat:' + this.act);
    this.debugParams = params;
    this.phase = 'play';
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

    // ---------- 视觉层 ----------
    this.background = new Background(this);
    this.effects = new EffectsLayer(this);
    this.hud = new Hud(this);
    this.pauseMenu = new PauseMenu(this);
    this.hostileG = this.add.graphics().setDepth(450);
    this.encounterPanel = new EncounterPanel(this, id => this.selectEncounterAnswer(id), () => this.confirmEncounterAnswer(), () => this.continueEncounter());

    // ---------- 玩家 ----------
    this.player = new Player(this, 240, 132);

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
      space: 'SPACE', esc: 'ESC', restart: 'R', title: 'T', mute: 'M',
    });
    this.input.keyboard.addCapture(['W', 'A', 'S', 'D', 'SPACE', 'ESC', 'R', 'T', 'M', 'UP', 'DOWN', 'LEFT', 'RIGHT']);
    this.input.keyboard.resetKeys();
    // 压测入口只在显式 ?stress=1 下启用，不改变正常玩法
    if (params.get('stress') === '1') this.time.delayedCall(900, () => this.startStress());
    this.bootCount = (this.bootCount ?? 0) + 1;
    window.__SIGILWEAVE_BATTLE__ = this;

    this.onEsc = () => {
      if (this.phase !== 'play') return;
      if (this.menuOpen) this.closePause();
      else this.openPause('menu');
    };
    this.onRestart = () => {
      if (this.menuOpen) this.scene.restart();
    };
    this.onMute = () => {
      const on = toggleSound();
      this.effects.text(240, 150, on ? '音效已开启' : '音效已关闭', HEX.arcaneLight);
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

    this.input.keyboard.on('keydown-M', this.onMute);
    this.input.keyboard.on('keydown-ESC', this.onEsc);
    this.input.keyboard.on('keydown-R', this.onRestart);
    this.input.keyboard.on('keydown-T', this.onTitle);
    this.game.events.on(Phaser.Core.Events.BLUR, this.handleBlur);
    this.game.events.on(Phaser.Core.Events.FOCUS, this.handleFocus);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.onShutdown, this);

    // 操作提示（12 秒后淡出）
    this.hint = addText(this, 10, 250, 'WASD / 方向键 走位　·　按住空格 暂停观察　·　Esc 菜单', 8, HEX.parchment)
      .setOrigin(0, 0.5).setDepth(1005).setAlpha(0.9);
    this.pauseHint = addText(this, 10, 182, '观察中 · 松开空格继续　（Esc 打开菜单）', 8, HEX.arcaneLight)
      .setOrigin(0, 0.5).setDepth(1006).setVisible(false);

    this.cameras.main.fadeIn(220, 0, 0, 0);

    // 调试：?pause=1 直接打开暂停菜单，便于截图验收
    if (params.get('pause') === '1') {
      this.time.delayedCall(650, () => this.openPause('debug'));
    }

    // 暴露给验收脚本：只读查看引擎状态
    this.bootCount = (this.bootCount ?? 0) + 1;
    window.__SIGILWEAVE_BATTLE__ = this;
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
    const count = this.tuning?.starts ?? (this.act === 3 ? 2 : 1);
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
    const normC = Phaser.Math.Clamp(Math.floor((this.player.x / 480) * 4), 0, 3);
    const normR = Phaser.Math.Clamp(
      Math.floor(((this.player.y - 20) / (BATTLE.bottom + 8 - 20)) * 4), 0, 3,
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

  sectorRect(cellId) {
    const { r, c } = toRC(cellId);
    return {
      x: this.player.x - SECTOR.half + c * SECTOR.span,
      y: this.player.y - SECTOR.half + r * SECTOR.span,
      w: SECTOR.span,
      h: SECTOR.span,
    };
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
          SECTOR.half,
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
        this.effects.text(402, 168, '联组断 · ' + (labels[data.reason] ?? data.reason) + (shapes ? '（' + shapes + '）' : ''), HEX.blood);
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
        resolveComboBonus({ grid: this.grid, order: data.order, defId: data.defId, bonus: data.bonus, state: this.combatState(), enemies: this.enemies, half: SECTOR.half });
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
      this.effects.text(240, 178, '脉流从新方位重生', HEX.arcaneLight);
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
      else if (this.phase === 'play') this.checkEncounterSchedule();
    } else if (this.phase === 'bossDefeated') {
      this.effects.update(dt);
      this.transitionLeft -= dt;
      if (this.transitionLeft <= 0) this.completeAct();
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
      maxHp: PLAYER.hp,
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
    this.player.update(dt * factor, dx, dy, BATTLE, this.engine.now);
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
    const x = 16 + this.combatRng.next() * 448;
    const y = 24 + this.combatRng.next() * 14;
    if (Math.hypot(x - this.player.x, y - this.player.y) < 46) return;
    // 按幕权重抽敌人类型；腐尸更厚更慢、蝠更快更脆，伤害取各自定义
    const def = pickEnemyType(this.act, this.combatRng.next());
    this.enemies.push(new Enemy(
      this,
      def,
      x, y,
      { x: this.player.x, y: this.player.y }, // 出生瞬间锁定，之后直线推进
      Math.max(1, Math.round(dif.hp * (def.hpMul ?? 1))),
      dif.speed * (def.speedMul ?? 1),
      def.damage ?? dif.damage,
      this.enemySeq++,
    ));
  }

  updateEnemies(dt) {
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (!e.alive) {
        // 任何来源造成的Boss死亡都必须汇到统一通幕结算，不能直接跳过
        if (e.isBoss && !this.bossDefeated) this.defeatBoss('combat', e.definition.bossId);
        if (!this.enemies.includes(e)) continue; // defeatBoss 已将其移出并销毁
        e.destroy();
        this.enemies.splice(i, 1);
        continue;
      }
      e.update(dt, this.engine.now);
      // 罗盘属于 HUD，不是地图地形；怪物可穿过旧分界线。
      if (e.y > BATTLE.bottom + 24 || e.y < BATTLE.top - 24 || e.x < -24 || e.x > 504) e.alive = false;
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

  combatState() { return { player: this.player, oath: this.grid.oath, now: this.engine.now }; }

  applySigil(cellId, defId, aimPoint) {
    const result = resolveSigilTrigger({ grid: this.grid, cellId, defId, state: this.combatState(), enemies: this.enemies, half: SECTOR.half, aimPoint });
    if (result.sacrificeApplied) {
      const c = cellCenter(cellId);
      this.effects.text(c.x, c.y - 10, '献祭 -8盾 双倍', HEX.blood);
    }
    for (const enemy of result.targets) {
      enemy.hitAt = this.engine.now;
      this.effects.impact(enemy.x, enemy.y, this.sigilOf(cellId).color, false);
    }
    this.collectDefeated();
    return result;
  }

  collectDefeated() {
    for (const enemy of [...this.enemies]) if (!enemy.alive && enemy.hp === 0) this.onEnemyKilled(enemy);
  }

  resolveProjectile(p) {
    const result = this.applySigil(p.cellId, p.def.id, { x: p.tx, y: p.ty });
    if (!result.hits) this.effects.impact(p.x, p.y, p.def.color, true);
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
      this.defeatBoss('combat', e.definition.bossId);
      return;
    }
    e.rewarded = true;
    this.kills++;
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

  checkEncounterSchedule() {
    const npc = getEncounterForAct(this.act, 'npc');
    if (this.engine.now >= this.durationMs * 0.5 && !Object.hasOwn(this.run.encounters.completed, npc.id)) {
      this.beginEncounter(npc); return;
    }
    if (this.engine.now >= this.durationMs && !this.bossStarted) this.beginEncounter(getEncounterForAct(this.act, 'boss'));
  }

  beginEncounter(definition) {
    if (this.phase !== 'play') return;
    const opened = openEncounter(this.run.encounters, definition, { seed: this.run.seed + ':' + definition.id });
    if (!opened.ok) return;
    this.phase = 'encounter'; this.paused = true; this.engine.paused = true;
    this.menuOpen = false; this.spaceHeld = false; this.focusPaused = false;
    this.pauseMenu.hide(); this.hint.setVisible(false); this.pauseHint.setVisible(false);
    this.board.setDetailVisible(false); this.input.keyboard.resetKeys();
    if (definition.type === 'boss') {
      this.bossStarted = true;
      this.boss = new Boss(this, definition, this.act, this.enemySeq++);
      this.enemies.push(this.boss);
    }
    this.encounterPanel.show(this.run.encounters.active);
    sfx.quiz();
  }

  selectEncounterAnswer(choiceId) {
    if (this.phase !== 'encounter') return;
    const response = selectChoice(this.run.encounters, choiceId);
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
    if (result.action === 'bossDefeated') this.defeatBoss('quiz', result.bossId);
    this.encounterPanel.show(this.run.encounters.active);
  }

  continueEncounter() {
    if (this.phase !== 'encounter') return;
    const response = finishEncounter(this.run.encounters);
    if (!response.ok) return;
    this.encounterPanel.hide(); this.input.keyboard.resetKeys();
    if (this.bossDefeated) { this.startBossClearTransition(); return; }
    if (response.result.action === 'bossBattle') {
      for (const enemy of this.enemies) if (!enemy.isBoss) enemy.destroy();
      this.enemies = this.enemies.filter(enemy => enemy.isBoss);
      this.releaseProjectiles();
    }
    this.phase = 'play'; this.paused = false; this.engine.paused = false;
    this.player.invulnUntil = this.engine.now + 800;
    // 若浏览器在读题阶段失焦，关闭对话也不能悄悄恢复战斗。
    if (!document.hasFocus()) { this.focusPaused = true; this.openPause('focus'); }
  }

  defeatBoss(method, bossId) {
    const receipt = resolveBossOnce(this.run, this.act, bossId, method);
    if (!receipt.ok) return;
    this.shardCount += receipt.reward; this.kills++;
    this.bossDefeated = true;
    this.hostileShots = []; this.hostileG.clear();
    if (this.boss) {
      const x = this.boss.x, y = this.boss.y;
      this.boss.alive = false; this.boss.rewarded = true; this.boss.destroy();
      this.effects.burst(x, y, C.arcane, 20);
      sfx.bossDown();
      this.enemies = this.enemies.filter(e => e !== this.boss);
    }
  }

  startBossClearTransition() {
    if (this.phase === 'bossDefeated' || this.phase === 'intermission') return;
    this.phase = 'bossDefeated'; this.paused = true; this.engine.paused = true; this.transitionLeft = 800;
    this.hostileShots = []; this.hostileG.clear();
    for (const enemy of this.enemies) enemy.destroy(); this.enemies = [];
    this.releaseProjectiles();
    this.effects.text(240, 115, '契约解除 · Boss 已击败', HEX.arcaneLight);
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
    this.player.invulnUntil = Number.MAX_SAFE_INTEGER;
    const spawnWave = () => {
      if (this.phase !== 'play') return;
      for (let i = 0; i < 25 && this.enemies.length < 150; i++) this.spawnEnemy({ hp: 10, speed: 30, damage: 8, maxAlive: 999 });
      while (this.shards.length < 200) this.spawnShard(20 + this.combatRng.next() * 440, 40 + this.combatRng.next() * 210);
      while (this.projectiles.length < 300) {
        const def = cardVisual({ kind: 'sigil', defId: 'arcane_bolt' });
        if (!this.fireProjectile(240, 200, 20 + this.combatRng.next() * 440, 40 + this.combatRng.next() * 210, def, null)) break;
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
