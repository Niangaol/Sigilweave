// 引擎事件 → 表现：触发/断组/受阻/改道/消散/保底/联组开火，以及消散后的脉流重生。
// 从 BattleScene 迁出（2026-11-19 架构重构收尾）。场景方法保留同名一行委托。
import { manhattan } from '../logic/grid.js';
import { cellCenter } from '../ui/SigilBoard.js';
import { C, HEX } from '../ui/Palette.js';
import { SIGIL_DEFS, resolveComboBonus } from '../logic/effects.js';
import { resolveTarget, resolveVolley, volleyLimit } from '../logic/sector.js';
import { COMBO_NAMES } from '../data/roster.js';
import { sfx } from '../audio/Sfx.js';

export function onEngineEvent(scene, type, data) {
  switch (type) {
    case 'signal:trigger': {
      const cellId = data.cellId;
      const cell = scene.grid.cells[cellId];
      scene.board.flashTrigger(cellId);
      sfx.trigger();
      // 静默：本格触发时压制正交邻格，邻格被迫走完整冷却
      if (cell.runes.includes('silence')) for (const nb of scene.grid.cells) {
        if (manhattan(cellId, nb.id) === 1 && nb.unlocked) nb.cooldownUntil = Math.max(nb.cooldownUntil, scene.engine.now + nb.effCooldownMs);
      }
      if (!cell.slot || cell.slot.kind !== 'sigil' || cell.mutedOutput) {
        if (cell.slot?.kind === 'auxiliary') scene.effects.dissipate(cellCenter(cellId).x, cellCenter(cellId).y, C.teal);
        break;
      }
      const def = scene.sigilOf(cellId);
      const kind = SIGIL_DEFS[def.id]?.kind;
      // 所有法术特效统一从法杖尖端起手（世界坐标）；罗盘格子只负责闪灯提示
      const origin = scene.player.staffTip();
      const owner = { x: scene.player.x, y: scene.player.y };
      // 索敌只在摄像机视口内进行：屏外的怪不锁、不打，等它走进屏幕后下一次触发再出手。
      const view = scene.viewRect();
      const result = resolveTarget(cellId, owner, scene.enemies, { view });
      // 罗盘格闪光用该法术主色：一眼能认出「刚才那一格打的是什么」
      scene.board.flashTrigger(cellId, def.color);
      // 每个法术自己的起手爆发（spell-fx 按 defId 分派）
      const castAngle = Math.atan2(result.aim.y - origin.y, result.aim.x - origin.x);
      scene.effects.spellCast(def.id, origin.x, origin.y, castAngle);
      if (kind === 'ward') {
        // 护盾是自身增益，不依赖敌方目标：始终能放，光迹收在玩家身上
        scene.effects.directionTrace(origin, owner, scene.sectorRect(cellId), def.color, false);
        scene.applySigil(cellId, def.id);
        scene.effects.spellWard(def.id, SIGIL_DEFS[def.id].radius ?? 40);
      } else if (kind === 'nova') {
        // 新星以自身为圆心，不需要锁敌：光迹收到自己身上，落点就是玩家位置（castMs 走前摇）
        scene.effects.directionTrace(origin, owner, scene.sectorRect(cellId), def.color, false);
        scene.queueOrCommit(cellId, def.id, { x: owner.x, y: owner.y }, castAngle);
        scene.effects.burst(owner.x, owner.y, def.color, 4);
      } else {
        // 割草齐射：单次触发对扇区内最近的 N 个敌人各打一发（各类型 N 见 sector.VOLLEY_LIMITS）。
        // 屏幕内一个可选目标都没有时「停火等待」：不放弹丸、不朝屏外画光迹，等怪进屏再打。
        const volley = resolveVolley(cellId, owner, scene.enemies, { maxTargets: volleyLimit(kind), view });
        if (!volley.targets.length) {
          scene.effects.hold(origin.x, origin.y, def.color);
          break;
        }
        scene.effects.directionTrace(origin, volley.aims[0], scene.sectorRect(cellId), def.color, false);
        let fired = 0;
        for (let i = 0; i < volley.targets.length; i++) {
          const projectile = scene.fireProjectile(origin.x, origin.y, volley.aims[i].x, volley.aims[i].y, def, volley.targets[i]);
          if (projectile) {
            projectile.cellId = cellId;
            fired++;
          }
        }
        if (fired > 0) scene.effects.burst(origin.x, origin.y, def.color, 3); // 起手微粒（法术本体已由 spell-fx 负责）
      }
      break;
    }
    case 'combo:break': {
      const labels = { cooldown: '冷却受阻', fallback: '保底改道', dissipate: '脉流消散' };
      const shapes = (data.shapes ?? []).map(s => COMBO_NAMES[s] ?? s).join('、');
      scene.effects.text(402, 168, '联组断 · ' + (labels[data.reason] ?? data.reason) + (shapes ? '（' + shapes + '）' : ''), HEX.blood, true);
      scene.comboBreakCount = (scene.comboBreakCount ?? 0) + 1;
      sfx.comboBreak();
      break;
    }
    case 'signal:blocked': {
      sfx.blocked();
      // 冷却未就绪：格子上闪黄铜色冷却角标
      scene.board.flashBlocked(data.cellId);
      break;
    }
    case 'signal:reroute': {
      // 改道短折线，青绿色属于「运行层」
      scene.effects.reroute(cellCenter(data.blocked), cellCenter(data.to));
      break;
    }
    case 'signal:dissipate': {
      const id = data.cellId === null || data.cellId === undefined ? scene.startCell : data.cellId;
      scene.board.flashDissipate(id);
      const pos = cellCenter(id);
      scene.effects.dissipate(pos.x, pos.y, C.groove);
      sfx.dissipate();
      scene.onSignalDissipate(data);
      break;
    }
    case 'signal:fallback': {
      scene.effects.fallback(cellCenter(data.from), cellCenter(data.to));
      break;
    }
    case 'combo:fire': {
      const centers = data.order.map((id) => cellCenter(id));
      for (const id of data.order) scene.board.flashCombo(id);
      scene.effects.combo(centers, COMBO_NAMES[data.defId] || data.defId);
      sfx.combo();
      const bonusResult = resolveComboBonus({ grid: scene.grid, order: data.order, defId: data.defId, bonus: data.bonus, state: scene.combatState(), enemies: scene.enemies });
      const lastCell = data.order?.[data.order.length - 1];
      const bonusVisual = Number.isInteger(lastCell) && scene.grid.cells[lastCell]?.slot ? scene.sigilOf(lastCell) : null;
      for (const enemy of bonusResult.targets ?? []) scene.onEnemyHit(enemy, null, null, bonusVisual, true);
      // 专属连携：在联组中心飘一个短词，命中目标再补一次元素色冲击
      if (bonusResult.linkage) {
        const center = centers?.[Math.floor((centers.length - 1) / 2)] ?? scene.player;
        const pair = bonusResult.linkage;
        const color = HEX.brassLight;
        scene.effects.labelPopup(center.x, center.y - 26, '连携 · ' + pair.name, color, 9);
        for (const enemy of pair.targets ?? []) {
          if (Number.isFinite(enemy?.x)) scene.effects.hitSpark(enemy.x, enemy.y, 0, -1, C.brassLight, 0.55);
        }
      }
      scene.triggerDeathBursts();
      scene.collectDefeated();
      break;
    }
    default:
      break;
  }
}

// 消散后脉流会重生：此刻按玩家当前位置重新采样起点（引擎只在重生时读取 startCells）

export function onSignalDissipate(scene, data) {
  const sig = scene.engine.signals.get(data.signalId);
  const index = sig ? sig.startIndex : 0;
  const next = scene.sampleStartCell();
  scene.engine.startCells[index] = next;
  if (index === 0) {
    scene.startCell = next;
    scene.board.setStart(next);
    scene.effects.text(240, 178, '脉流从新方位重生', HEX.arcaneLight, true);
  }
}

// ---------- 输入与暂停状态机 ----------
