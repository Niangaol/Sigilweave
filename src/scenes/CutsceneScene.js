// 过场覆盖层：盖住旧场景 → 在完全盖住时启动目标场景 → 目标场景在底下就绪并暂停 → 揭开。
// 设计约束：
//   1) 任何时刻画面上都有内容（底色是祭坛暗紫 + 当幕主题色，不是纯黑）；
//   2) 目标场景在揭开前已经 create 完成，杜绝「切场后闪一帧空场景」；
//   3) 转场期间旧场景暂停、新场景暂停，输入只用于跳过，不会穿透；
//   4) 全流程 0.9–1.6 秒，任意键/点击可跳过，跳过路径同样先换场再揭开。
import Phaser from 'phaser';
import {
  C, HEX, addText, pxRect, pxFrame, pxDiamond, getRenderScale, isPortrait,
  CANVAS_H_PORTRAIT, BASE_W, BASE_H, FONT_DISPLAY,
} from '../ui/Palette.js';
import { buildTimeline, phaseAt, skipResult, buildCard } from '../data/cinematics.js';
import {
  clamp01, easeInOutCubic, buildDust, drawVeil, drawDust,
} from '../ui/cinematic-art.js';
import { sfx } from '../audio/Sfx.js';
import { JOURNEYS } from '../data/story.js';
import { JOURNEY_STAGES, buildStars } from '../ui/story-art.js';
import { startMusic, stopMusic } from '../audio/CineMusic.js';
import { createChoreo } from '../ui/cutscene-choreo.js';

const hexOf = (value) => '#' + (Number(value) >>> 0).toString(16).padStart(6, '0').slice(-6);

export default class CutsceneScene extends Phaser.Scene {
  constructor() {
    super({ key: 'CutsceneScene', active: false, visible: false });
  }

  init(data = {}) {
    this.options = { kind: 'sigil', from: null, to: null, payload: {}, act: 1, report: null, ...data };
    this.timeline = buildTimeline(this.options.kind);
    this.elapsed = 0;
    this.swapped = false;
    this.targetReady = false;
    this.targetPaused = false;
    this.resumed = false;
    this.finished = false;
    this.skipped = false;
    this.pausedSource = false;
    this.lastPhase = null;
  }

  create() {
    const W = BASE_W;
    const H = isPortrait() ? CANVAS_H_PORTRAIT : BASE_H;
    this.W = W;
    this.H = H;
    this.cx = Math.round(W / 2);
    // 竖屏时标题卡放在上方地图区，别压住底部触控台
    this.cy = Math.round(H * (isPortrait() ? 0.4 : 0.5));

    const cam = this.cameras.main;
    cam.setZoom(getRenderScale());
    cam.centerOn(W / 2, H / 2);

    // 旧场景冻结：仍渲染，但不推进，避免转场的第一帧还在跑
    const from = this.options.from;
    if (from && this.scene.isActive(from) && !this.scene.isPaused(from)) {
      this.scene.pause(from);
      this.pausedSource = true;
    }

    this.veilG = this.add.graphics().setDepth(0);
    this.stageG = this.add.graphics().setDepth(1);
    this.sealG = this.add.graphics().setDepth(2);
    this.dustG = this.add.graphics().setDepth(3);
    // 加性辉光层：闪洪/合并核心等硬边亮色叠加，不参与遮罩
    this.fxG = this.add.graphics().setDepth(3).setBlendMode(Phaser.BlendModes.ADD);

    this.cardData = buildCard(this.options.kind, this.options.act, this.options.report);
    this.card = this.buildCardView(this.cardData);
    this.dust = buildDust(0x51c7 + this.options.act * 131, 44, W, H);
    // 每类过场的视觉编舞（状态机无关）；journey 走下方自有分支，返回 null
    this.choreo = createChoreo(this.options.kind, this.options.act);

    // journey：不压标题卡，改播单镜头演出 + 角标/字幕
    if (this.options.kind === 'journey') {
      this.journey = JOURNEYS[this.options.act] ?? JOURNEYS[2];
      this.stars = buildStars(0x9e37 + this.options.act, 46, W, H);
      const tall = isPortrait();
      this.jLabel = addText(this, 14, tall ? 14 : 12, this.journey.label, tall ? 9 : 8, hexOf(this.journey.accent), {
        letterSpacing: 2,
      }).setOrigin(0, 0).setDepth(4).setAlpha(0);
      this.jSubtitle = addText(this, this.cx, Math.round(H * (tall ? 0.6 : 0.84)), this.journey.subtitle, tall ? 11 : 10, HEX.parchment, {
        align: 'center', wordWrap: { width: W - 90 }, lineSpacing: 4,
        stroke: '#0d0a17', strokeThickness: 2,
      }).setOrigin(0.5, 0).setDepth(4).setAlpha(0);
      startMusic('journey');
    }

    this.input.keyboard.on('keydown', this.onSkipInput, this);
    this.input.on('pointerdown', this.onSkipInput, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.keyboard.off('keydown', this.onSkipInput, this);
      this.input.off('pointerdown', this.onSkipInput, this);
      stopMusic();
      window.__SIGILWEAVE_CUTSCENE__ = {
        kind: this.options.kind, phase: 'done', elapsed: Math.round(this.elapsed),
        duration: this.timeline.totalMs, from: this.options.from, to: this.options.to,
        skipped: this.skipped,
      };
    });

    // 保证覆盖层在目标场景之上；bringToTop 是幂等的，换场后再调一次更稳
    this.scene.bringToTop();
    // 旧的 resume 看门狗只允许服务自己这一层；新过场一开，旧狗自动停
    window.__SIGILWEAVE_CUTSCENE_OWNER__ = this;
    this.publish('cover');
    sfx.cineIn?.(this.options.kind);
  }

  // ---------- 卡片 ----------
  buildCardView(card) {
    if (!card) return null;
    const container = this.add.container(this.cx, this.cy).setDepth(4);
    const g = this.add.graphics();
    container.add(g);

    const accent = hexOf(card.accent);
    const compact = card.compact;
    // 竖屏画布会被 FIT 缩到约 0.8 倍，标题卡字号要相应放大，否则字幕读不清
    const tall = isPortrait();
    const eyebrowSize = tall ? 9 : 8;
    const titleSize = tall ? 28 : 26;
    const subtitleSize = tall ? 10 : 9;
    const hintSize = tall ? 8 : 7;
    const statLabelSize = tall ? 8 : 7;
    const statValueSize = tall ? 14 : 12;
    const halfW = compact ? 132 : 170;
    const top = compact ? -30 : -86;
    const bottom = compact ? 30 : (card.stats.length ? 110 : 62);
    const height = bottom - top;

    // 面板不能太透：符环与剪影会从字缝里穿出来，标题卡会显得脏
    pxRect(g, -halfW, top, halfW * 2, height, C.void, 0.78);
    pxRect(g, -halfW, top, halfW * 2, 1, C.brass, 0.55);
    pxRect(g, -halfW, bottom - 1, halfW * 2, 1, C.brass, 0.42);
    pxFrame(g, -halfW, top, halfW * 2, height, C.brassDark, 1, 0.75);
    for (const [x, y] of [[-halfW, top], [halfW - 3, top], [-halfW, bottom - 3], [halfW - 3, bottom - 3]]) {
      pxRect(g, x, y, 3, 3, C.brass, 0.8);
    }
    pxDiamond(g, 0, top, 3, card.accent, 0.9, true);
    pxDiamond(g, 0, bottom, 2, card.accent, 0.7, true);

    if (compact) {
      const title = addText(this, 0, -9, card.title, tall ? 17 : 15, HEX.parchment, {
        fontFamily: FONT_DISPLAY, letterSpacing: 3, stroke: HEX.inkDark, strokeThickness: 2,
      }).setOrigin(0.5, 0);
      container.add(title);
      container.titleText = title;
      container.titleBaseY = -9;
      return container;
    }

    const eyebrow = addText(this, 0, top + 12, card.eyebrow, eyebrowSize, accent, {
      letterSpacing: 2,
    }).setOrigin(0.5, 0);
    container.add(eyebrow);

    container.titleBaseY = top + 28;
    if (card.kind === 'act') {
      // 幕名拆单字，供编舞逐字砸落（≤4 字）；其余卡片用整块标题
      const chars = [...card.title];
      const charW = titleSize + 6;
      const startX = -((chars.length - 1) * charW) / 2;
      container.titleChars = chars.map((ch, i) => {
        const t = addText(this, startX + i * charW, top + 28, ch, titleSize, HEX.parchment, {
          fontFamily: FONT_DISPLAY, stroke: HEX.inkDark, strokeThickness: 3,
          shadow: { offsetX: 2, offsetY: 2, color: '#0d0a17', blur: 0, fill: true },
        }).setOrigin(0.5, 0).setAlpha(0);
        container.add(t);
        return t;
      });
    } else {
      const title = addText(this, 0, top + 28, card.title, titleSize, HEX.parchment, {
        fontFamily: FONT_DISPLAY, letterSpacing: 6, stroke: HEX.inkDark, strokeThickness: 3,
        shadow: { offsetX: 2, offsetY: 2, color: '#0d0a17', blur: 0, fill: true },
      }).setOrigin(0.5, 0);
      container.add(title);
      container.titleText = title;
    }

    const ruleY = top + 66;
    pxRect(g, -132, ruleY, 88, 1, C.brassDark, 0.9);
    pxRect(g, 44, ruleY, 88, 1, C.brassDark, 0.9);
    pxDiamond(g, 0, ruleY, 2, card.accent, 0.85, true);

    const subtitle = addText(this, 0, top + 78, card.subtitle, subtitleSize, HEX.parchment, {
      align: 'center', wordWrap: { width: halfW * 2 - 28 }, lineSpacing: 4,
    }).setOrigin(0.5, 0);
    container.add(subtitle);

    if (card.stats.length) {
      const cols = card.stats.length;
      const startX = -((cols - 1) * 84) / 2;
      container.statBaseY = bottom - 46;
      container.statValues = [];
      card.stats.forEach((stat, i) => {
        const x = startX + i * 84;
        const label = addText(this, x, bottom - 58, stat.label, statLabelSize, HEX.mute, { align: 'center' })
          .setOrigin(0.5, 0);
        const value = addText(this, x, bottom - 46, stat.value, statValueSize, HEX.brassLight, { align: 'center' })
          .setOrigin(0.5, 0);
        container.add(label); container.add(value);
        container.statValues.push(value);
      });
    }

    const hint = addText(this, 0, bottom - 14, card.hint, hintSize, HEX.mute, { align: 'center' })
      .setOrigin(0.5, 0);
    container.add(hint);
    return container;
  }

  // ---------- 换场 ----------
  swapScenes() {
    if (this.swapped) return;
    this.swapped = true;
    const { from, to, payload } = this.options;
    if (!to) return;

    if (from && (this.scene.isActive(from) || this.scene.isPaused(from))) this.scene.stop(from);

    const target = this.scene.get(to);
    this.targetReady = false;
    if (target) {
      target.events.once(Phaser.Scenes.Events.CREATE, () => {
        this.targetReady = true;
        // 目标 create 完成后先冻结；揭开时再放行，避免标题卡停留期间战斗/输入抢先开始
        this.time.delayedCall(0, () => this.freezeTarget());
      });
    }

    if (this.scene.isActive(to)) this.scene.stop(to);
    this.scene.launch(to, payload ?? {});
    this.scene.bringToTop();
    // 兜底：目标场景若因异常没有派发 create，也不要把玩家永远锁在覆盖层里
    this.time.delayedCall(1500, () => { if (!this.targetReady && !this.finished) this.targetReady = true; });
    sfx.cineSwap?.();
  }

  freezeTarget() {
    const { to } = this.options;
    // 跳过路径可能在目标 create 的同一帧就进入揭开；此时不能再补一次暂停
    if (!to || this.finished || this.resumed || this.elapsed >= this.timeline.revealAt) return;
    if (this.scene.isActive(to) && !this.scene.isPaused(to)) {
      this.scene.pause(to);
      this.targetPaused = true;
    }
  }

  resumeTarget() {
    if (this.resumed) return;
    this.resumed = true;
    const { to } = this.options;
    if (!to) return;
    // 不能只看 isPaused：pause 是排队操作，跳过时 pause 可能尚未生效。
    // 这里直接排一个 resume，并用短计时器补几次，保证最终状态一定是运行。
    if (this.scene.isActive(to)) this.scene.resume(to);
    this.targetPaused = false;
    this.ensureTargetRunning();
    stopMusic();
    sfx.cineReveal?.(this.options.kind);
  }

  // SceneManager 的 pause/resume 是排队操作：如果 resume 先于 pause 落地，
  // 目标会永久停在暂停态（跳过路径实测踩到）。用与场景生命周期无关的短计时器兜底，
  // 连续补 resume 约 400ms，直到目标真正运行。
  ensureTargetRunning() {
    const to = this.options.to;
    if (!to) return;
    const manager = this.scene.manager;
    let attempts = 0;
    const owner = this;
    const tick = () => {
      if (!manager || attempts++ > 12) return;
      if (window.__SIGILWEAVE_CUTSCENE_OWNER__ && window.__SIGILWEAVE_CUTSCENE_OWNER__ !== owner) return;
      if (manager.isPaused(to)) manager.resume(to);
      setTimeout(tick, 32);
    };
    setTimeout(tick, 0);
  }

  finish() {
    if (this.finished) return;
    this.finished = true;
    this.resumeTarget();
    this.ensureTargetRunning();
    this.publish('done');
    this.scene.stop();
  }

  // ---------- 输入 ----------
  onSkipInput(event) {
    if (this.finished) return;
    if (event && event.type === 'keydown' && event.repeat) return;
    const result = skipResult(this.elapsed, this.timeline, this.swapped);
    if (!result.allowed) return;
    this.skipped = true;
    this.elapsed = result.elapsed;
    sfx.tick?.();
    if (result.action === 'finish') this.finish();
  }

  publish(phase) {
    this.lastPhase = phase;
    window.__SIGILWEAVE_CUTSCENE__ = {
      kind: this.options.kind,
      phase,
      elapsed: Math.round(this.elapsed),
      duration: this.timeline.totalMs,
      from: this.options.from,
      to: this.options.to,
      act: this.options.act,
      swapped: this.swapped,
      targetReady: this.targetReady,
      skipped: this.skipped,
    };
  }

  // ---------- 每帧 ----------
  update(time, delta) {
    if (this.finished) return;
    const tl = this.timeline;
    this.elapsed += Math.min(64, Number(delta) || 16);

    if (this.elapsed >= tl.coverMs && !this.swapped) this.swapScenes();
    // 目标场景还没 create 完就卡在揭开起点，保持满覆盖，不暴露空帧
    if (!this.targetReady && this.elapsed > tl.revealAt) this.elapsed = tl.revealAt;

    const phase = phaseAt(this.elapsed, tl);
    const cover = phase.phase === 'cover' ? phase.p
      : phase.phase === 'hold' ? 1
        : phase.phase === 'reveal' ? 1 - phase.p : 0;
    const veil = easeInOutCubic(cover);

    const accent = this.cardData?.accent ?? this.journey?.accent ?? 0xc9a227;
    const tint = this.cardData?.tint ?? this.journey?.tint ?? 0x241c3a;
    const kind = this.options.kind;

    drawVeil(this.veilG, { w: this.W, h: this.H, cover, tint, kind });

    // journey：hold 阶段是单镜头演出，不画中央符环与标题卡
    if (kind === 'journey' && this.journey) {
      const jt = Math.max(0, this.elapsed - tl.coverMs);
      const jp = clamp01(jt / tl.holdMs);
      this.stageG.clear();
      JOURNEY_STAGES[this.journey.stage](this.stageG, {
        w: this.W, h: this.H, t: jt, p: jp, accent, stars: this.stars,
      });
      this.dustG.clear();
      drawDust(this.dustG, this.dust, { h: this.H, t: this.elapsed, accent, alpha: veil });
      const ta = clamp01((veil - 0.55) / 0.45);
      this.jLabel.setAlpha(ta);
      this.jSubtitle.setAlpha(ta);
      if (this.elapsed >= tl.revealAt && this.targetReady) this.resumeTarget();
      if (this.lastPhase !== phase.phase) this.publish(phase.phase);
      if (this.elapsed >= tl.totalMs) this.finish();
      else this.publish(phase.phase);
      return;
    }

    // 视觉全部交给每类编舞（舞台/符环/浮尘/卡片动效 + 大胆层）；状态机 below 不变
    this.choreo.draw(this, { phase, veil, accent, tint, elapsed: this.elapsed, tl });

    // 目标场景没就绪前绝不揭开/放行；提前 resume 会让随后 freezeTarget 把目标永久暂停（跳过路径曾踩到）
    if (this.elapsed >= tl.revealAt && this.targetReady) this.resumeTarget();

    if (this.lastPhase !== phase.phase) this.publish(phase.phase);

    if (this.elapsed >= tl.totalMs) {
      this.finish();
    } else {
      this.publish(phase.phase);
    }
  }
}
