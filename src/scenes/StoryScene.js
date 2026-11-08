// src/scenes/StoryScene.js
// 全屏分镜播放器：按时间轴推进镜头，字幕淡入淡出，任意键/点击跳过（150ms 宽限）。
// 两种模式：opening（开场→标题页）/ ending（结局→胜利结算）。
// 结尾走现有 playCutscene(boot)：目标在覆盖层底下创建并冻结，揭开才放行——无缝交接复用已验收机制。
import Phaser from 'phaser';
import {
  HEX, addText, getRenderScale, isPortrait, CANVAS_H_PORTRAIT, BASE_W, BASE_H, FONT_DISPLAY,
} from '../ui/Palette.js';
import { buildOpeningTimeline, buildEndingTimeline, shotAt, canSkipStory, STORY_MODES } from '../data/story.js';
import { OPENING_STAGES, ENDING_STAGES, buildStars } from '../ui/story-art.js';
import { buildDust, drawDust, clamp01, easeOutCubic } from '../ui/cinematic-art.js';
import { playCutscene, cutscenesDisabled } from '../ui/transition.js';
import { startMusic, stopMusic, musicCue } from '../audio/CineMusic.js';
import { sfx } from '../audio/Sfx.js';

export default class StoryScene extends Phaser.Scene {
  constructor() {
    super({ key: 'StoryScene' });
  }

  init(data = {}) {
    this.mode = data?.mode === 'ending' ? 'ending' : 'opening';
    this.modeConfig = STORY_MODES[this.mode];
    // 结局模式的结算数据：原样透传给 GameOverScene，两跳都不加工
    this.stats = data?.stats ?? null;
    this.timeline = this.mode === 'ending' ? buildEndingTimeline() : buildOpeningTimeline();
    this.elapsed = 0;
    this.shotIndex = -1;
    this.finished = false;
    this.skipped = false;
    this.musicStarted = false;
    this.handoffPending = false;
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
    this.stages = this.mode === 'ending' ? ENDING_STAGES : OPENING_STAGES;

    const tall = isPortrait();
    this.subtitle = addText(this, W / 2, Math.round(H * (tall ? 0.62 : 0.86)), '', tall ? 11 : 10, HEX.parchment, {
      align: 'center', wordWrap: { width: W - 80 }, lineSpacing: 4,
      stroke: '#0d0a17', strokeThickness: 2,
    }).setOrigin(0.5, 0).setDepth(2).setAlpha(0);

    this.titleText = addText(this, W / 2, Math.round(H * (tall ? 0.34 : 0.4)), this.mode === 'ending' ? '契约终结' : '共振法阵', tall ? 40 : 34, HEX.parchment, {
      fontFamily: FONT_DISPLAY, letterSpacing: 8, stroke: '#0d0a17', strokeThickness: 3,
      shadow: { offsetX: 2, offsetY: 2, color: '#0d0a17', blur: 0, fill: true },
    }).setOrigin(0.5).setDepth(2).setAlpha(0);

    // 结局名单：Text 对象不占 Graphics 绘制预算，滚动位置每帧整数像素更新
    this.creditLines = [];
    if (this.mode === 'ending') {
      const credits = this.timeline.shots.find(s => s.id === 'credits')?.credits ?? [];
      this.creditLines = credits.map((text, i) => addText(this, W / 2, 0, text,
        i === 0 ? (tall ? 40 : 34) : (tall ? 11 : 10), HEX.parchment, {
          fontFamily: i === 0 ? FONT_DISPLAY : undefined,
          letterSpacing: i === 0 ? 8 : 2, stroke: '#0d0a17', strokeThickness: 2,
        }).setOrigin(0.5, 0).setDepth(2).setAlpha(0));
    }

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
    // 开场直接起配乐；结局在覆盖层底下创建，create 里起了也会被 resumeTarget 的
    // stopMusic 杀掉——推迟到第一次 update（PAUSED 不跑 update，揭开后才启动）。
    if (this.mode === 'opening') startMusic('opening');
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
    this.handoff();
  }

  handoff() {
    const handoff = this.modeConfig.handoff;
    const payload = this.mode === 'ending' ? (this.stats ?? { __cine: true }) : { __cine: true };
    const handed = playCutscene(this, { kind: handoff.kind, to: handoff.to, payload });
    if (handed) return;
    // 过场被禁用时 playCutscene 已直接切到目标；这里停掉自己即可
    if (cutscenesDisabled()) { this.scene.stop(); return; }
    // 上一棒过场还在 reveal 收尾（isActive 仍 true）：交接被「已在过场中」守卫吞掉。
    // 不自停（否则没有任何场景活着，死锁），标记待交接，覆盖层停下后由 update 重试。
    this.handoffPending = true;
  }

  publish(phase) {
    window[this.modeConfig.publishKey] = {
      phase,
      shot: this.timeline.shots[this.shotIndex]?.id ?? null,
      index: this.shotIndex,
      elapsed: Math.round(this.elapsed),
      totalMs: this.timeline.totalMs,
      skipped: this.skipped,
    };
  }

  // 名单滚动：整块从屏幕底滚到屏幕顶；透明度按距中心带（0.35–0.55H）的距离分档，
  // 硬边阶梯不用渐变；位置取整保持像素纪律。
  updateCredits(cur) {
    if (!this.creditLines.length) return;
    const tall = isPortrait();
    const lineGap = tall ? 44 : 36;
    const n = this.creditLines.length;
    const span = this.H + 40 + (n - 1) * lineGap;
    const active = cur.shot.id === 'credits';
    const bandTop = this.H * 0.35, bandBottom = this.H * 0.55;
    this.creditLines.forEach((line, i) => {
      if (!active) { line.setAlpha(0); return; }
      const y = Math.round(this.H + 20 + i * lineGap - cur.p * span);
      const d = y < bandTop ? bandTop - y : y > bandBottom ? y - bandBottom : 0;
      line.setPosition(Math.round(this.W / 2), y);
      line.setAlpha(d <= 0 ? 1 : d < this.H * 0.12 ? 0.45 : 0);
    });
  }

  update(time, delta) {
    if (this.finished) {
      if (this.handoffPending && !this.scene.isActive('CutsceneScene')) {
        this.handoffPending = false;
        this.handoff();
      }
      return;
    }
    if (this.mode === 'ending' && !this.musicStarted) {
      this.musicStarted = true;
      startMusic(this.modeConfig.music);
    }
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
    this.stages[cur.shot.stage](this.stageG, {
      w: this.W, h: this.H, t: cur.t, p: cur.p, accent, stars: this.stars,
    });
    this.dustG.clear();
    drawDust(this.dustG, this.dust, { h: this.H, t: this.elapsed, accent, alpha: 0.5 });

    const fadeIn = clamp01(cur.t / 500);
    const fadeOut = clamp01((cur.shot.ms - cur.t) / 500);
    this.subtitle.setAlpha(cur.shot.subtitle ? Math.min(fadeIn, fadeOut) : 0);
    const titleShot = this.mode === 'ending' ? 'dawn' : 'title';
    this.titleText.setAlpha(cur.shot.id === titleShot ? easeOutCubic(clamp01((cur.p - 0.3) / 0.5)) : 0);
    this.updateCredits(cur);
    this.publish('playing');
  }
}