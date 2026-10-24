// 共振法阵 · 入口：注册全部场景。
// 逻辑画布恒为 480×270；画布与文字纹理按屏幕尺寸选择倍率渲染，避免大屏拉伸模糊。
// 竖屏（手机）时画布加高到 760：上 270 仍是地图视口，下 490 是放大的罗盘与触控台。
// 各场景主摄像机 zoom = 倍率（见 ui/Palette.applyPixelZoom），可见世界仍是 480×270，游戏坐标一处不改。
// 注意：所有逻辑参数来自 src/logic/*（只读），这里只做表现与输入。
import Phaser from 'phaser';
import BootScene from './scenes/BootScene.js';
import TitleScene from './scenes/TitleScene.js';
import LoadoutScene from './scenes/LoadoutScene.js';
import BattleScene from './scenes/BattleScene.js';
import GameOverScene from './scenes/GameOverScene.js';
import IntermissionScene from './scenes/IntermissionScene.js';
import { setRenderScale, setPortrait, setTouchUI, CANVAS_H_PORTRAIT, BASE_W, BASE_H } from './ui/Palette.js';

// 竖屏判定：高明显大于宽（含手机竖持与窄窗口）
const portrait = window.innerHeight > window.innerWidth * 1.02;
setPortrait(portrait);
setTouchUI(
  (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window,
);

const canvasH = portrait ? CANVAS_H_PORTRAIT : BASE_H;

// 倍率分两种口径：
// 放得下 2 倍（桌面常见）取能容纳的最大整数倍率——1080p 得 4，1440p 得 5，4K 得 6（上限 8）；
// 连 2 倍都放不下（手机横屏、小窗）走分数倍率 × 设备像素比（封顶 2）出图，
// 画布按 CSS 尺寸 FIT 缩放。分数倍率像素会有细微不均，但绝不模糊——好过被浏览器拉伸。
const fit = Math.min(window.innerWidth / BASE_W, window.innerHeight / canvasH);
const dpr = Math.min(window.devicePixelRatio || 1, 2);
const renderScale = fit >= 2
  ? Math.max(2, Math.min(8, Math.floor(fit)))
  : Math.max(0.5, Math.min(3, fit * dpr));
setRenderScale(renderScale);

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game-root',
  width: BASE_W * renderScale,
  height: canvasH * renderScale,
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

// 旋屏：罗盘几何与触控台按「横/竖」构建，模式变了只能重载（URL 栏伸缩不改模式，不会误触发）
let wasPortrait = portrait;
let reloadTimer = null;
const reloadIfFlipped = () => {
  const nowPortrait = window.innerHeight > window.innerWidth * 1.02;
  if (nowPortrait === wasPortrait) return;
  if (reloadTimer) clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => location.reload(), 150);
};
window.addEventListener('orientationchange', () => setTimeout(reloadIfFlipped, 200));
window.addEventListener('resize', reloadIfFlipped);
