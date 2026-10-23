// 共振法阵 · 入口：注册四个场景，固定 480×270 像素画布。
// 注意：所有逻辑参数来自 src/logic/*（只读），这里只做表现与输入。
import Phaser from 'phaser';
import BootScene from './scenes/BootScene.js';
import TitleScene from './scenes/TitleScene.js';
import BattleScene from './scenes/BattleScene.js';
import GameOverScene from './scenes/GameOverScene.js';
import IntermissionScene from './scenes/IntermissionScene.js';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game-root',
  width: 480,
  height: 270,
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
  scene: [BootScene, TitleScene, BattleScene, IntermissionScene, GameOverScene],
});

// 方便调试与验收时查看实例；不影响正式流程
window.__SIGILWEAVE__ = game;
