// 玩家：手动走位、受击无敌帧。
// 身体用素材精灵表（player_sheet.png，32px，12 帧横排），法杖与地面投影仍走 Graphics：
// 法杖尖端必须与 staffTipOf 严格对齐——所有法术特效从这里起手（见 docs/staff-origin.png）。
import { C, pxRect } from '../ui/Palette.js';
import { PLAYER } from '../data/roster.js';
import { CONTROL_RESISTANCE } from '../data/control.js';
import { kitStyle } from '../ui/kit-style.js';

// 法杖尖端（世界坐标）：所有法术特效的统一出发位置。
// 美术升级后立绘高 42px，法杖随之上移：杖头在朝向侧 +10/-11，尖端在 y-27。
export function staffTipOf(x, y, facing) {
  return { x: facing > 0 ? x + 10 : x - 11, y: y - 27 };
}

// 素材角色高 32px，脚底落在逻辑坐标 y+7（与旧程序化美术的脚底一致）
const FEET_OFFSET = 7;

// 新美术包（64×56）的立绘是「朝右」画的；只有面朝左（facing < 0）才需要水平翻转。
// 这里是唯一判定点，旧 32px 素材是朝左的，换包时已同步翻转过判断。
export function flipXForPlayer(facing) {
  return facing <= 0;
}

export default class Player {
  constructor(scene, x, y) {
    this.scene = scene;
    this.x = x;
    this.y = y;
    this.hp = PLAYER.hp;
    this.shield = 0;
    // 三套职业只改「披风/胸章/法杖尖端」三处小配色，人物本体仍是同一张立绘。
    this.kitStyle = kitStyle(scene.run?.kitId);
    this.maxHp = PLAYER.hp;
    this.radius = PLAYER.radius;
    this.alive = true;
    // 人物宝箱增益：额外受击无敌时间，单位「秒」；默认 0 时行为与旧版完全一致。
    this.iframesBonus = 0;
    this.invulnUntil = 0;
    // 硬控（2026-11-17 怪物重做）：stun/root 期间无法移动，slow 期间降速。
    this.stunUntil = 0;
    this.rootUntil = 0;
    this.slowUntil = 0;
    // 击退僵直与「真眩晕」分开记：眩晕冲刺解不掉，击退僵直冲刺能解（spec §3.1.1）。
    this.knockStunUntil = 0;
    this.slowFactor = 1;
    this.controlAt = 0;
    // 控制抗性递减（spec §3.2）：每类控制各记一条命中时间戳队列，窗口外的出队。
    this.controlLog = { stun: [], root: [], slow: [] };
    this.hurtAt = -9999;
    this.walkPhase = 0;
    this.facing = 1;
    this.moving = false;
    // 冲刺状态机（spec §3.1）：readyAt 管冷却+后摇，until 管位移段，invuln 只管途中无敌。
    this.dashReadyAt = 0;
    this.dashUntil = 0;
    this.dashInvulnUntil = 0;
    this.dashDir = { x: 1, y: 0 };
    this.dashFrom = { x, y };
    this.g = scene.add.graphics().setDepth(y);
    // 素材精灵：未就位时保持 null，draw() 自动降级为程序化绘制（接口与手感不变）
    this.sprite = scene.textures?.exists('player') && typeof scene.add?.sprite === 'function'
      ? scene.add.sprite(Math.round(x), Math.round(y) + FEET_OFFSET, 'player').setOrigin(0.5, 1)
      : null;
    if (this.sprite) {
      this.sprite.setDepth(y);
      this.sprite.play('player-idle');
    }
  }

  // dx/dy 为 -1..1 的输入轴；斜向在这里归一化
  update(dtMs, dx, dy, bounds, now) {
    // 冲刺期间位置完全由 updateDash 的时间轴决定：先委托，命中就整帧跳过普通移动，
    // 免得输入轴在冲刺之外再叠一份位移，108px 的冲刺距离不再稳定。
    if (this.updateDash(dtMs, bounds, now)) {
      this.draw(now);
      this.g.setDepth(Math.floor(this.y) + 0.5);
      return;
    }
    this.moving = dx !== 0 || dy !== 0;
    if (this.moving) {
      const len = Math.hypot(dx, dy) || 1;
      const vx = (dx / len) * PLAYER.speed;
      const vy = (dy / len) * PLAYER.speed;
      this.x += (vx * dtMs) / 1000;
      this.y += (vy * dtMs) / 1000;
      this.walkPhase += dtMs;
      if (dx !== 0) this.facing = dx > 0 ? 1 : -1;
    }
    this.x = Math.min(bounds.right, Math.max(bounds.left, this.x));
    this.y = Math.min(bounds.bottom, Math.max(bounds.top, this.y));
    this.draw(now);
    this.g.setDepth(Math.floor(this.y) + 0.5);
  }

  // 返回是否真的吃到伤害（无敌帧内返回 false）
  // 硬控入口：只由场景侧在敌人招式命中时调用，叠加以「更晚结束」为准。
  applyControl(kind, ms, now) {
    if (!this.alive || !(ms > 0) || !Number.isFinite(ms)) return false;
    if (kind !== 'stun' && kind !== 'root' && kind !== 'slow') return false;
    // 同类控制短时间内反复命中就递减：窗口外的时间戳先出队，步进到 0.35 封顶，单次不低于 minMs。
    const log = this.controlLog[kind];
    const cutoff = now - CONTROL_RESISTANCE.windowMs;
    while (log.length && log[0] <= cutoff) log.shift();
    const step = CONTROL_RESISTANCE.steps[Math.min(log.length, CONTROL_RESISTANCE.steps.length - 1)];
    const realMs = Math.max(CONTROL_RESISTANCE.minMs, ms * step);
    log.push(now);
    const until = now + realMs;
    if (kind === 'stun') this.stunUntil = Math.max(this.stunUntil, until);
    else if (kind === 'root') this.rootUntil = Math.max(this.rootUntil, until);
    else this.slowUntil = Math.max(this.slowUntil, until);
    this.controlAt = now;
    return true;
  }

  // 击退的僵直与「真眩晕」分开记：眩晕冲刺解不掉，击退僵直冲刺能解（spec §3.1.1）。
  applyKnockStun(ms, now) {
    if (!this.alive || !(ms > 0) || !Number.isFinite(ms)) return false;
    this.knockStunUntil = Math.max(this.knockStunUntil, now + ms);
    this.controlAt = now;
    return true;
  }

  moveBlocked(now) {
    return now < this.stunUntil || now < this.rootUntil || now < this.knockStunUntil;
  }

  speedFactorAt(now) {
    return now < this.slowUntil ? this.slowFactor : 1;
  }

  // 冲刺（spec §3.1）：冷却/位移中再按无效；dx/dy 归一化，无输入时朝 facing。
  // 启动即清定身/迟滞/击退僵直——闪避就是拿来撞掉这些的；眩晕不清（冲刺解不掉眩晕）。
  startDash(dx, dy, now) {
    if (!this.alive) return false;
    if (now < this.dashReadyAt || now < this.dashUntil) return false;
    const dash = PLAYER.dash;
    const len = Math.hypot(dx, dy);
    let ux;
    let uy;
    if (Number.isFinite(len) && len > 0) {
      ux = dx / len;
      uy = dy / len;
    } else {
      ux = this.facing < 0 ? -1 : 1;
      uy = 0;
    }
    this.dashFrom = { x: this.x, y: this.y };
    this.dashDir = { x: ux, y: uy };
    this.dashUntil = now + dash.ms;
    this.dashInvulnUntil = now + dash.invulnMs;
    // 后摇与冷却取更晚者：位移结束还能立刻再按会磨掉闪避的节奏感
    this.dashReadyAt = now + Math.max(dash.ms + dash.afterMs, dash.cooldownMs);
    this.rootUntil = 0;
    this.slowUntil = 0;
    this.knockStunUntil = 0;
    return true;
  }

  // 位移中每帧调用：按 now 在 dashFrom → dashFrom + dir×distance 之间插值，
  // 位置取自时间轴而不是累加 dt——暂停/顿帧时位置不会漂。越界钳到世界边即停。
  // 边界帧（now === dashUntil）仍插值到终点并算「冲刺中」：更晚的帧直接返回 false 且不碰位置，
  // 免得场景侧持旧的 now 调用时把玩家拽回冲刺终点。
  // 注意 dashUntil === 0（从未冲刺过）且 now === 0 的帧：那会让 t 算出 k=1 瞬移 +108px，
  // 所以这里显式要求 dashUntil 是个正的时刻才算真的在冲刺。
  updateDash(dtMs, bounds, now) {
    if (!(this.dashUntil > 0) || now > this.dashUntil) return false;
    const dash = PLAYER.dash;
    const t = (now - (this.dashUntil - dash.ms)) / dash.ms;
    const k = Number.isFinite(t) ? Math.min(1, Math.max(0, t)) : 0;
    this.x = this.dashFrom.x + this.dashDir.x * dash.distance * k;
    this.y = this.dashFrom.y + this.dashDir.y * dash.distance * k;
    const b = bounds ?? {};
    const left = Number.isFinite(b.left) ? b.left : -Infinity;
    const right = Number.isFinite(b.right) ? b.right : Infinity;
    const top = Number.isFinite(b.top) ? b.top : -Infinity;
    const bottom = Number.isFinite(b.bottom) ? b.bottom : Infinity;
    this.x = Math.min(right, Math.max(left, this.x));
    this.y = Math.min(bottom, Math.max(top, this.y));
    return true;
  }

  takeDamage(amount, now) {
    if (!this.alive) return false;
    // 冲刺途中另有独立无敌段：与受击无敌互不覆盖，谁晚归谁管
    if (now < this.invulnUntil || now < this.dashInvulnUntil) return false;
    // 人物宝箱「坚韧余辉」以秒为单位累加；非法/负数按 0 处理，默认仍是 900ms。
    const bonusMs = Number.isFinite(this.iframesBonus) && this.iframesBonus > 0
      ? this.iframesBonus * 1000
      : 0;
    const shield = Number.isFinite(this.shield) && this.shield > 0 ? this.shield : 0;
    const absorbed = Math.min(shield, Math.max(0, amount));
    this.shield = shield - absorbed;
    this.hp = Math.max(0, this.hp - Math.max(0, amount - absorbed));
    this.invulnUntil = now + PLAYER.iframesMs + bonusMs;
    this.hurtAt = now;
    if (this.hp <= 0) this.alive = false;
    return true;
  }

  // 法杖尖端（世界坐标）：弹丸、光迹、起手微粒都从这里出发
  staffTip() {
    return staffTipOf(this.x, this.y, this.facing);
  }

  draw(now) {
    const flash = now - this.hurtAt < PLAYER.hurtFlashMs;
    const blink = now < this.invulnUntil && Math.floor(now / 90) % 2 === 0;
    const x = Math.round(this.x);
    const y = Math.round(this.y);
    if (this.sprite) {
      this.drawSprite(now, x, y, flash, blink);
    } else {
      this.drawProcedural(now, x, y, flash, blink);
    }
  }

  // ---------- 素材表现 ----------
  drawSprite(now, x, y, flash, blink) {
    const s = this.sprite;
    s.setPosition(x, y + FEET_OFFSET);
    s.setDepth(Math.floor(y));
    s.setFlipX(flipXForPlayer(this.facing));
    s.setAlpha(blink ? 0.45 : 1);
    if (!this.alive) {
      // 死亡：停在受击末帧并压暗，读作“倒下”
      s.anims.stop();
      s.setFrame(11);
      s.setTintFill(0x241f33);
    } else if (flash) {
      s.setTintFill(0xffffff);
      // stop() 不清 currentAnim，第二次受击要靠 !isPlaying 才能重播受伤动画
      if (s.anims.currentAnim?.key !== 'player-hurt' || !s.anims.isPlaying) s.play('player-hurt', true);
    } else {
      s.clearTint();
      if (now < this.invulnUntil) {
        // 无敌帧：冲刺姿势 + 明暗闪烁，把“撞不动”演出来
        s.anims.stop();
        s.setFrame(7);
      } else if (this.moving) {
        if (s.anims.currentAnim?.key !== 'player-walk') s.play('player-walk', true);
      } else if (s.anims.currentAnim?.key !== 'player-idle') {
        s.play('player-idle', true);
      }
    }
    this.drawStaff(x, y, now);
  }

  // 地面投影 + 法杖：像素与 staffTipOf 严格对齐，材质路径两条都走这里
  drawStaff(x, y, now = 0) {
    const g = this.g;
    g.clear();
    pxRect(g, x - 4, y + 7, 9, 1, C.void, 0.5);
    pxRect(g, x - 3, y + 8, 7, 1, C.void, 0.35);
    if (!this.alive) return;
    const bob = this.moving ? (Math.floor(this.walkPhase / 110) % 2) : 0;
    const staffX = this.facing > 0 ? x + 10 : x - 11;
    pxRect(g, staffX, y - 24 - bob, 1, 31, 0x6b4a24, 1);
    pxRect(g, staffX - 1, y - 26 - bob, 3, 2, C.brass, 1);
    pxRect(g, staffX, y - 27 - bob, 1, 1, this.kitStyle?.accentLight ?? C.teal, 1);
    pxRect(g, staffX - 2, y - 27 - bob, 5, 1, C.brassDark, 0.55);
    this.drawKitAccents(x, staffX, y - 27 - bob, y - 20 - bob);
    this.drawControl(x, y, now);
  }

  // 硬控表现（2026-11-17 怪物重做）：眩晕头顶转星星、定身脚下一圈冷点、迟滞脚边一道紫线。
  // 全部走既有的 this.g，不新增图层；时间取 now，暂停/顿帧时自然停住。
  drawControl(x, y, now) {
    const g = this.g;
    if (!g || !this.alive) return;
    if (now < this.stunUntil) {
      for (let i = 0; i < 3; i++) {
        const a = now / 140 + (i * Math.PI * 2) / 3;
        const sx = Math.round(x + Math.cos(a) * 10);
        const sy = Math.round(y - 34 + Math.sin(a) * 4);
        pxRect(g, sx, sy, 2, 2, 0xfff0a0, 0.95);
        pxRect(g, sx - 1, sy + 2, 4, 1, 0xfff0a0, 0.45);
      }
    }
    if (now < this.rootUntil) {
      const r = 9 + Math.round(Math.sin(now / 110));
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        pxRect(g, Math.round(x + Math.cos(a) * r), Math.round(y + 6 + Math.sin(a) * r * 0.45), 2, 2, 0x9fe8ff, 0.9);
      }
    }
    if (now < this.slowUntil) {
      pxRect(g, x - 6, y + 8, 13, 1, 0xa88bd8, 0.5);
    }
  }

  // 职业小配件：披风拖尾（背向侧）+ 胸章 + 法杖尖端换色。
  // 全部是 1~2px 的硬边色块，叠在现有立绘上，不改人物轮廓，也不新增美术图。
  drawKitAccents(x, staffX, staffTipY, chestY) {
    const style = this.kitStyle;
    if (!style) return;
    const g = this.g;
    const dir = this.facing > 0 ? -1 : 1;   // 朝右时披风向左拖，朝左时向右拖
    const backX = dir < 0 ? x - 5 : x + 3;
    const wave = this.moving ? (Math.floor(this.walkPhase / 160) % 2) : 0;
    pxRect(g, backX, chestY + 1 + wave, 2, 4, style.cape, 0.95);
    pxRect(g, backX + dir, chestY + 3 + wave, 2, 2, style.capeDark, 0.9);
    pxRect(g, backX + dir * 2, chestY + 4 + wave, 1, 2, style.accent, 0.8);
    // 胸章：三种 3×3 像素字，形状不同、颜色不同
    const ex = x - 1;
    const ey = chestY + 5;
    if (style.emblem === 'wing') {
      pxRect(g, ex - 1, ey, 1, 2, style.accent, 1);
      pxRect(g, ex + 1, ey, 1, 2, style.accentLight, 1);
      pxRect(g, ex, ey + 1, 1, 1, style.accent, 1);
    } else if (style.emblem === 'ember') {
      pxRect(g, ex, ey, 1, 2, style.accentLight, 1);
      pxRect(g, ex - 1, ey + 1, 1, 1, style.accent, 1);
      pxRect(g, ex + 1, ey + 1, 1, 1, style.accent, 1);
    } else {
      pxRect(g, ex, ey, 1, 3, style.accent, 1);
      pxRect(g, ex - 1, ey + 1, 3, 1, style.accentLight, 1);
    }
    // 法杖尖端小光点：与胸章同色系，施法时更容易认职业
    pxRect(g, staffX - 1, staffTipY, 1, 1, style.accent, 0.85);
    pxRect(g, staffX + 1, staffTipY, 1, 1, style.accent, 0.55);
  }

  // ---------- 程序化回退（素材缺失时） ----------
  drawProcedural(now, x, y, flash, blink) {
    const g = this.g;
    g.clear();
    const bob = this.moving ? (Math.floor(this.walkPhase / 110) % 2) : 0;
    const step = this.moving ? (Math.floor(this.walkPhase / 110) % 2) : 0;

    pxRect(g, x - 4, y + 7, 9, 1, C.void, 0.5);
    pxRect(g, x - 3, y + 8, 7, 1, C.void, 0.35);

    if (!this.alive) {
      pxRect(g, x - 4, y - 2, 9, 5, C.stoneDark, 0.8);
      pxRect(g, x - 2, y - 6, 5, 4, C.stoneDark, 0.8);
      return;
    }

    const staffX = this.facing > 0 ? x + 6 : x - 7;
    pxRect(g, staffX, y - 12 - bob, 1, 17, 0x6b4a24, 1);
    pxRect(g, staffX - 1, y - 14 - bob, 3, 2, C.brass, 1);
    pxRect(g, staffX, y - 15 - bob, 1, 1, this.kitStyle?.accentLight ?? C.teal, 1);

    const legL = step ? 1 : 0;
    pxRect(g, x - 3, y + 3, 2, 4 - legL, 0x6b4a24, 1);
    pxRect(g, x + 1, y + 3, 2, 4 - (1 - legL), 0x6b4a24, 1);
    pxRect(g, x - 4, y + 6, 3, 1, C.brassDark, 1);
    pxRect(g, x + 1, y + 6, 3, 1, C.brassDark, 1);

    pxRect(g, x - 5, y - 6 - bob, 10, 11, C.void, 1);
    pxRect(g, x - 4, y - 5 - bob, 8, 9, C.brass, 1);
    pxRect(g, x - 4, y - 5 - bob, 8, 1, C.brassLight, 1);
    pxRect(g, x - 1, y - 4 - bob, 2, 8, C.parchment, 1);
    pxRect(g, x - 4, y + 1 - bob, 8, 1, C.bloodDark, 1);
    pxRect(g, x - 4, y + 4 - bob, 2, 1, C.brassDark, 1);
    pxRect(g, x, y + 4 - bob, 2, 1, C.brassDark, 1);
    pxRect(g, x + 3, y + 4 - bob, 1, 1, C.brassDark, 1);

    pxRect(g, x - 4, y - 11 - bob, 8, 5, C.void, 1);
    pxRect(g, x - 3, y - 10 - bob, 6, 4, C.stone, 1);
    pxRect(g, x - 2, y - 9 - bob, 4, 3, C.parchment, 1);
    pxRect(g, x - 2, y - 8 - bob, 1, 1, C.ink, 1);
    pxRect(g, x + 1, y - 8 - bob, 1, 1, C.ink, 1);
    pxRect(g, x - 3, y - 11 - bob, 6, 1, C.stoneLight, 1);
    this.drawKitAccents(x, staffX, y - 15 - bob, y - 4 - bob);

    if (flash) {
      pxRect(g, x - 4, y - 10 - bob, 8, 15, C.white, 0.7);
      pxRect(g, x - 3, y - 5 - bob, 6, 9, C.white, 0.4);
    }
    g.setAlpha(blink ? 0.45 : 1);
  }

  destroy() {
    this.sprite?.destroy();
    this.g.destroy();
  }
}
