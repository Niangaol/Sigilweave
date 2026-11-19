// 控制效果：敌人路径 → 控制配置 → 玩家位移/眩晕/减速与飘字。
// 从 BattleScene 迁出（2026-11-19 架构重构收尾）。场景方法保留同名一行委托。
import { controlFor, CONTROL_DEFS, DEFAULT_CONTACT_CONTROL, DEFAULT_SHOT_CONTROL } from '../data/control.js';
import { fireGuide } from '../logic/guide.js';
import { C } from '../ui/Palette.js';

export function applyEnemyControl(scene, enemy, path, now) {
  if (!scene.player?.alive) return null;
  const defId = enemy?.defId ?? enemy?.def?.id ?? null;
  const cfg = controlFor(defId, path)
    ?? (path === 'contact' ? DEFAULT_CONTACT_CONTROL : null)
    ?? (path === 'shot' ? DEFAULT_SHOT_CONTROL : null);
  if (!cfg) return null;
  return scene.applyPlayerControl(cfg, enemy?.x ?? scene.player.x, enemy?.y ?? scene.player.y, now);
}


export function applyPlayerControl(scene, cfg, sx, sy, now) {
  const p = scene.player;
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
      const b = scene.worldBounds;
      p.x = Math.min(Math.max(p.x + (dx / len) * force, b.left + p.radius), b.right - p.radius);
      p.y = Math.min(Math.max(p.y + (dy / len) * force, b.top + p.radius), b.bottom - p.radius);
    }
    p.applyKnockStun(cfg.ms ?? 200, now);
    scene.effects?.impact?.(p.x, p.y, def?.color ?? C.bone, true);
  } else {
    p.applyControl(cfg.kind, cfg.ms ?? 400, now);
    if (cfg.kind === 'slow') p.slowFactor = cfg.factor ?? 0.6;
  }
  if (def) scene.effects?.labelPopup?.(p.x, p.y - 24, def.name, def.color, 12);
  // 新手引导 G17：第一次被硬控时教「右键冲刺能挣开」。眩晕（stun）故意不教——
  // 冲刺解不掉眩晕，给了提示只会让玩家白按一次 1.2s 冷却。
  if (cfg.kind !== 'stun') fireGuide(scene, scene.run, 'G17');
  return def?.name ?? null;
}

