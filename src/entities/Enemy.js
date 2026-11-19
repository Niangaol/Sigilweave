// 敌人实体：移动与开火全部交给纯逻辑 src/logic/enemy-ai.js。
// 本文件只负责场景接线：身体用素材（骨架/腐尸为 12 帧精灵表，其余为单帧图），
// 预警线、血条、精英描边走 Graphics 覆盖层。素材缺失时整体降级为程序化像素绘制。
import { fireGuide } from '../logic/guide.js';
import { C, pxRect, pxRing, pxDiamond, pxPoly } from '../ui/Palette.js';
import { createBrain, stepBrain, MELEE_RULES, RANGED_RULES } from '../logic/enemy-ai.js';
import { drawEnemy, drawSpriteBody, drawOverlay, drawFormationMark, overlayMetrics, drawShieldBar, drawStun, drawShieldFlash, drawProcedural, drawCastPose, meleePreview, drawMeleeFan, drawSkeleton, drawBat, drawCorpse, drawCultist, drawKnight, drawHealth, ENEMY_TEXTURE, ENEMY_FEET, ENEMY_ANIM, ENEMY_STYLE } from '../ui/enemy-view.js';
import { variantPartKeys, placeVariantPart } from '../ui/variant-parts.js';
import { sfx } from '../audio/Sfx.js';

// 与 BattleScene 的可活动区域一致。环绕/冲锋会被约束在场地内；
// 直线推进的骷髅/腐尸允许冲出边界，由战斗层沿用现有的退场判定清退。
const ENEMY_BOUNDS = { left: 10, right: 470, top: 26, bottom: 262 };
// 冲锋中的骑士撞到玩家算“高伤害”，由接触伤害的实时倍率体现。
const CHARGE_DAMAGE_MUL = 2.5;

// 本次前摇还剩多久：唯一事实源是大脑自己的倒计时，不是 §3 近战表 / §4 远程表的 windupMs。
// 前摇由各 behavior 驱动（beginCast/beginWindup 写 windupLeft、近战层写 meleeLeft、
// phase/blink 写 pauseLeft、星屑骑士的收势写在 cast 模式的 chargeLeft 里），两张表只是
// 事件层配置，真实前摇经常和表值不一致：腐尸 520/蹒跚 450、枷锁守卫 550/甩链 1000、
// 熔岩暴兽 480/喷发 700、星屑骑士 300/650…照表画环等于给玩家错的倒计时。
// chargeLeft 只在 cast 模式是前摇计时器（charge/recover 模式都不是抬手）。
// 四个字段一个都不存在的 brain（手写替身）返回 null，由调用方落回表值兜底。
function windupRemaining(brain) {
  const b = brain && typeof brain === 'object' ? brain : null;
  if (!b) return null;
  const known = [b.windupLeft, b.meleeLeft, b.pauseLeft, b.mode === 'cast' ? b.chargeLeft : null]
    .filter((v) => Number.isFinite(v));
  if (!known.length) return null;
  let remain = 0;
  for (const v of known) if (v > remain) remain = v;
  return remain;
}


export default class Enemy {
  constructor(scene, def, x, y, target, hp, speed, damage, id) {
    this.scene = scene;
    this.def = def ?? { id: 'skeleton', radius: 6, color: C.bone };
    this.defId = this.def.id ?? 'skeleton';
    this.id = id ?? 0;
    this.x = Number.isFinite(x) ? x : 240;
    this.y = Number.isFinite(y) ? y : 40;
    this.target = { x: target?.x ?? this.x, y: target?.y ?? this.y };
    this.hp = Number.isFinite(hp) ? hp : 1;
    this.maxHp = this.hp;
    this.speed = Number.isFinite(speed) ? speed : 0;
    this.damage = Number.isFinite(damage) ? damage : (this.def.damage ?? 8);
    this.baseDamage = this.damage;
    this.radius = this.def.radius ?? 6;
    this.alive = true;
    this.hitAt = -9999;
    // 受击表现状态：后坐方向/力度、血条延迟条、抖动序号（只用确定性数值，不用随机数）
    this.hitPower = 0;
    this.hitDirX = 0;
    this.hitDirY = -1;
    this.hitSeq = 0;
    this.hpChip = this.hp;
    this.hpSeen = this.hp;
    this.hitChipAt = -9999;
    // 变体（spec §6）：tint / 体型缩放 / 一次性护盾 / 配件。def.variant 缺省时全部走旧路径。
    const variant = this.def.variant ?? null;
    const style = ENEMY_STYLE[this.defId];
    this.variantId = variant?.id ?? null;
    this.baseScale = (style?.scale ?? 1) * (variant?.scale ?? 1);
    // 变体 tint 优先于该型固有 tint；两者都没有时保持素材原色（受击闪白后也恢复到这里）
    this.tintColor = variant?.tint ?? style?.tint ?? null;
    this.shieldMax = Math.max(0, Math.round(this.hp * (variant?.shieldHpMul ?? 0)));
    this.shield = this.shieldMax;
    // 一次性护盾与格挡：shield 由 applyDamage 扣，破盾只置 pending，眩晕在 update 里消费
    this.guard = false;
    this.armor = 0;
    this.lastBlocked = 0;
    this.stunUntil = -1;
    this.shieldBrokenPending = false;
    this.shieldFlashAt = -9999;
    this.partKind = null;
    this.part = null;
    this.parts = [];
    this.partHidden = false;
    this.viewExtent = null;
    this.phase = (this.id * 53) % 97;
    this.walkPhase = 0;
    this.charging = false;
    this.windup = false;
    // 前摇预警环（A5）：起手时刻与本次前摇总时长。时长取该敌种在 §3 近战表 / §4 远程表里的
    // windupMs——表里没有的敌种（冲锋/砸地类）记 0，表示「没有可读的倒计时」，也就不推环。
    this.windupAt = 0;
    this.windupDur = 0;
    this.prevX = this.x;
    this.face = 1;
    // 允许战斗场景覆盖可活动区域；不提供时用与 BattleScene.BATTLE 相同的默认值
    this.bounds = scene.battleBounds ?? ENEMY_BOUNDS;
    this.g = scene.add.graphics().setDepth(Math.floor(this.y) + 0.5);
    // 素材精灵：key 不存在（素材未就位/该型无素材）时保持 null，走程序化绘制
    const texKey = ENEMY_TEXTURE[this.defId];
    this.sprite = texKey && scene.textures?.exists(texKey) && typeof scene.add?.sprite === 'function'
      ? scene.add.sprite(Math.round(this.x), Math.round(this.y) + (ENEMY_FEET[this.defId] ?? 7), texKey).setOrigin(0.5, 1)
      : null;
    if (this.sprite) {
      this.sprite.setScale(this.baseScale);
      if (this.tintColor != null) this.sprite.setTint(this.tintColor);
      this.sprite.setDepth(Math.floor(this.y));
      const prefix = ENEMY_ANIM[this.defId];
      if (prefix && scene.anims?.exists(prefix + '-idle')) this.sprite.play(prefix + '-idle');
    }
    // 屏幕内判定用的视觉外框：精灵脚在逻辑点附近、身体向上长，
    // 用逻辑半径会漏掉「脚刚出屏、大半个身子还在屏里」的怪。
    this.viewExtent = this.computeViewExtent();
    // 变体配件：纹理已就位（BootScene 生成或美术 PNG）才创建，缺失时保持空数组自动降级。
    // 重甲同时挂肩甲 + 盾（variant.parts 两个 key），精英挂王冠。
    if (typeof scene.textures?.exists === 'function' && typeof scene.add?.image === 'function') {
      for (const key of variantPartKeys(variant)) {
        if (!scene.textures.exists(key)) continue;
        const sprite = scene.add.image(Math.round(this.x), Math.round(this.y), key)
          .setOrigin(0.5, 0.5)
          .setDepth(Math.floor(this.y) + 0.2);
        this.parts.push({ sprite, kind: key.slice(4) });
      }
      this.part = this.parts[0]?.sprite ?? null;
      this.partKind = this.parts[0]?.kind ?? null;
    }
    this.brain = createBrain(this.defId, {
      now: scene.engine?.now ?? 0,
      seed: this.defId + ':' + this.id,
      // 召唤事件用 owner 标记施法者：传敌人 id，场景据此做「同一 owner 同时 1 个」去重
      id: this.id,
    });
    // 出生瞬间锁定目标点：dt=0 只初始化朝向与目标快照，不产生位移
    this.applyResult(stepBrain(this.brain, {
      dtMs: 0,
      now: scene.engine?.now ?? 0,
      self: this.selfState(1),
      player: this.playerState(),
      opts: { BATTLE: this.bounds, damage: this.baseDamage },
    }), 0, scene.engine?.now ?? 0);
    this.draw(0);
  }

  // 视觉外框（相对逻辑坐标）：给了索敌层判断「身体有没有进屏」。
  // 元素缺省/素材缺失时退回逻辑半径加身体高度估算，保证程序化回退也能用。
  computeViewExtent() {
    if (this.sprite) {
      const w = Number.isFinite(this.sprite.displayWidth) && this.sprite.displayWidth > 0 ? this.sprite.displayWidth : 2 * this.radius;
      const h = Number.isFinite(this.sprite.displayHeight) && this.sprite.displayHeight > 0 ? this.sprite.displayHeight : 2 * this.radius;
      const feet = ENEMY_FEET[this.defId] ?? 7;
      return { left: -Math.round(w / 2), right: Math.round(w / 2), top: Math.round(feet - h), bottom: Math.round(feet) };
    }
    const r = this.radius + 2;
    return { left: -r, right: r, top: -r - 12, bottom: r + 8 };
  }

  update(dtMs, now) {
    if (!this.alive) return;
    // 破盾必须先于 AI 消费：同一帧内的眩晕立即生效，不再推进本体动作
    this.consumeShieldBreak(now);
    if (Number.isFinite(now) && now < this.stunUntil) {
      // 眩晕 400ms：位置冻结（不跑 stepBrain）、打断蓄力/冲锋/格挡，接触伤害回到基础值
      this.windup = false;
      this.charging = false;
      this.guard = false;
      this.armor = 0;
      this.damage = this.baseDamage;
    } else {
      const factor = this.speedFactor(now);
      const result = stepBrain(this.brain, {
        dtMs,
        now,
        self: this.selfState(factor),
        player: this.playerState(),
        opts: { BATTLE: this.bounds, damage: this.baseDamage },
      });
      this.applyResult(result, dtMs, now);
    }
    // 血条延迟条：任何来源的掉血都先留一条白条，220ms 后再快速追平真实血量。
    // 用 hpSeen 观察 hp 变化，法术/尸爆/献祭走 applyDamage 也能自动触发，不依赖 takeDamage。
    if (this.hp < this.hpSeen) {
      this.hpChip = Math.max(this.hpChip, this.hpSeen);
      this.hitChipAt = now + 220;
    } else if (this.hp > this.hpChip) {
      this.hpChip = this.hp;
    }
    this.hpSeen = this.hp;
    if (now >= this.hitChipAt && this.hpChip > this.hp) {
      this.hpChip = Math.max(this.hp, this.hpChip - dtMs * this.maxHp * 0.004);
    }
    this.draw(now);
    this.g.setDepth(Math.floor(this.y) + 0.5);
    // 大地图世界边界由 enemy-ai 的 bounds 约束；离玩家过远的回收在战斗层处理
  }

  // 消费 applyDamage 置的破盾标记：只处理一次（标记立即清空），
  // 眩晕 400ms + 隐藏配件 + 通知战斗层放碎片/音效/震动。
  consumeShieldBreak(now) {
    if (!this.shieldBrokenPending) return false;
    this.shieldBrokenPending = false;
    this.shield = 0;
    this.shieldFlashAt = Number.isFinite(now) ? now : 0;
    this.stunUntil = this.shieldFlashAt + 400;
    this.partHidden = true;
    for (const entry of this.parts) entry.sprite?.setVisible(false);
    if (typeof this.scene?.onEnemyShieldBreak === 'function') this.scene.onEnemyShieldBreak(this);
    return true;
  }

  selfState(factor = 1) {
    return { x: this.x, y: this.y, speed: this.speed * factor, radius: this.radius };
  }

  playerState() {
    const p = this.scene.player;
    return p ? { x: p.x, y: p.y } : { x: this.target.x, y: this.target.y };
  }

  // 缓速 / 定身 / 减速力场：只影响移动速度，不影响攻击计时
  speedFactor(now) {
    let factor = now < (this.slowUntil ?? 0) ? (this.slowFactor ?? 1) : 1;
    if (now < (this.rootUntil ?? 0)) factor = 0;
    // 导电反应的冻结：完全停步，视觉上叠加冰蓝色调（见 draw）
    if (now < (this.frozenUntil ?? 0)) factor = 0;
    const player = this.scene.player;
    const slowed = this.scene.grid?.cells?.some?.(c => c.unlocked && c.slot?.defId === 'slow_field');
    if (player && slowed && Math.hypot(this.x - player.x, this.y - player.y) <= 90) {
      factor = Math.min(factor, 0.6);
    }
    // 编队护卫光环（spec §5.3）放在最后一乘：它是「队伍加成」，不是又一种控制。
    // 必须乘在 root/frozen 的归零之后——归零代表「这一帧根本不能动」，
    // 乘任何数都还是 0；而 slow_field 的 min(factor, 0.6) 是「再慢也慢不过 0.6」的
    // 上限语义，光环作为额外的正向削弱乘在它之后，才不会破坏那条上限的优先级。
    // 字段由 BattleScene.updateEnemies 每帧重算并删除，本层只读；非有限数按 1 处理，
    // 让「没有光环」与旧实现逐字节一致（也避免 NaN 一路传到位移上）。
    const auraMul = this.formationAura?.speedMul;
    if (Number.isFinite(auraMul) && auraMul >= 0) factor *= auraMul;
    return Number.isFinite(factor) ? Math.max(0, factor) : 1;
  }

  // 记一次前摇并向特效层推一颗血色地面预警环。windupAt / windupDur 成对出现，
  // 表示「当前这颗环是哪一刻开始的、还剩多久」；被后面一颗环顶掉后两者一起被覆盖。
  // 没有时长就不推：0ms 的环闪一下就没了，反而像误报。
  pushWindupRing(now, dur) {
    this.windupAt = Number.isFinite(now) ? now : 0;
    this.windupDur = dur > 0 ? dur : 0;
    if (this.windupDur > 0) {
      this.scene?.effects?.telegraph?.(this.x, this.y, this.windupDur, C.blood, this.radius * 1.6);
    }
  }

  applyResult(result, dtMs, now = 0) {
    if (!result || typeof result !== 'object') return;
    if (Number.isFinite(result.x)) this.x = result.x;
    if (Number.isFinite(result.y)) this.y = result.y;
    const wasWindup = this.windup === true;
    this.windup = result.windup === true;
    // 前摇统一红环：近战（有扇形）与远程（只亮姿态）都走这里，玩家看到的是同一颗血色地面环，
    // 不用区分敌种读预告。
    //
    // 何时推环：暗 → 亮那一帧推第一颗；前摇进行中如果大脑里的倒计时被作废重写，也要补一颗。
    // 「作废重写」的判据是实际剩余量和「当前这颗环暗示的剩余量」差出一帧以上——典型有两种：
    // ① 剩余量变长：枷锁守卫近战抬手 550ms 刚起，behavior 自己的甩链抬手 1000ms 就把它取消了；
    // ② 剩余量也变短：腐尸近战抬手 520ms 数到 40ms 时被蹒跚 450ms 顶替，两招背靠背连抬手、
    //    旗标根本不灭。只认起手帧的话，玩家手里攥的就是一张作废的短倒计时。
    if (this.windup) {
      const remain = windupRemaining(this.brain);
      if (remain === null) {
        // 兜底：大脑四个计时字段一个都没有（手写替身），落回 §3/§4 表值，只在起手帧推一次
        if (!wasWindup) {
          const rule = MELEE_RULES[this.defId] ?? RANGED_RULES[this.defId];
          this.pushWindupRing(now, Number.isFinite(rule?.windupMs) ? rule.windupMs : 0);
        }
      } else if (remain > 0) {
        const implied = this.windupDur - (now - this.windupAt);
        if (!wasWindup || Math.abs(remain - implied) > 16) this.pushWindupRing(now, remain);
      }
      // remain <= 0：这一招已经落地/正在落地，没什么可预告的，保留上一颗环自然结束
    }
    // 抬手起手音：只在「暗 → 亮」的那一帧放一次（45ms 全局节流兜住多只同时抬手）。    // 近战有自己的挥砍音（onEnemyMelee），这里只给远程施法，避免两种前摇撞音。
    if (this.windup && !wasWindup && !this.meleePreview()) {
      sfx.enemyCast();
      // 新手引导 G14：第一次看到甲方向你起手（预警圈/扇形）时说明前摇。
      if (this.scene?.run) fireGuide(this.scene, this.scene.run, 'G14', { highlight: '敌人' });
    }
    this.charging = result.charging === true;
    // 格挡（书页魔像等）：架起时按 55% 减伤结算，由 effects.applyDamage 读 armor。
    // 减伤值优先取该行为 tune 的 guardArmor（BULWARK_RULE=0.55），缺失时回退 0.55。
    this.guard = result.guard === true;
    const guardArmor = this.brain?.tune?.guardArmor;
    this.armor = this.guard
      ? Math.max(0, Math.min(1, Number.isFinite(guardArmor) ? guardArmor : 0.55))
      : 0;
    this.damage = this.charging ? Math.round(this.baseDamage * CHARGE_DAMAGE_MUL) : this.baseDamage;
    // 敌方弹丸转发；addHostileShot 不存在时静默跳过（纯逻辑可单独测试）
    if (Array.isArray(result.shots) && result.shots.length && typeof this.scene.addHostileShot === 'function') {
      for (const shot of result.shots) this.scene.addHostileShot(shot);
    }
    // 精英践踏事件转发（缝合尸魁）：由战斗层判定玩家是否在圈内
    if (result.stomp && typeof this.scene.onEnemyStomp === 'function') {
      this.scene.onEnemyStomp(this, result.stomp);
    }
    // 近战出手：由战斗层用 hostile.meleeHits 判定玩家（挥空也出表现）。
    // 方法不存在时静默跳过，保持纯逻辑可测。
    if (result.melee && typeof this.scene.onEnemyMelee === 'function') {
      this.scene.onEnemyMelee(this, result.melee);
    }
    // 召唤事件：由战斗层做全场上限/同 owner 去重/规范化后再入列。
    if (result.summon && typeof this.scene.addEnemySummon === 'function') {
      this.scene.addEnemySummon(this, result.summon);
    }
    if (Number.isFinite(dtMs) && dtMs > 0) this.walkPhase += dtMs;
  }

  // 返回是否死亡
  takeDamage(amount, now) {
    if (!this.alive) return false;
    const before = this.hp;
    this.hp -= amount;
    this.hitAt = now;
    if (Number.isFinite(before)) this.hpChip = Math.max(this.hpChip, before);
    this.hitChipAt = Number.isFinite(now) ? now + 220 : -9999;
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      return true;
    }
    return false;
  }

  // 受击细节（纯表现）：方向决定后坐朝向，伤害占比决定力度。
  // 只写表现状态，不改 x/y，所以碰撞、索敌、命中判定完全不受影响。
  hitReact(dx = 0, dy = -1, amount = 0, now = this.hitAt) {
    const len = Math.hypot(dx, dy);
    if (Number.isFinite(len) && len > 1e-4) {
      this.hitDirX = dx / len;
      this.hitDirY = dy / len;
    } else {
      this.hitDirX = 0;
      this.hitDirY = -1;
    }
    this.hitSeq = (this.hitSeq + 1) % 997;
    const ratio = Number.isFinite(amount) && this.maxHp > 0 ? amount / this.maxHp : 0.15;
    this.hitPower = Math.max(0.3, Math.min(1, 0.4 + ratio * 1.5));
    if (Number.isFinite(now)) this.hitAt = now;
  }

  // 受击时间轴（纯函数，方便单测）：0~220ms 后坐/抖动，前 120ms 闪白渐变。
  // 只偏移绘制坐标，逻辑 x/y 不动 —— 命中判定与碰撞不受表现影响。
  hitOffset(now) {
    const age = Number.isFinite(now) && Number.isFinite(this.hitAt) ? now - this.hitAt : Infinity;
    const hitT = age >= 0 && age < 220 ? 1 - age / 220 : 0;
    const power = this.hitPower ?? 0;
    const amp = (2.2 + 3.4 * power) * hitT * hitT;
    // 非有限 now 时 age 可能是 Infinity，sin(Infinity)=NaN 会把绘制坐标弄坏；先兜底
    const safeAge = Number.isFinite(age) ? age : 0;
    const jitter = Math.sin(safeAge * 0.55 + (this.hitSeq ?? 0) * 1.7) * 1.3 * hitT;
    const nx = this.hitDirX ?? 0;
    const ny = this.hitDirY ?? -1;
    return {
      x: Math.round(nx * amp - ny * jitter),
      y: Math.round(ny * amp + nx * jitter),
      flash: age >= 0 && age < 120 ? 1 - age / 120 : 0,
      hitT,
      power,
      age,
    };
  }

  draw(now) { return drawEnemy(this, now); }
  drawSpriteBody(now, x, y, flash, moving, age = Infinity, hitT = 0, power = 0) {
    return drawSpriteBody(this, now, x, y, flash, moving, age, hitT, power);
  }
  drawOverlay(x, y, now = Infinity) { return drawOverlay(this, x, y, now); }
  drawFormationMark(g, x, y) { return drawFormationMark(this, g, x, y); }
  overlayMetrics(x, y) { return overlayMetrics(this, x, y); }
  drawShieldBar(g, x, barY) { return drawShieldBar(this, g, x, barY); }
  drawStun(g, x, top, now) { return drawStun(this, g, x, top, now); }
  drawShieldFlash(g, x, m, now) { return drawShieldFlash(this, g, x, m, now); }
  drawProcedural(x, y, flash) { return drawProcedural(this, x, y, flash); }
  drawCastPose(g, x, y, now = 0) { return drawCastPose(this, g, x, y, now); }
  meleePreview() { return meleePreview(this); }
  drawMeleeFan(g, x, y, melee, blink) { return drawMeleeFan(this, g, x, y, melee, blink); }
  drawSkeleton(g, x, y, bob, color, flash) { return drawSkeleton(this, g, x, y, bob, color, flash); }
  drawBat(g, x, y, color, flash) { return drawBat(this, g, x, y, color, flash); }
  drawCorpse(g, x, y, bob, color, flash) { return drawCorpse(this, g, x, y, bob, color, flash); }
  drawCultist(g, x, y, bob, color, flash) { return drawCultist(this, g, x, y, bob, color, flash); }
  drawKnight(g, x, y, bob, color, flash) { return drawKnight(this, g, x, y, bob, color, flash); }
  drawHealth(g, x, y) { return drawHealth(this, g, x, y); }
  destroy() {
    for (const entry of this.parts) entry.sprite?.destroy();
    this.parts.length = 0;
    this.part = null;
    this.sprite?.destroy();
    this.g.destroy();
  }
}
