// 场景关闭：解绑输入/事件、销毁 UI 与对象、清空列表。
// 从 BattleScene 迁出（2026-11-19 架构重构收尾）。场景方法保留一行委托。
import { hideGuide } from '../logic/guide.js';

export function onShutdown(scene) {
  hideGuide(this);
  scene.game.events.off('blur', scene.handleBlur);
  scene.game.events.off('focus', scene.handleFocus);
  scene.input.keyboard.off('keydown-ESC', scene.onEsc);
  scene.input.keyboard.off('keydown-R', scene.onRestart);
  scene.input.keyboard.off('keydown-T', scene.onTitle);
  scene.input.keyboard.off('keydown-M', scene.onMute);
  scene.input.keyboard.off('keydown-E', scene.onEdit);
  if (scene.editPointer) scene.input.off('pointerdown', scene.editPointer);
  scene.editPointer = null;
  if (scene.dashPointer) scene.input.off('pointerdown', scene.dashPointer);
  scene.dashPointer = null;
  scene.editUI?.destroy(true);
  scene.editUI = null;
  scene.editOpen = false;
  scene.touch?.destroy();
  scene.touch = null;
  window.removeEventListener('pointerdown', scene.panelPointerHandler);
  scene.time.removeAllEvents();
  scene.background?.destroy();
  scene.background = null;
  scene.encounterPanel.destroy();
  scene.hostileG.destroy();
  scene.summonG?.destroy();
  scene.summonAirG?.destroy();
  scene.summonG = null;
  scene.summonAirG = null;
  scene.hostileShots = [];
  scene.summons = [];
  for (const e of scene.enemies) e.destroy();
  for (const p of scene.projectiles) p.destroy();
  for (const s of scene.shards) s.destroy();
  for (const m of scene.expMotes) m.destroy();
  for (const p of scene.projectilePool?.free ?? []) p.destroy();
  for (const s of scene.shardPool?.free ?? []) s.destroy();
  for (const m of scene.expMotePool?.free ?? []) m.destroy();
  scene.enemies = [];
  scene.projectiles = [];
  scene.shards = [];
  if (window.__SIGILWEAVE_BATTLE__ === scene) window.__SIGILWEAVE_BATTLE__ = null;
}
