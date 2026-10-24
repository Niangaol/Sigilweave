// 启动场景：按《美术素材交付规范 v1.0》预加载全部角色素材并注册动画。
// 之前“无外部资源”的注释已作废——素材现位于 public/assets/，构建时随 Vite 拷贝。
import Phaser from 'phaser';
import { applyPixelZoom } from '../ui/Palette.js';

// 精灵表：key 与文稿参数总表一致；frameWidth/Height 即文稿规定的单帧像素尺寸
const SPRITE_SHEETS = {
  player:   { url: 'assets/sprites/player_sheet.png',   frameWidth: 32, frameHeight: 32 },
  skeleton: { url: 'assets/sprites/skeleton_sheet.png', frameWidth: 28, frameHeight: 28 },
  corpse:   { url: 'assets/sprites/corpse_sheet.png',   frameWidth: 30, frameHeight: 30 },
};

// 单帧图：怪物与特效
const SPRITE_IMAGES = {
  undead_bat: 'assets/sprites/undead_bat.png',
  gargoyle: 'assets/sprites/gargoyle.png',
  cultist: 'assets/sprites/cultist.png',
  ghoul: 'assets/sprites/ghoul.png',
  death_knight: 'assets/sprites/death_knight.png',
  lesser_demon: 'assets/sprites/lesser_demon.png',
  lich: 'assets/sprites/lich.png',
  rune_shard: 'assets/effects/rune_shard.png',
  attack_warning: 'assets/effects/attack_warning.png',
};

// 12 帧横排的帧段约定（与素材表的姿势顺序一致）：
//   玩家   0-3 待机 / 4-6 行走 / 7 冲刺 / 8-11 受击
//   骷髅   0-3 待机 / 4-7 行走 / 8-9 挥剑 / 10-11 倒地死亡
//   腐尸   0-3 待机 / 4-7 缓行 / 8-9 攻击 / 10-11 腐化死亡
const ANIM_DEFS = [
  ['player-idle',   'player',   [0, 1, 2, 3], 4, -1],
  ['player-walk',   'player',   [4, 5, 6],    8, -1],
  ['player-dash',   'player',   [7],          1, -1],
  ['player-hurt',   'player',   [8, 9, 10],   12, 0],
  ['skeleton-idle', 'skeleton', [0, 1, 2, 3], 4, -1],
  ['skeleton-walk', 'skeleton', [4, 5, 6, 7], 6, -1],
  ['skeleton-attack', 'skeleton', [8, 9],     10, 0],
  ['skeleton-death',  'skeleton', [10, 11],   8, 0],
  ['corpse-idle',   'corpse',   [0, 1, 2, 3], 3, -1],
  ['corpse-walk',   'corpse',   [4, 5, 6, 7], 4, -1],
  ['corpse-attack', 'corpse',   [8, 9],       6, 0],
  ['corpse-death',  'corpse',   [10, 11],     6, 0],
];

export default class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload() {
    for (const [key, cfg] of Object.entries(SPRITE_SHEETS)) {
      this.load.spritesheet(key, cfg.url, { frameWidth: cfg.frameWidth, frameHeight: cfg.frameHeight });
    }
    for (const [key, url] of Object.entries(SPRITE_IMAGES)) {
      this.load.image(key, url);
    }
  }

  create() {
    this.createAnims();
    applyPixelZoom(this);
    this.cameras.main.setBackgroundColor('#0d0a17');
    this.scene.start('TitleScene');
  }

  // 动画只注册一次；素材缺失（textures.exists=false）时跳过对应动画，
  // 实体层据此自动降级为程序化绘制，不会因素材未就位而崩。
  createAnims() {
    for (const [key, tex, frames, frameRate, repeat] of ANIM_DEFS) {
      if (!this.textures.exists(tex) || this.anims.exists(key)) continue;
      this.anims.create({
        key,
        frames: this.anims.generateFrameNumbers(tex, { frames }),
        frameRate,
        repeat,
      });
    }
  }
}
