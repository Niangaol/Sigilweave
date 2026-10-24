// 启动场景：无外部资源需要加载，直接进入标题页。
// 保留这一层是为了后续接入图集/音频时不必改动 main.js。
import Phaser from 'phaser';
import { applyPixelZoom } from '../ui/Palette.js';

export default class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  create() {
    applyPixelZoom(this);
    this.cameras.main.setBackgroundColor('#0d0a17');
    this.scene.start('TitleScene');
  }
}
