// 启动场景：按《美术素材交付规范 v1.0》预加载全部角色素材并注册动画。
// 之前“无外部资源”的注释已作废——素材现位于 public/assets/，构建时随 Vite 拷贝。
import Phaser from 'phaser';
import { applyPixelZoom } from '../ui/Palette.js';
import { playCutscene, cutscenesDisabled } from '../ui/transition.js';

// 精灵表：key 与文稿参数总表一致；frameWidth/Height 即文稿规定的单帧像素尺寸
// 2026-11 美术升级包：三张精灵表统一为 64×56 / 12 帧（原 32/28/30px）
const SPRITE_SHEETS = {
  player:   { url: 'assets/sprites/player_sheet.png',   frameWidth: 64, frameHeight: 56 },
  skeleton: { url: 'assets/sprites/skeleton_sheet.png', frameWidth: 64, frameHeight: 56 },
  corpse:   { url: 'assets/sprites/corpse_sheet.png',   frameWidth: 64, frameHeight: 56 },
};

// 单帧图：怪物与特效
const SPRITE_IMAGES = {
  // 旧素材保留作兜底；新美术包用 imp / skeleton_mage 等替换主要怪物立绘
  undead_bat: 'assets/sprites/undead_bat.png',
  gargoyle: 'assets/sprites/gargoyle.png',
  cultist: 'assets/sprites/cultist.png',
  ghoul: 'assets/sprites/ghoul.png',
  death_knight: 'assets/sprites/death_knight.png',
  lesser_demon: 'assets/sprites/lesser_demon.png',
  lich: 'assets/sprites/lich.png',
  imp: 'assets/sprites/imp.png',
  skeleton_mage: 'assets/sprites/skeleton_mage.png',
  stone_gargoyle: 'assets/sprites/stone_gargoyle.png',
  crystal_dryad: 'assets/sprites/crystal_dryad.png',
  clockwork_doll: 'assets/sprites/clockwork_doll.png',
  void_elemental: 'assets/sprites/void_elemental.png',
  wraith: 'assets/sprites/wraith.png',
  rune_spider: 'assets/sprites/rune_spider.png',
  brass_warden: 'assets/sprites/brass_warden.png',
  boss_gargoyle: 'assets/sprites/boss_gargoyle.png',
  boss_ghoul: 'assets/sprites/boss_ghoul.png',
  boss_skeleton_mage: 'assets/sprites/boss_skeleton_mage.png',
  boss_death_knight: 'assets/sprites/boss_death_knight.png',
  boss_wraith: 'assets/sprites/boss_wraith.png',
  boss_void: 'assets/sprites/boss_void.png',
  boss_library_mini: 'assets/sprites/boss_library_mini.png',
  boss_library_final: 'assets/sprites/boss_library_final.png',
  boss_court_mini: 'assets/sprites/boss_court_mini.png',
  boss_court_final: 'assets/sprites/boss_court_final.png',
  boss_forge_mini: 'assets/sprites/boss_forge_mini.png',
  boss_forge_final: 'assets/sprites/boss_forge_final.png',
  boss_dawn_mini: 'assets/sprites/boss_dawn_mini.png',
  boss_dawn_final: 'assets/sprites/boss_dawn_final.png',
  // 第 4-7 幕专属敌人
  ink_wisp: 'assets/sprites/ink_wisp.png',
  page_golem: 'assets/sprites/page_golem.png',
  index_hound: 'assets/sprites/index_hound.png',
  verdict_wraith: 'assets/sprites/verdict_wraith.png',
  shackle_guard: 'assets/sprites/shackle_guard.png',
  scale_arbiter: 'assets/sprites/scale_arbiter.png',
  slag_beast: 'assets/sprites/slag_beast.png',
  ember_imp: 'assets/sprites/ember_imp.png',
  anvil_tyrant: 'assets/sprites/anvil_tyrant.png',
  dawn_shade: 'assets/sprites/dawn_shade.png',
  stardust_knight: 'assets/sprites/stardust_knight.png',
  eclipse_priest: 'assets/sprites/eclipse_priest.png',
  floor_act1: 'assets/textures/floor_act1.png',
  floor_act2: 'assets/textures/floor_act2.png',
  floor_act3: 'assets/textures/floor_act3.png',
  floor_act4: 'assets/textures/floor_act4.png',
  floor_act5: 'assets/textures/floor_act5.png',
  floor_act6: 'assets/textures/floor_act6.png',
  floor_act7: 'assets/textures/floor_act7.png',
  title_wall: 'assets/ui/title_wall.png',
  hero_title: 'assets/ui/hero_title.png',
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
    const params = new URLSearchParams(window.location.search);
    // 调试/压测/调试直达保持原路径；正常路径先播全屏开场，再由开场交接标题
    if (cutscenesDisabled() || params.get('scene')) {
      playCutscene(this, { kind: 'boot', to: 'TitleScene', payload: { __cine: true } });
      return;
    }
    this.scene.start('StoryScene');
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
