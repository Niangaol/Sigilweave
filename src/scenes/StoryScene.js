// src/scenes/StoryScene.js
// 全屏开场播放器：按分镜时间轴推进镜头，字幕淡入淡出，任意键/点击跳过（150ms 宽限）。
// 结尾走现有 playCutscene(boot)：标题页在覆盖层底下创建并冻结，揭开才放行——无缝交接复用已验收机制。
import Phaser from 'phaser';
import {
  HEX, addText, getRenderScale, isPortrait, CANVAS_H_PORTRAIT, BASE_W, BASE_H, FONT_DISPLAY,
} from '../ui/Palette.js';
import { buildOpeningTimeline, shotAt, canSkipStory } from '../data/story.js';
import { OPENING_STAGES, buildStars } from '../ui/story-art.js';
import { buildDust, drawDust, clamp01, easeOutCubic } from '../ui/cinematic-art.js';
import { playCutscene } from '../ui/transition.js';
import { startMusic, stopMusic, musicCue } from '../audio/CineMusic.js';
import { sfx } from '../audio/Sfx.js';

export default class StoryScene extends Phaser.Scene {
  constructor() {
    super({ key: 'StoryScene' });
  }

  init() {
    this.timeline = buildOpeningTimeline();
    this.elapsed = 0;
    this.shotIndex = -1;
    this.finished = false;
    this.skipped = false;
  }

  create() {
    const W = BASE_W;
    const H = isPortrait() ? CANVAS_H_PORTRAIT : BASE_H;
    this.W = W;
    this.H = H;
    const cam = this.cameras.main;
    cam.setZoom(getRenderScale());
    cam.centerOn(W / 2, H / 2);

    this.stageG = this.add.graphics().setDepth(0);
    this.dustG = this.add.graphics().setDepth(1);
    this.dust = buildDust(0x51c7, 40, W, H);
    this.stars = buildStars(0x9e37, 46, W, H);

    const tall = isPortrait();
    this.subtitle = addText(this, W / 2, Math.round(H * (tall ? 0.62 : 0.86)), '', tall ? 11 : 10, HEX.parchment, {
      align: 'center', wordWrap: { width: W - 80 }, lineSpacing: 4,
      stroke: '#0d0a17', strokeThickness: 2,
    }).setOrigin(0.5, 0).setDepth(2).setAlpha(0);

    this.titleText = addText(this, W / 2, Math.round(H * (tall ? 0.34 : 0.4)), '共振法阵', tall ? 40 : 34, HEX.parchment, {
      fontFamily: FONT_DISPLAY, letterSpacing: 8, stroke: '#0d0a17', strokeThickness: 3,
      shadow: { offsetX: 2, offsetY: 2, color: '#0d0a17', blur: 0, fill: true },
    }).setOrigin(0.5).setDepth(2).setAlpha(0);

    this.hint = addText(this, W / 2, H - 14, '任意键 / 点击 跳过', tall ? 9 : 8, HEX.mute, {})
      .setOrigin(0.5, 1).setDepth(2).setAlpha(0.7);

    this.input.keyboard.on('keydown', this.onSkip, this);
    this.input.on('pointerdown', this.onSkip, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.keyboard.off('keydown', this.onSkip, this);
      this.input.off('pointerdown', this.onSkip, this);
      stopMusic();
      this.publish('done');
    });
    startMusic('opening');
    this.publish('playing');
  }

  onSkip(event) {
    if (this.finished) return;
    if (event && event.type === 'keydown' && event.repeat) return;
    if (!canSkipStory(this.elapsed)) return;
    this.skipped = true;
    sfx.tick?.();
    this.finish();
  }

  finish() {
    if (this.finished) return;
    this.finished = true;
    stopMusic();
    this.publish('done');
    const handed = playCutscene(this, { kind: 'boot', to: 'TitleScene', payload: { __cine: true } });
    // 过场被禁用时 playCutscene 已直接切到标题；这里停掉自己即可
    if (!handed) this.scene.stop();
  }

  publish(phase) {
    window.__SIGILWEAVE_STORY__ = {
      phase,
      shot: this.timeline.shots[this.shotIndex]?.id ?? null,
      index: this.shotIndex,
      elapsed: Math.round(this.elapsed),
      totalMs: this.timeline.totalMs,
      skipped: this.skipped,
    };
  }

  update(time, delta) {
    if (this.finished) return;
    this.elapsed += Math.min(64, Number(delta) || 16);
    if (this.elapsed >= this.timeline.totalMs) {
      this.finish();
      return;
    }
    const cur = shotAt(this.elapsed, this.timeline);
    if (cur.index !== this.shotIndex) {
      this.shotIndex = cur.index;
      this.subtitle.setText(cur.shot.subtitle);
      musicCue(cur.shot.cue);
    }
    const accent = 0xc9a227;
    this.stageG.clear();
    OPENING_STAGES[cur.shot.stage](this.stageG, {
      w: this.W, h: this.H, t: cur.t, p: cur.p, accent, stars: this.stars,
    });
    this.dustG.clear();
    drawDust(this.dustG, this.dust, { h: this.H, t: this.elapsed, accent, alpha: 0.5 });

    const fadeIn = clamp01(cur.t / 500);
    const fadeOut = clamp01((cur.shot.ms - cur.t) / 500);
    this.subtitle.setAlpha(cur.shot.subtitle ? Math.min(fadeIn, fadeOut) : 0);
    this.titleText.setAlpha(cur.shot.id === 'title' ? easeOutCubic(clamp01((cur.p - 0.3) / 0.5)) : 0);
    this.publish('playing');
  }
}