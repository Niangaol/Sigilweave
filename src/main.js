// 共振法阵 · 入口：注册全部场景。
// 逻辑画布恒为 480×270；画布与文字纹理按屏幕尺寸选择整数倍率渲染，避免大屏拉伸模糊。
// 各场景主摄像机 zoom = 倍率（见 ui/Palette.applyPixelZoom），可见世界仍是 480×270，游戏坐标一处不改。
// 注意：所有逻辑参数来自 src/logic/*（只读），这里只做表现与输入。
import Phaser from 'phaser';
import BootScene from './scenes/BootScene.js';
import TitleScene from './scenes/TitleScene.js';
import LoadoutScene from './scenes/LoadoutScene.js';
import BattleScene from './scenes/BattleScene.js';
import GameOverScene from './scenes/GameOverScene.js';
import IntermissionScene from './scenes/IntermissionScene.js';
import { setRenderScale } from './ui/Palette.js';

const BASE_W = 480;
const BASE_H = 270;
// 取窗口能容纳的最大整数倍率：1080p 得 4，1440p 得 5，4K 得 6（上限 8）。
// 整数倍率保证像素画不被半像素采样糊掉；窗口比例不符时由 FIT 留黑边。
const renderScale = Math.max(1, Math.min(8, Math.floor(Math.min(
  window.innerWidth / BASE_W,
  window.innerHeight / BASE_H,
))));
setRenderScale(renderScale);

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game-root',
  width: BASE_W * renderScale,
  height: BASE_H * renderScale,
  backgroundColor: '#0d0a17',
  pixelArt: true,
  roundPixels: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  render: {
    antialias: false,
    pixelArt: true,
    roundPixels: true,
  },
  scene: [BootScene, TitleScene, LoadoutScene, BattleScene, IntermissionScene, GameOverScene],
});

// 方便调试与验收时查看实例；不影响正式流程
window.__SIGILWEAVE__ = game;
