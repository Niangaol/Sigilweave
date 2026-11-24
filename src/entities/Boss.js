import { C, pxRect, pxLine, pxDiamond, pxRing } from '../ui/Palette.js';
import { createBossModel, stepBoss, bossStats } from '../logic/boss.js';
import { BREAK_WINDOW_MS, PHASE_SHIFT_MS, BOSS_BARS, bossPhaseFor, bossPhaseStyleFor } from '../data/boss-phases.js';
import { shakeCamera } from '../ui/camera-shake.js';

// 每场小 Boss / 场 Boss 各一张专属立绘；脚底仍对齐 y+21。
// 场 4-7 是 2026-11-11 新画的八张专属立绘，不再复用前三场素材
// （五幕七场下它们分属幕 4 的场 4/5 与幕 5 的场 6/7）。
const BOSS_TEXTURE = {
  mini: {
    1: 'boss_gargoyle', 2: 'boss_ghoul', 3: 'boss_skeleton_mage',
    4: 'boss_library_mini', 5: 'boss_court_mini', 6: 'boss_forge_mini', 7: 'boss_dawn_mini',
  },
  final: {
    1: 'boss_death_knight', 2: 'boss_wraith', 3: 'boss_void',
    4: 'boss_library_final', 5: 'boss_court_final', 6: 'boss_forge_final', 7: 'boss_dawn_final',
  },
};
const BOSS_DISPLAY_HEIGHT = { mini: 72, final: 104 };
const BOSS_FEET = 21;

export default class Boss {
  constructor(scene, definition, stage, id) {
    this.scene = scene; this.definition = definition; this.id = id; this.isBoss = true;
    this.x = 240; this.y = 72; this.radius = 14;
    // 强度按场递增（场 1..7），与幕的叙事划分无关；场 Boss 比小 Boss 更硬一档（×1.35 血、5% 额外减伤）。
    const stats = bossStats(stage, definition?.tier);
    this.hp = this.maxHp = stats.hp;
    // 多管血：一管血 = 一个阶段。打空当前管不死亡，回满进入下一管（见 enterNextBar）。
    this.bar = 0; this.barMax = BOSS_BARS;
    this.phaseStyle = bossPhaseStyleFor(stage);
    // Boss 专属固定减伤：直接复用敌人的 armor 通道（applyDamage 里按 (1 - armor) 结算）。
    this.armor = stats.armor;
    // 破防窗口里护甲临时失效：原值存 baseArmor，退出窗口时还原（B4）。
    this.baseArmor = stats.armor;
    this.alive = true; this.rewarded = false; this.damage = 12; this.hitAt = -9999;
    this.model = createBossModel(stage);
    this.g = scene.add.graphics().setDepth(200);
    // 素材精灵：按场与 tier 选立绘；统一缩放到 72px（小 Boss）/ 104px（场 Boss）
    const tierKey = definition?.tier === 'mini' ? 'mini' : 'final';
    const safeStage = [1, 2, 3, 4, 5, 6, 7].includes(Number(stage)) ? Number(stage) : 1;
    const texKey = BOSS_TEXTURE[tierKey][safeStage];
    this.sprite = scene.textures?.exists(texKey) && typeof scene.add?.sprite === 'function'
      ? scene.add.sprite(Math.round(this.x), Math.round(this.y) + BOSS_FEET, texKey).setOrigin(0.5, 1)
      : null;
    if (this.sprite) {
      const h = this.sprite.frame.height || this.sprite.height || 1;
      const w = this.sprite.frame.width || this.sprite.width || 1;
      const target = BOSS_DISPLAY_HEIGHT[tierKey];
      this.sprite.setDisplaySize(Math.round(w * target / h), target);
    }
    // 素材预警条（attack_warning.png）：Boss 读条时平铺在落点地面，兑现素材交付用途
    this.warningSprite = scene.textures?.exists('attack_warning') && typeof scene.add?.image === 'function'
      ? scene.add.image(0, 0, 'attack_warning').setOrigin(0.5, 0.5).setVisible(false).setDepth(860)
      : null;
    if (this.sprite) this.sprite.setDepth(Math.floor(this.y));
    this.draw(0);
  }
  update(dtMs, now) {
    if (!this.alive) return;
    const p = this.scene.player;
    const dx = p.x - this.x, dy = p.y - this.y, d = Math.hypot(dx, dy);
    let factor = now < (this.slowUntil ?? 0) ? (this.slowFactor ?? 1) : 1;
    if (this.scene.grid.cells.some(c => c.unlocked && c.slot?.defId === 'slow_field') && d <= 90) factor = Math.min(factor, 0.6);
    if (now < (this.rootUntil ?? 0)) factor = 0;
    if (d > 55 && this.model.windupLeft <= 0 && !(this.model.shiftLeft > 0)) {
      this.x += dx / d * 14 * factor * dtMs / 1000;
      this.y += dy / d * 14 * factor * dtMs / 1000;
    }
    const W = this.scene.world ?? { w: 480, h: 270 };
    // 大体型 Boss 不能只按旧 32px 美术的 y=42 下限：否则 72/104px 立绘会顶出 HUD/画面。
    const minY = 42 + (this.sprite?.displayHeight ?? 0) - BOSS_FEET;
    this.x = Math.max(28, Math.min(W.w - 28, this.x));
    this.y = Math.max(minY, Math.min(W.h - 28, this.y));
    // mode / phase 都在下一步的 stepBoss 里翻转，所以「上一帧的值」要先存：
    // 放在调用之后存就永远等于当前值，边沿检测失效。
    const lastMode = this.model.mode;
    const lastPhase = this.model.phase;
    for (const shot of stepBoss(this.model, dtMs, this, p, { hpRatio: this.hp / this.maxHp })) this.scene.addHostileShot(shot);
    const nowMs = Number.isFinite(now) ? now : (this.scene?.engine?.now ?? 0);
    // 破防窗口（B4）：起点由场景层在 mode 边沿写一次，长度 BREAK_WINDOW_MS。
    // 不能每帧覆写 now + 1200——那会把窗口无限续下去，Boss 等于永久破防。
    if (this.model.mode === 'break' && lastMode !== 'break') {
      this.breakUntil = nowMs + BREAK_WINDOW_MS;
      // 曾经的 breakFxAt 是零读取死字段（金环读 breakUntil、弹字只播一次），已删。
    }
    // 破防期间护甲归零（原值存 baseArmor）：窗口内只吃 ×1.2 却仍被 30% 减伤挡掉的话，
    // 玩家在窗口里看不出任何反馈，「乘虚而入」就白设计了。
    if (this.model.mode === 'break') {
      if (this.armor !== 0) { this.baseArmor = this.armor; this.armor = 0; }
    } else if (this.baseArmor !== undefined && this.armor === 0) {
      this.armor = this.baseArmor;
    }
    // ---------- B6 一次性演出：全部走边沿触发，不每帧重放 ----------
    // 转阶段按 phase 判而不是按 mode 判：boss.js 的阶段推进会把 mode 打回 'aim'，
    // 于是 shiftLeft 那 900ms 里 mode 一直是 aim，只比 mode 会整场漏掉换招演出。
    // 首帧 model.phase 还是 undefined（stepBoss 首次调用才补 0），那一下不是换招，
    // 不演出：否则每只 Boss 一登场就白炸一次三层 burst + 震屏。
    if (Number.isFinite(lastPhase) && this.model.phase !== lastPhase) {
      this.tintColor = C.brassLight; this.tintUntil = nowMs + 260;
      shakeCamera(this.scene, 'phase', 260, 0.005);
      // 三层 burst 由内向外炸开：血(内) → 黄铜(中) → 骨白(外)，读作「换招」而不是「受伤」
      this.scene.effects?.burst?.(this.x, this.y, C.blood, 12);
      this.scene.effects?.burst?.(this.x, this.y, C.brass, 16);
      this.scene.effects?.burst?.(this.x, this.y, C.white, 20);
    }
    if (this.model.mode === 'ultimate' && lastMode !== 'ultimate') {
      // 大招起手：染一层 arcane + 收拢一圈火花，给读条窗一个明确的起点
      this.tintColor = C.arcane; this.tintUntil = nowMs + 300;
      this.scene.effects?.burst?.(this.x, this.y, C.arcaneLight, 14);
    }
    if (this.model.mode === 'break' && lastMode !== 'break') {
      // 破防：金环 + 弹字。窗口内护甲已经归零，再不给画面提示，玩家只会以为伤害变高了
      this.scene.effects?.labelPopup?.(this.x, this.y - 30, '破防', C.brassLight, 10);
      this.scene.effects?.burst?.(this.x, this.y, C.brassLight, 10);
    }
    this.draw(now);
    this.g.setDepth(Math.floor(this.y) + 0.5);
    if (this.sprite) this.sprite.setDepth(Math.floor(this.y));
  }
  // 打空当前血条：回满并进入下一阶段。返回阶段外观（名字 + 主色），
  // 场景层用它做横幅演出；已经是最后一管时返回 null，由场景走正常死亡结算。
  enterNextBar() {
    const max = Number.isFinite(this.barMax) ? this.barMax : 1;
    if ((this.bar ?? 0) >= max - 1) return null;
    this.bar = (this.bar ?? 0) + 1;
    this.hp = this.maxHp;
    this.alive = true;
    this.model.phase = this.bar;
    this.model.mode = 'aim';
    this.model.modeLeft = 0;
    this.model.windupLeft = 0;
    this.model.shiftLeft = PHASE_SHIFT_MS;   // 转阶段冻结：900ms 内不出手
    this.model.ultIn = Math.min(4000, bossPhaseFor(this.bar).ultEveryMs);
    this.breakUntil = 0;
    if (Number.isFinite(this.baseArmor)) this.armor = this.baseArmor;
    this.phaseStyle = bossPhaseStyleFor(this.model.act);
    return this.phaseStyle;
  }

  draw(now) {
    const x = Math.round(this.x), y = Math.round(this.y), flash = now - this.hitAt < 100;
    const g = this.g; g.clear();
    // 阶段 2 常驻光环：按场配色、1px 脉动。它是「这只 Boss 已经换过招」最持久的视觉信号，
    // 比一次性 burst 更长命，也不依赖血条（玩家视线常在中下部）。
    if (Number.isFinite(this.model.phase) && this.model.phase >= 1) {
      const style = this.phaseStyle ?? bossPhaseStyleFor(this.model.act);
      const k = 0.5 + 0.5 * Math.sin(now / 260);
      pxRing(g, x, y - 12, Math.round(28 + 5 * k), style.color, 0.22 + 0.16 * k, 1);
      pxRing(g, x, y - 12, Math.round(22 + 3 * k), style.color, 0.14 + 0.12 * k, 1);
    }
    // 破防窗口金环（B6）：窗口内 Boss 身上套一圈由外向内收的黄铜双环。
    // 破防的收益（护甲归零 + 伤害 ×1.2）在数值上很难一眼看清，必须给一个明确的画面窗。
    if (this.model.mode === 'break' && now < (this.breakUntil ?? 0)) {
      const k = 1 - Math.max(0, Math.min(1, (this.breakUntil - now) / BREAK_WINDOW_MS)); // 0→1 收拢进度
      pxRing(g, x, y, Math.round(26 - 6 * k), C.brassDark, 0.85, 1);
      pxRing(g, x, y, Math.round(22 - 6 * k), C.brassLight, 1, 1);
    }
    // 预警：读条瞄准线 + 落点环（程序化，保持既有手感）
    if (this.model.windupLeft > 0 && this.model.aim) {
      const aim = this.model.aim;
      // 画风同步：瞄准线暗描边底 + blood 主线；落点双环硬边
      pxLine(g, x, y + 1, aim.x, aim.y + 1, C.outline, 0.9);
      pxLine(g, x, y, aim.x, aim.y, C.blood, 1);
      pxRing(g, aim.x, aim.y, 15, C.outline, 1, 1);
      pxRing(g, aim.x, aim.y, 14, C.blood, 0.95, 1);
      // 素材预警条：落点脚下横向 1 条，宽度贴合环（32→40px）
      if (this.warningSprite) {
        this.warningSprite.setVisible(true)
          .setPosition(Math.round(aim.x), Math.round(aim.y) + 10)
          .setDisplaySize(40, 7);
      }
    } else if (this.warningSprite) {
      this.warningSprite.setVisible(false);
    }
    if (this.sprite) {
      const s = this.sprite;
      s.setPosition(x, y + BOSS_FEET);
      s.setVisible(this.alive);
      // 染色优先级：转阶段/大招的一瞬间 > 受击白闪 > 不染色。
      // 旧版只有白闪，若把演出染色放在它后面，同一帧就会被清掉、换招看不出来。
      if (now < (this.tintUntil ?? 0)) s.setTintFill(this.tintColor ?? C.brassLight);
      else if (flash) s.setTintFill(0xffffff);
      else if (Number.isFinite(this.model.phase) && this.model.phase >= 1) s.setTint((this.phaseStyle ?? bossPhaseStyleFor(this.model.act)).color);
      else s.clearTint();
      // 血条（旧版在头顶 -26 处，素材更高，改到精灵头顶上方）
      const top = Math.round(y + BOSS_FEET - s.displayHeight);
      this.drawHpBar(g, x, top - 8);
      return;
    }
    // ---------- 程序化回退（素材缺失时，行为与旧版一致） ----------
    pxRect(g, x - 14, y + 12, 28, 3, C.void, 0.6);
    pxRect(g, x - 11, y - 9, 22, 21, flash ? C.white : C.stoneLight);
    pxRect(g, x - 8, y - 15, 16, 8, flash ? C.white : C.bone);
    pxRect(g, x - 7, y - 12, 4, 3, C.rot); pxRect(g, x + 3, y - 12, 4, 3, C.rot);
    for (const dx of [-10, -3, 4]) pxRect(g, x + dx, y - 19, 3, 5, C.brassDark);
    pxRect(g, x - 16, y - 5, 5, 15, C.stone); pxRect(g, x + 11, y - 5, 5, 15, C.stone);
    pxRect(g, x - 9, y + 9, 6, 9, C.stoneDark); pxRect(g, x + 3, y + 9, 6, 9, C.stoneDark);
    pxDiamond(g, x, y, 4, C.rot, 1, true); pxRect(g, x - 1, y - 1, 2, 2, C.teal);
    this.drawHpBar(g, x, y - 26);
  }

  // 血条 + 管数方块：血条显示当前这一管的血量，右侧方块表示「还剩几管」。
  // 打空一管时血条回满、方块熄灭一格——玩家一眼能读出「还要再打一条」，
  // 而不是误以为「血条怎么突然回来了」。素材分支与程序化回退共用，避免两条路径漂移。
  drawHpBar(g, x, barY) {
    pxRect(g, x - 17, barY, 34, 3, C.nightDeep);
    pxRect(g, x - 17, barY, Math.max(0, Math.round(34 * this.hp / this.maxHp)), 2, C.blood);
    const bar = Number.isFinite(this.bar) ? this.bar : 0;
    const max = Number.isFinite(this.barMax) ? this.barMax : 1;
    for (let i = 0; i < max; i++) {
      const bx = x + 20 + i * 5;
      const col = i < bar ? C.brassDark : i === bar ? C.blood : C.stone;
      pxRect(g, bx, barY, 3, 3, col, 1);
    }
  }
  destroy() { this.sprite?.destroy(); this.warningSprite?.destroy(); this.g.destroy(); }
}
