// 敌方弹丸按形状绘制：bolt 3×3 方点 / orb 5×5 菱形 / homing 4×4 方点 + 反向尾迹。
// 从 BattleScene 迁出（2026-11-19 架构重构波 1）：模块级纯绘制，零场景依赖，
// updateHostileShots 的裸 ctx 测试（只给 graphics 替身）照常走绘制路径。全部硬边几何，零渐变零随机。
import { C, pxRect, pxDiamond } from './Palette.js';

export function drawHostileShot(g, shot) {
  const x = Math.round(shot.x);
  const y = Math.round(shot.y);
  if (shot.kind === 'orb') {
    pxDiamond(g, x, y, 2, C.blood, 1, true);
    pxDiamond(g, x, y, 1, C.arcaneLight, 0.9, true);
    return;
  }
  if (shot.kind === 'homing') {
    const speed = Math.hypot(shot.vx, shot.vy);
    if (speed > 1e-6) {
      const ux = shot.vx / speed;
      const uy = shot.vy / speed;
      for (let i = 1; i <= 3; i++) {
        const d = i * 4;
        pxRect(g, Math.round(x - ux * d) - 1, Math.round(y - uy * d) - 1, 2, 2, C.bloodDark, 0.55 - i * 0.13);
      }
    }
    pxRect(g, x - 2, y - 2, 4, 4, C.blood, 1);
    pxRect(g, x - 1, y - 1, 2, 2, C.arcaneLight, 1);
    return;
  }
  pxRect(g, x - 1, y - 1, 3, 3, C.blood, 1);
  pxRect(g, x, y, 1, 1, C.arcaneLight, 0.9);
}
