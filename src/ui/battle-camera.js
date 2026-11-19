// 战斗取景：视口矩形、Boss 抬头量的夹紧、跟随复位。
// 从 BattleScene 迁出（2026-11-19 架构重构波 1），行为逐行复制，只把 this 换成 scene。
import { isPortrait } from './Palette.js';
import {
  bossFrameOffset, clampFollowOffset, playerVisible, DEFAULT_DEADZONE_H,
} from './boss-framing.js';

// 镜头取景：横屏把跟随中心上抬一点，人物略低于屏幕中心，多露上方战场与来袭方向。
// 死区高 40，半高 20 会吃掉一半偏移，所以这里给 50 → 实际净上抬约 30px。
// 竖屏沿用 190 的专用偏移（人物落在地图区中上部，下方留给触控台），不再叠加。
const CAMERA_LIFT = 50;
const PORTRAIT_FOLLOW_Y = 190;
export const followBaseY = () => (isPortrait() ? PORTRAIT_FOLLOW_Y : CAMERA_LIFT);

export function viewRect(scene) {
  const v = scene.cameras?.main?.worldView;
  if (v && Number.isFinite(v.x) && Number.isFinite(v.y) && v.width > 0 && v.height > 0) {
    return { x: v.x, y: v.y, w: v.width, h: v.height };
  }
  return { x: scene.player.x - 240, y: scene.player.y - 135, w: 480, h: 270 };
}

// Boss 战取景：每帧按 Boss 头顶需要多少抬头量，再夹在玩家安全线以内。
// 不这么做的话，跟随偏移会把玩家顶到画面下沿外（见 ui/boss-framing.js 的注释）。
export function updateBossCamera(scene) {
  const cam = scene.cameras?.main;
  const base = followBaseY();
  const view = viewRect(scene);
  const boss = scene.boss && scene.boss.alive ? scene.boss : null;
  let offset = base;
  if (boss) {
    const displayH = boss.sprite?.displayHeight ?? 0;
    const bossTop = boss.y + 21 - displayH;   // BOSS_FEET = 21
    offset = bossFrameOffset({
      viewH: view.h,
      deadzoneH: DEFAULT_DEADZONE_H,
      baseOffset: base,
      playerY: scene.player.y,
      bossTop,
      hudBottom: 40,
    }).offset;
  }
  scene.followOffsetY = offset;
  // 只在真的变了才写相机，避免每帧触发 Phaser 内部的脏标记
  if (scene.appliedFollowOffset !== offset) {
    scene.appliedFollowOffset = offset;
    cam?.setFollowOffset?.(0, offset);
  }
  // 兜底：偏移/死区再怎么算，玩家掉出画面就立刻把镜头拉回来
  if (!playerVisible(scene.player, view, 6)) {
    scene.playerOffViewMs = (scene.playerOffViewMs ?? 0) + 16;
    if (scene.playerOffViewMs > 120) {
      scene.playerOffViewMs = 0;
      cam?.centerOn?.(scene.player.x, scene.player.y - offset);
    }
  } else {
    scene.playerOffViewMs = 0;
  }
}

export function resumeFollow(scene, offsetY = 0) {
  scene.cameras.main.startFollow(scene.player, true, 0.12, 0.12);
  scene.cameras.main.setDeadzone(60, DEFAULT_DEADZONE_H);
  // 基准取景 + Boss 战临时上抬，但整体夹在「玩家安全线」以内：
  // 横屏 50 + 80 = 130 的旧值会把玩家推到 270 高视口的 y≈265，肉眼已经掉出画面。
  const base = followBaseY();
  const view = viewRect(scene);
  const total = clampFollowOffset(base + offsetY, view.h, DEFAULT_DEADZONE_H);
  scene.followOffsetY = total;
  scene.appliedFollowOffset = total;
  scene.cameras.main.setFollowOffset(0, total);
}
