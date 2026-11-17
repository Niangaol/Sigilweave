// 敌人实体：移动与开火全部交给纯逻辑 src/logic/enemy-ai.js。
// 本文件只负责场景接线：身体用素材（骨架/腐尸为 12 帧精灵表，其余为单帧图），
// 预警线、血条、精英描边走 Graphics 覆盖层。素材缺失时整体降级为程序化像素绘制。
import { C, pxRect, pxRing, pxDiamond, pxPoly } from '../ui/Palette.js';
import { createBrain, stepBrain } from '../logic/enemy-ai.js';
import { variantPartKeys, placeVariantPart } from '../ui/variant-parts.js';
import { sfx } from '../audio/Sfx.js';

// 与 BattleScene 的可活动区域一致。环绕/冲锋会被约束在场地内；
// 直线推进的骷髅/腐尸允许冲出边界，由战斗层沿用现有的退场判定清退。
const ENEMY_BOUNDS = { left: 10, right: 470, top: 26, bottom: 262 };
// 冲锋中的骑士撞到玩家算“高伤害”，由接触伤害的实时倍率体现。
const CHARGE_DAMAGE_MUL = 2.5;

// defId → 素材 key（《美术素材交付规范 v1.0》参数总表）。
// stitch_abomination 用 ghoul（尸骸体量贴合缝合尸魁）；oath_bishop 用 cultist 放大提色（同属robed施法者）。
const ENEMY_TEXTURE = {
  skeleton: 'skeleton',
  corpse: 'corpse',
  bat: 'imp',
  cultist: 'skeleton_mage',
  knight: 'death_knight',
  stitch_abomination: 'ghoul',
  oath_bishop: 'skeleton_mage',
  rune_spider: 'rune_spider',
  stone_gargoyle: 'stone_gargoyle',
  crystal_dryad: 'crystal_dryad',
  clockwork_doll: 'clockwork_doll',
  void_elemental: 'void_elemental',
  wraith: 'wraith',
  brass_warden: 'brass_warden',
  // 北斗后半段专属（第 4-7 幕）
  ink_wisp: 'ink_wisp',
  page_golem: 'page_golem',
  index_hound: 'index_hound',
  verdict_wraith: 'verdict_wraith',
  shackle_guard: 'shackle_guard',
  scale_arbiter: 'scale_arbiter',
  slag_beast: 'slag_beast',
  ember_imp: 'ember_imp',
  anvil_tyrant: 'anvil_tyrant',
  dawn_shade: 'dawn_shade',
  stardust_knight: 'stardust_knight',
  eclipse_priest: 'eclipse_priest',
};
// 精灵脚底相对逻辑坐标 y 的偏移（对齐各旧程序化美术的脚底）
// 美术升级包实测脚底偏移（与 64×56 新立绘对齐；旧图已不再使用）
const ENEMY_FEET = {
  skeleton: 7, corpse: 7, bat: 8, cultist: 7, knight: 7,
  stitch_abomination: 9, oath_bishop: 8,
  rune_spider: 6, stone_gargoyle: 7, crystal_dryad: 7,
  clockwork_doll: 7, void_elemental: 9, wraith: 9, brass_warden: 8,
  // 北斗后半段：按各自画布底边对齐
  ink_wisp: 8, page_golem: 7, index_hound: 7,
  verdict_wraith: 8, shackle_guard: 7, scale_arbiter: 8,
  slag_beast: 7, ember_imp: 8, anvil_tyrant: 8,
  dawn_shade: 8, stardust_knight: 7, eclipse_priest: 8,
};
// 走/攻动画前缀（只有两张表有动画；单帧图只做朝向翻转）
const ENEMY_ANIM = { skeleton: 'skeleton', corpse: 'corpse' };
// 精英放大/提色，让大体积敌人撑住半径
const ENEMY_STYLE = {
  stitch_abomination: { scale: 1.15 },
  oath_bishop: { scale: 1.2, tint: 0x9a86b8 },
  brass_warden: { scale: 1.1 },
  // 后四幕精英统一放大 15%，普通怪保持原尺寸
  index_hound: { scale: 1.15 },
  scale_arbiter: { scale: 1.15 },
  anvil_tyrant: { scale: 1.15 },
  eclipse_priest: { scale: 1.15 },
};

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
    }), 0);
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
      this.applyResult(result, dtMs);
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
    return Number.isFinite(factor) ? Math.max(0, factor) : 1;
  }

  applyResult(result, dtMs) {
    if (!result || typeof result !== 'object') return;
    if (Number.isFinite(result.x)) this.x = result.x;
    if (Number.isFinite(result.y)) this.y = result.y;
    const wasWindup = this.windup === true;
    this.windup = result.windup === true;
    // 抬手起手音：只在「暗 → 亮」的那一帧放一次（45ms 全局节流兜住多只同时抬手）。
    // 近战有自己的挥砍音（onEnemyMelee），这里只给远程施法，避免两种前摇撞音。
    if (this.windup && !wasWindup && !this.meleePreview()) sfx.enemyCast();
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

  draw(now) {
    const x = Math.round(this.x);
    const y = Math.round(this.y);
    const off = this.hitOffset(now);
    const rx = x + off.x;
    const ry = y + off.y;
    const moving = Math.abs(this.x - this.prevX) > 0.02;
    if (moving) this.face = this.x < this.prevX ? -1 : 1;
    if (this.sprite) {
      this.drawSpriteBody(now, rx, ry, off.flash, moving, off.age, off.hitT, off.power);
    } else {
      this.drawProcedural(rx, ry, off.flash);
    }
    this.drawOverlay(x, y, now);
    // 配件（盾/肩甲/王冠）逐帧跟随本体：位置、缩放、朝向、层级都在这里刷新
    placeVariantPart(this);
    this.prevX = this.x;
  }

  // ---------- 素材表现 ----------
  drawSpriteBody(now, x, y, flash, moving, age = Infinity, hitT = 0, power = 0) {
    const s = this.sprite;
    // 蝙蝠没有飞行动画，用旧节奏做 1px 上下浮动，读作振翅
    const bob = this.defId === 'bat' && Math.floor((this.walkPhase + this.phase * 10) / 90) % 2 === 0 ? -1 : 0;
    s.setPosition(x, y + (ENEMY_FEET[this.defId] ?? 7) + bob);
    s.setDepth(Math.floor(this.y));
    s.setFlipX(this.face < 0);
    s.setVisible(this.alive);
    // 受击挤压：横向鼓一点、纵向压一点，再沿受击方向轻微倾斜（脚底为原点，倾斜不会飘）
    const base = this.baseScale ?? 1;
    const squash = 0.18 * power * hitT;
    s.setScale(base * (1 + squash), base * (1 - squash * 0.8));
    s.setRotation(-(this.hitDirX ?? 0) * 0.12 * power * hitT);
    // 闪白 → 残红 → 回到原本的状态色，三帧层次比单帧白闪更「打实了」
    if (flash > 0.55) {
      s.setTintFill(0xffffff);
    } else if (flash > 0) {
      s.setTint(0xff9d93);
    } else if (age >= 0 && age < 170) {
      s.setTint(0xd98a84);
    } else if ((this.frozenUntil ?? 0) > (this.scene?.engine?.now ?? 0)) {
      // 冻结优先于抬手：冰蓝是状态，抬起的手不该盖掉它
      s.setTint(0x9fd8ff);
    } else if (this.windup) {
      // 抬手：身体亮色按 90ms 节拍闪动（tint 只改表现，不动逻辑坐标/碰撞）。
      // 远程抬手只闪身体、不画任何指向线；近战的地面扇形由 drawCastPose 补。
      const t = Number.isFinite(now) ? now : (this.scene?.engine?.now ?? 0);
      s.setTint(Math.floor(t / 90) % 2 === 0 ? 0xffe6c0 : 0xffc98a);
    } else {
      // 受击状态色恢复到「变体 tint 优先、否则该型固有 tint」，都没配就清掉
      if (this.tintColor != null) s.setTint(this.tintColor);
      else s.clearTint();
    }
    const prefix = ENEMY_ANIM[this.defId];
    if (!this.alive || !prefix || !this.scene.anims?.exists(prefix + '-idle')) return;
    let want = 'idle';
    if (this.windup) want = 'attack';
    else if (this.speed > 0 && moving) want = 'walk';
    const key = prefix + '-' + want;
    // 一次性动画（挥剑/攻击）播完后 currentAnim 不清，必须允许 !isPlaying 时重播
    if (this.scene.anims.exists(key) && (s.anims.currentAnim?.key !== key || !s.anims.isPlaying)) s.play(key, true);
  }

  // 预警线 / 血条 / 精英描边 / 盾条 / 眩晕：覆盖层，压在精灵上一层。
  // 素材路径按精灵实际外框定位，避免大体积精灵把标记画进身体里。
  drawOverlay(x, y, now = Infinity) {
    const g = this.g;
    g.clear();
    this.drawCastPose(g, x, y, now);
    const m = this.overlayMetrics(x, y);
    if (this.sprite) {
      if (this.def?.elite) {
        pxRect(g, x - m.hw, m.top, m.hw * 2, 1, C.brass, 0.9);
        pxRect(g, x - m.hw, y + this.radius + 1, m.hw * 2, 1, C.brass, 0.9);
        pxRect(g, x - m.hw, m.top, 1, y + this.radius + 2 - m.top, C.brass, 0.9);
        pxRect(g, x + m.hw - 1, m.top, 1, y + this.radius + 2 - m.top, C.brass, 0.9);
        pxRect(g, x - 8, m.top - 6, 16, 2, C.void, 0.8);
        pxRect(g, x - 8, m.top - 6, Math.max(1, Math.round(16 * this.hp / this.maxHp)), 2, C.brassLight, 1);
      }
      if (this.hp < this.maxHp) {
        const ratio = Math.max(0, Math.min(1, this.hp / this.maxHp));
        // 延迟白条：先留在受伤前的位置，220ms 后再缩回真实血量
        const chip = Math.max(ratio, Math.min(1, this.hpChip / this.maxHp));
        pxRect(g, x - 6, m.barY, 13, 2, C.void, 0.8);
        if (chip > ratio) pxRect(g, x - 5, m.barY + 1, Math.max(1, Math.round(11 * chip)), 1, C.brassLight, 0.95);
        pxRect(g, x - 5, m.barY + 1, Math.max(1, Math.round(11 * ratio)), 1, C.blood, 1);
      }
    } else {
      this.drawHealth(g, x, y);
      if (this.def?.elite) {
        pxRect(g, x - this.radius - 2, y - this.radius - 2, this.radius * 2 + 4, 1, C.brass, 0.9);
        pxRect(g, x - this.radius - 2, y + this.radius + 1, this.radius * 2 + 4, 1, C.brass, 0.9);
        pxRect(g, x - this.radius - 2, y - this.radius - 2, 1, this.radius * 2 + 4, C.brass, 0.9);
        pxRect(g, x + this.radius + 1, y - this.radius - 2, 1, this.radius * 2 + 4, C.brass, 0.9);
        pxRect(g, x - 8, y - this.radius - 8, 16, 2, C.void, 0.8);
        pxRect(g, x - 8, y - this.radius - 8, Math.max(1, Math.round(16 * this.hp / this.maxHp)), 2, C.brassLight, 1);
      }
    }
    this.drawShieldBar(g, x, m.barY);
    this.drawStun(g, x, m.top, now);
    this.drawShieldFlash(g, x, m, now);
  }

  // 覆盖层定位基准：素材路径吃精灵实际外框，程序化路径退回逻辑半径。
  // barY 与血条同基线，盾条画在它上方 3px。
  overlayMetrics(x, y) {
    if (this.sprite) {
      const s = this.sprite;
      const hw = Math.round((s.displayWidth ?? 2 * this.radius) / 2) + 2;
      const h = Number.isFinite(s.displayHeight) && s.displayHeight > 0 ? s.displayHeight : 2 * this.radius;
      const top = Math.round(y + (ENEMY_FEET[this.defId] ?? 7) - h);
      return { hw, top, barY: top - 4, width: hw * 2, height: Math.max(1, Math.round(h)) };
    }
    const hw = this.radius + 2;
    return {
      hw,
      top: y - this.radius - 10,
      barY: y - this.radius - 15,
      width: hw * 2,
      height: this.radius * 2 + 10,
    };
  }

  // 一次性护盾条：血条上方 3px 的 11×1 青钢条，长度按剩余盾值比例。
  drawShieldBar(g, x, barY) {
    if (!(this.shield > 0)) return;
    const max = this.shieldMax > 0 ? this.shieldMax : 1;
    const ratio = Math.max(0, Math.min(1, this.shield / max));
    pxRect(g, x - 6, barY - 3, 13, 1, C.void, 0.7);
    pxRect(g, x - 5, barY - 3, Math.max(1, Math.round(11 * ratio)), 1, C.teal, 1);
  }

  // 破盾眩晕：头顶 3 个菱形按固定相位绕头转（只用 now 推导，不用随机数）。
  drawStun(g, x, top, now) {
    if (!(Number.isFinite(now) && now < this.stunUntil)) return;
    const t = now - (this.stunUntil - 400);
    for (let i = 0; i < 3; i++) {
      const a = (t / 260) * Math.PI * 2 + (i * Math.PI * 2) / 3;
      const px = Math.round(x + Math.cos(a) * 5);
      const py = Math.round(top - 4 + Math.sin(a) * 2);
      pxDiamond(g, px, py, 2, C.outline, 1, true);
      pxDiamond(g, px, py, 1, C.bone, 1, true);
    }
  }

  // 破盾白闪：160ms 内给整个身体压一层白，与特效层的碎片同时出现。
  drawShieldFlash(g, x, m, now) {
    const age = now - this.shieldFlashAt;
    if (!(age >= 0 && age < 160)) return;
    const flash = 1 - age / 160;
    const w = Math.max(1, Math.round(m.width));
    const h = Math.max(1, Math.round(m.height));
    pxRect(g, x - Math.round(w / 2), m.top, w, h, C.white, 0.7 * flash);
  }

  // ---------- 程序化回退（素材缺失时，行为与旧版一致） ----------
  drawProcedural(x, y, flash) {
    const g = this.g;
    g.clear();
    const step = Math.floor((this.walkPhase + this.phase * 10) / 160) % 2;
    const bob = step;
    const color = this.def?.color ?? C.bone;
    // 抬手姿态统一在 drawOverlay 里画（draw() 每次都会调用它），此处不重复画
    switch (this.defId) {
      case 'bat': this.drawBat(g, x, y, color, flash); break;
      case 'corpse': this.drawCorpse(g, x, y, bob, color, flash); break;
      case 'cultist': this.drawCultist(g, x, y, bob, color, flash); break;
      case 'knight': this.drawKnight(g, x, y, bob, color, flash); break;
      default: this.drawSkeleton(g, x, y, bob, color, flash); break;
    }
    this.drawHealth(g, x, y);
    if (this.def?.elite) {
      pxRect(g, x - this.radius - 2, y - this.radius - 2, this.radius * 2 + 4, 1, C.brass, 0.9);
      pxRect(g, x - this.radius - 2, y + this.radius + 1, this.radius * 2 + 4, 1, C.brass, 0.9);
      pxRect(g, x - this.radius - 2, y - this.radius - 2, 1, this.radius * 2 + 4, C.brass, 0.9);
      pxRect(g, x + this.radius + 1, y - this.radius - 2, 1, this.radius * 2 + 4, C.brass, 0.9);
      pxRect(g, x - 8, y - this.radius - 8, 16, 2, C.void, 0.8);
      pxRect(g, x - 8, y - this.radius - 8, Math.max(1, Math.round(16 * this.hp / this.maxHp)), 2, C.brassLight, 1);
    }
  }

  // 抬手姿态（替代旧的瞄准线预告）：身体亮色闪 + 头顶小菱形；
  // 近战前摇额外在地面画扇形提示（仅近战，不是瞄准线/落点环）。
  // 远程抬手不画任何指向线——方向在发射瞬间才算，玩家靠「抬手」读威胁。
  drawCastPose(g, x, y, now = 0) {
    if (!this.windup) return;
    const t = Number.isFinite(now) ? now : 0;
    const blink = Math.floor(t / 90) % 2 === 0;
    // 头顶小菱形：暗描边打底 + arcane 核，亮拍再点白芯（纯填充，不依赖 stroke API）
    const dy = y - this.radius - 11;
    pxDiamond(g, x, dy, 3, C.outline, 1, true);
    pxDiamond(g, x, dy, 2, C.arcane, blink ? 1 : 0.55, true);
    if (blink) pxDiamond(g, x, dy, 1, C.white, 0.95, true);
    // 抬手弧光：只取肩线以上一段「括号」形，不再围成整只怪的方框（那会像 UI 选中框）。
    // 素材/程序化两条路径共用；顶边 + 两侧短竖边，亮度随闪拍呼吸。
    const m = this.overlayMetrics(x, y);
    const hw = Math.max(2, Math.round(m.width / 2));
    const top = Math.round(m.top) + 2;
    const bodyH = Math.max(4, y + this.radius - top);
    const tick = Math.max(3, Math.min(9, Math.round(bodyH * 0.32)));
    const col = blink ? C.arcaneLight : C.arcane;
    const alpha = blink ? 0.55 : 0.3;
    pxRect(g, x - hw, top, 2, tick, col, alpha);
    pxRect(g, x + hw - 2, top, 2, tick, col, alpha);
    pxRect(g, x - hw, top, hw * 2, 1, col, alpha);
    // 近战前摇：地面扇形。角度/张角/距离由 AI 在 windup 期间给出（见 meleePreview）。
    const preview = this.meleePreview();
    if (preview) this.drawMeleeFan(g, x, y, preview, blink);
  }

  // windup 期间从 brain 读取近战预告：优先 meleePreview / melee，其次 tune 里的近战参数
  // （若 T2 只把参数放进 tune，就用「当前朝玩家」补角度）。缺失时返回 null，不画扇形。
  meleePreview() {
    const brain = this.brain;
    const p = brain?.meleePreview ?? brain?.melee;
    if (p
      && Number.isFinite(p.angle) && Number.isFinite(p.range) && Number.isFinite(p.arc)
      && p.range > 0 && p.arc > 0) {
      return { angle: p.angle, range: p.range, arc: p.arc };
    }
    const tune = brain?.tune;
    if (brain?.attackKind === 'melee' && tune && Number.isFinite(tune.meleeRange) && Number.isFinite(tune.meleeArc)) {
      const target = this.playerState();
      const angle = Math.atan2(target.y - this.y, target.x - this.x);
      return { angle, range: tune.meleeRange, arc: tune.meleeArc };
    }
    return null;
  }

  // 地面扇形提示：几条虚线辐条 + 弧边，低透明度硬边点阵；只标「哪里会被扫到」，
  // 不指向任何锁定点（区别于旧版瞄准红线 + 落点双环）。
  drawMeleeFan(g, x, y, melee, blink) {
    const range = Math.max(6, Math.min(140, melee.range));
    const arc = Math.max(0.2, Math.min(Math.PI * 2, melee.arc));
    const color = blink ? C.blood : C.bloodDark;
    const alpha = blink ? 0.75 : 0.5;
    // 扇面淡填充：让「哪里会被扫到」一眼可读，又不会盖住地面纹理
    const wedge = [{ x, y }];
    const fillEdge = 10;
    for (let i = 0; i <= fillEdge; i++) {
      const a = melee.angle - arc / 2 + (arc * i) / fillEdge;
      wedge.push({ x: x + Math.cos(a) * range, y: y + Math.sin(a) * range });
    }
    pxPoly(g, wedge, C.blood, blink ? 0.18 : 0.11, true);
    const spokes = 4;
    // 辐条：每 5px 一个点、隔点跳过 → 虚线感，单只怪 ≤20 次绘制
    for (let i = 0; i <= spokes; i++) {
      const a = melee.angle - arc / 2 + (arc * i) / spokes;
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      for (let d = 5, n = 0; d <= range; d += 5, n++) {
        if (n % 2) continue;
        pxRect(g, Math.round(x + cos * d), Math.round(y + sin * d), 1, 1, color, alpha);
      }
    }
    // 弧边：扇形外沿 2px 点，亮拍用骨白提亮，给出「张角到哪里」
    const edge = 10;
    for (let i = 0; i <= edge; i++) {
      const a = melee.angle - arc / 2 + (arc * i) / edge;
      pxRect(g, Math.round(x + Math.cos(a) * range), Math.round(y + Math.sin(a) * range), 2, 1, blink ? C.parchment : color, alpha);
    }
  }

  drawSkeleton(g, x, y, bob, color, flash) {
    // 投影
    pxRect(g, x - 4, y + 6, 9, 1, C.void, 0.45);
    pxRect(g, x - 3, y + 7, 7, 1, C.void, 0.3);

    // 腿骨
    pxRect(g, x - 3, y + 3, 2, 4 - bob, color, 1);
    pxRect(g, x + 1, y + 3, 2, 4 - (1 - bob), color, 1);
    pxRect(g, x - 4, y + 6, 3, 1, color, 1);
    pxRect(g, x + 1, y + 6, 3, 1, color, 1);

    // 骨盆与脊柱
    pxRect(g, x - 3, y + 1, 6, 2, color, 1);
    pxRect(g, x - 1, y - 5, 2, 6, color, 1);

    // 肋骨
    pxRect(g, x - 3, y - 5, 6, 1, color, 1);
    pxRect(g, x - 4, y - 4, 8, 1, color, 1);
    pxRect(g, x - 4, y - 2, 8, 1, color, 1);
    pxRect(g, x - 3, y - 1, 6, 1, color, 1);
    // 肋骨缝的腐朽绿
    pxRect(g, x - 1, y - 4, 2, 1, C.rot, 0.8);
    pxRect(g, x - 1, y - 2, 2, 1, C.rot, 0.8);

    // 双臂
    pxRect(g, x - 5, y - 4 + bob, 1, 4, color, 1);
    pxRect(g, x + 4, y - 4 + (1 - bob), 1, 4, color, 1);

    // 骷髅头
    pxRect(g, x - 3, y - 11 + bob, 6, 5, color, 1);
    pxRect(g, x - 2, y - 12 + bob, 4, 1, color, 1);
    pxRect(g, x - 3, y - 10 + bob, 6, 1, C.stoneDark, 0.3);
    // 眼窝：统一冷绿，敌我色彩纪律
    pxRect(g, x - 2, y - 9 + bob, 1, 2, C.rot, 1);
    pxRect(g, x + 1, y - 9 + bob, 1, 2, C.rot, 1);
    pxRect(g, x - 1, y - 7 + bob, 2, 1, C.void, 1);
    // 下颌
    pxRect(g, x - 2, y - 6 + bob, 4, 1, color, 1);

    // 锈剑
    pxRect(g, x + 5, y - 3 + bob, 1, 7, C.rot, 1);
    pxRect(g, x + 4, y + 1 + bob, 3, 1, C.stoneDark, 1);
    pxRect(g, x + 5, y - 4 + bob, 1, 1, color, 0.8);

    if (flash > 0) pxRect(g, x - 4, y - 12, 9, 18, C.white, 0.62 * flash);
  }

  drawBat(g, x, y, color, flash) {
    const flap = Math.floor((this.walkPhase + this.phase * 10) / 90) % 2;
    const wingY = y - 5 + (flap ? 0 : 1);

    // 飞行投影离身体更远，读作“悬空”
    pxRect(g, x - 4, y + 6, 9, 1, C.void, 0.4);
    pxRect(g, x - 3, y + 7, 7, 1, C.void, 0.25);

    // 身体与头
    pxRect(g, x - 2, y - 1, 5, 5, color, 1);
    pxRect(g, x - 1, y - 3, 3, 2, color, 1);
    pxRect(g, x - 2, y - 5, 1, 2, color, 1);
    pxRect(g, x + 1, y - 5, 1, 2, color, 1);
    // 血眼
    pxRect(g, x - 1, y - 2, 1, 1, C.blood, 1);
    pxRect(g, x + 1, y - 2, 1, 1, C.blood, 1);

    // 翅膀：两帧上下扇动
    pxRect(g, x - 5, wingY, 3, 2, color, 0.9);
    pxRect(g, x + 2, wingY, 3, 2, color, 0.9);
    pxRect(g, x - 7, wingY + 1, 2, 1, color, 0.7);
    pxRect(g, x + 5, wingY + 1, 2, 1, color, 0.7);
    pxRect(g, x - 1, y + 3, 1, 2, color, 0.8);
    pxRect(g, x + 1, y + 3, 1, 2, color, 0.8);

    if (flash > 0) pxRect(g, x - 6, y - 6, 13, 13, C.white, 0.58 * flash);
  }

  drawCorpse(g, x, y, bob, color, flash) {
    // 投影更宽，体积感
    pxRect(g, x - 6, y + 6, 13, 1, C.void, 0.45);
    pxRect(g, x - 5, y + 7, 11, 1, C.void, 0.3);

    // 拖行的脚
    pxRect(g, x - 5, y + 3, 3, 4, C.stoneDark, 1);
    pxRect(g, x + 2, y + 4, 3, 3, C.stoneDark, 1);

    // 躯干
    pxRect(g, x - 5, y - 5 + bob, 10, 9, color, 1);
    pxRect(g, x - 4, y - 7 + bob, 8, 3, color, 1);
    // 破烂裹尸布
    pxRect(g, x - 5, y - 1 + bob, 3, 5, C.nightSoft, 0.9);
    pxRect(g, x + 3, y - 3 + bob, 3, 7, C.nightSoft, 0.9);

    // 前伸的双臂
    pxRect(g, x - 8, y - 4 + bob, 3, 2, color, 1);
    pxRect(g, x + 6, y - 5 + bob, 3, 2, color, 1);
    pxRect(g, x - 9, y - 3 + bob, 1, 1, C.bone, 0.6);
    pxRect(g, x + 8, y - 4 + bob, 1, 1, C.bone, 0.6);

    // 头与缝线
    pxRect(g, x - 3, y - 12 + bob, 6, 5, color, 1);
    pxRect(g, x - 2, y - 13 + bob, 4, 1, C.stoneDark, 0.6);
    pxRect(g, x - 2, y - 10 + bob, 1, 2, C.blood, 1);
    pxRect(g, x + 1, y - 10 + bob, 1, 2, C.blood, 1);
    pxRect(g, x, y - 8 + bob, 2, 1, C.blood, 0.8);
    pxRect(g, x, y - 3 + bob, 2, 1, C.blood, 0.9);

    if (flash > 0) pxRect(g, x - 8, y - 13, 17, 21, C.white, 0.58 * flash);
  }

  drawCultist(g, x, y, bob, color, flash) {
    pxRect(g, x - 4, y + 6, 9, 1, C.void, 0.45);

    // 长袍
    pxRect(g, x - 4, y - 6 + bob, 8, 12, color, 1);
    pxRect(g, x - 3, y + 4, 7, 2, C.nightDeep, 0.9);
    pxRect(g, x - 5, y + 5, 2, 1, color, 1);
    pxRect(g, x + 4, y + 5, 2, 1, color, 1);

    // 兜帽与阴影里的脸
    pxRect(g, x - 3, y - 11 + bob, 6, 5, color, 1);
    pxRect(g, x - 2, y - 13 + bob, 4, 2, color, 1);
    pxRect(g, x - 2, y - 9 + bob, 4, 3, C.void, 1);

    // 冷绿目光
    pxRect(g, x - 2, y - 9 + bob, 1, 1, C.teal, 1);
    pxRect(g, x + 1, y - 9 + bob, 1, 1, C.teal, 1);

    // 祭司法杖与法器
    const staffX = x + 6;
    pxRect(g, staffX, y - 10 + bob, 1, 16, C.brassDark, 1);
    pxDiamond(g, staffX, y - 12 + bob, 2, C.blood, 1, true);
    if (this.windup) pxRing(g, staffX, y - 12 + bob, 4, C.blood, 0.9, 1);

    // 献祭项链
    pxRect(g, x - 1, y - 4 + bob, 3, 1, C.brass, 0.9);
    pxRect(g, x - 1, y - 2 + bob, 1, 1, C.blood, 0.8);
    pxRect(g, x + 1, y - 2 + bob, 1, 1, C.blood, 0.8);

    if (flash > 0) pxRect(g, x - 5, y - 13, 11, 20, C.white, 0.58 * flash);
  }

  drawKnight(g, x, y, bob, color, flash) {
    // 冲锋残影
    if (this.charging && this.brain?.dir) {
      const dir = this.brain.dir;
      for (let i = 1; i <= 3; i++) {
        const tx = x - dir.x * (6 + i * 4);
        const ty = y - dir.y * (6 + i * 4);
        pxRect(g, tx - 2, ty - 1, 5, 3, C.stoneLight, 0.3 - i * 0.06);
      }
    }

    // 投影
    pxRect(g, x - 6, y + 7, 13, 2, C.void, 0.5);

    // 腿甲
    pxRect(g, x - 5, y + 2, 3, 5, C.stoneDark, 1);
    pxRect(g, x + 2, y + 2, 3, 5, C.stoneDark, 1);

    // 躯干甲与胸饰
    pxRect(g, x - 6, y - 6 + bob, 12, 9, color, 1);
    pxRect(g, x - 4, y - 4 + bob, 8, 3, C.brassDark, 0.8);
    pxRect(g, x - 1, y - 4 + bob, 2, 2, C.brass, 0.9);

    // 肩甲
    pxRect(g, x - 8, y - 6 + bob, 3, 3, C.stoneLight, 1);
    pxRect(g, x + 5, y - 6 + bob, 3, 3, C.stoneLight, 1);

    // 头盔与冷绿眼光
    pxRect(g, x - 4, y - 13 + bob, 8, 7, color, 1);
    pxRect(g, x - 3, y - 11 + bob, 6, 1, C.void, 1);
    pxRect(g, x - 3, y - 10 + bob, 2, 1, C.teal, 1);
    pxRect(g, x + 1, y - 10 + bob, 2, 1, C.teal, 1);

    // 红缨
    pxRect(g, x - 1, y - 16 + bob, 2, 3, C.blood, 1);

    // 阔剑
    const swordX = x + 8;
    pxRect(g, swordX, y - 8 + bob, 1, 12, C.bone, 1);
    pxRect(g, swordX - 2, y - 1 + bob, 5, 1, C.brassDark, 1);

    if (flash > 0) pxRect(g, x - 8, y - 16, 17, 24, C.white, 0.58 * flash);
  }

  drawHealth(g, x, y) {
    if (this.hp >= this.maxHp) return;
    const ratio = Math.max(0, Math.min(1, this.hp / this.maxHp));
    const chip = Math.max(ratio, Math.min(1, this.hpChip / this.maxHp));
    const barY = y - this.radius - 15;
    pxRect(g, x - 6, barY, 13, 2, C.void, 0.8);
    if (chip > ratio) pxRect(g, x - 5, barY + 1, Math.max(1, Math.round(11 * chip)), 1, C.brassLight, 0.95);
    pxRect(g, x - 5, barY + 1, Math.max(1, Math.round(11 * ratio)), 1, C.blood, 1);
  }


  destroy() {
    for (const entry of this.parts) entry.sprite?.destroy();
    this.parts.length = 0;
    this.part = null;
    this.sprite?.destroy();
    this.g.destroy();
  }
}
