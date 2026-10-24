// 敌人实体：移动与开火全部交给纯逻辑 src/logic/enemy-ai.js。
// 本文件只负责场景接线：身体用素材（骨架/腐尸为 12 帧精灵表，其余为单帧图），
// 预警线、血条、精英描边走 Graphics 覆盖层。素材缺失时整体降级为程序化像素绘制。
import { C, pxRect, pxLine, pxRing, pxDiamond } from '../ui/Palette.js';
import { createBrain, stepBrain } from '../logic/enemy-ai.js';

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
  bat: 'undead_bat',
  cultist: 'cultist',
  knight: 'death_knight',
  stitch_abomination: 'ghoul',
  oath_bishop: 'cultist',
};
// 精灵脚底相对逻辑坐标 y 的偏移（对齐各旧程序化美术的脚底）
const ENEMY_FEET = {
  skeleton: 7, corpse: 7, bat: 4, cultist: 6, knight: 7,
  stitch_abomination: 9, oath_bishop: 8,
};
// 走/攻动画前缀（只有两张表有动画；单帧图只做朝向翻转）
const ENEMY_ANIM = { skeleton: 'skeleton', corpse: 'corpse' };
// 精英放大/提色，让大体积敌人撑住半径
const ENEMY_STYLE = {
  stitch_abomination: { scale: 1.15 },
  oath_bishop: { scale: 1.2, tint: 0x9a86d8 },
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
      const style = ENEMY_STYLE[this.defId];
      if (style?.scale) this.sprite.setScale(style.scale);
      if (style?.tint) this.sprite.setTint(style.tint);
      this.sprite.setDepth(Math.floor(this.y));
      const prefix = ENEMY_ANIM[this.defId];
      if (prefix && scene.anims?.exists(prefix + '-idle')) this.sprite.play(prefix + '-idle');
    }
    this.brain = createBrain(this.defId, {
      now: scene.engine?.now ?? 0,
      seed: this.defId + ':' + this.id,
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

  update(dtMs, now) {
    if (!this.alive) return;
    const factor = this.speedFactor(now);
    const result = stepBrain(this.brain, {
      dtMs,
      now,
      self: this.selfState(factor),
      player: this.playerState(),
      opts: { BATTLE: this.bounds, damage: this.baseDamage },
    });
    this.applyResult(result, dtMs);
    this.draw(now);
    this.g.setDepth(Math.floor(this.y) + 0.5);
    // 大地图世界边界由 enemy-ai 的 bounds 约束；离玩家过远的回收在战斗层处理
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
    this.windup = result.windup === true;
    this.charging = result.charging === true;
    this.damage = this.charging ? Math.round(this.baseDamage * CHARGE_DAMAGE_MUL) : this.baseDamage;
    // 敌方弹丸转发；addHostileShot 不存在时静默跳过（纯逻辑可单独测试）
    if (Array.isArray(result.shots) && result.shots.length && typeof this.scene.addHostileShot === 'function') {
      for (const shot of result.shots) this.scene.addHostileShot(shot);
    }
    // 精英践踏事件转发（缝合尸魁）：由战斗层判定玩家是否在圈内
    if (result.stomp && typeof this.scene.onEnemyStomp === 'function') {
      this.scene.onEnemyStomp(this, result.stomp);
    }
    if (Number.isFinite(dtMs) && dtMs > 0) this.walkPhase += dtMs;
  }

  // 返回是否死亡
  takeDamage(amount, now) {
    if (!this.alive) return false;
    this.hp -= amount;
    this.hitAt = now;
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      return true;
    }
    return false;
  }

  draw(now) {
    const x = Math.round(this.x);
    const y = Math.round(this.y);
    const flash = Number.isFinite(now) && now - this.hitAt < 90;
    const moving = Math.abs(this.x - this.prevX) > 0.02;
    if (moving) this.face = this.x < this.prevX ? -1 : 1;
    if (this.sprite) {
      this.drawSpriteBody(now, x, y, flash, moving);
    } else {
      this.drawProcedural(x, y, flash);
    }
    this.drawOverlay(x, y);
    this.prevX = this.x;
  }

  // ---------- 素材表现 ----------
  drawSpriteBody(now, x, y, flash, moving) {
    const s = this.sprite;
    // 蝙蝠没有飞行动画，用旧节奏做 1px 上下浮动，读作振翅
    const bob = this.defId === 'bat' && Math.floor((this.walkPhase + this.phase * 10) / 90) % 2 === 0 ? -1 : 0;
    s.setPosition(x, y + (ENEMY_FEET[this.defId] ?? 7) + bob);
    s.setDepth(Math.floor(y));
    s.setFlipX(this.face < 0);
    s.setVisible(this.alive);
    if (flash) {
      s.setTintFill(0xffffff);
    } else {
      s.clearTint();
      const style = ENEMY_STYLE[this.defId];
      if (style?.tint) s.setTint(style.tint);
    }
    const prefix = ENEMY_ANIM[this.defId];
    if (!this.alive || !prefix || !this.scene.anims?.exists(prefix + '-idle')) return;
    let want = 'idle';
    if (this.windup) want = 'attack';
    else if (this.speed > 0 && moving) want = 'walk';
    const key = prefix + '-' + want;
    if (this.scene.anims.exists(key) && s.anims.currentAnim?.key !== key) s.play(key, true);
  }

  // 预警线 / 血条 / 精英描边：覆盖层，压在精灵上一层。
  // 素材路径按精灵实际外框定位，避免大体积精灵把标记画进身体里。
  drawOverlay(x, y) {
    const g = this.g;
    g.clear();
    this.drawTelegraph(g, x, y);
    if (this.sprite) {
      const s = this.sprite;
      const hw = Math.round((s.displayWidth ?? 2 * this.radius) / 2) + 2;
      const top = Math.round(y + (ENEMY_FEET[this.defId] ?? 7) - (s.displayHeight ?? 2 * this.radius));
      if (this.def?.elite) {
        pxRect(g, x - hw, top, hw * 2, 1, C.brass, 0.9);
        pxRect(g, x - hw, y + this.radius + 1, hw * 2, 1, C.brass, 0.9);
        pxRect(g, x - hw, top, 1, y + this.radius + 2 - top, C.brass, 0.9);
        pxRect(g, x + hw - 1, top, 1, y + this.radius + 2 - top, C.brass, 0.9);
        pxRect(g, x - 8, top - 6, 16, 2, C.void, 0.8);
        pxRect(g, x - 8, top - 6, Math.max(1, Math.round(16 * this.hp / this.maxHp)), 2, C.brassLight, 1);
      }
      if (this.hp < this.maxHp) {
        const ratio = Math.max(0, Math.min(1, this.hp / this.maxHp));
        const barY = top - 4;
        pxRect(g, x - 6, barY, 13, 2, C.void, 0.8);
        pxRect(g, x - 5, barY + 1, Math.max(1, Math.round(11 * ratio)), 1, C.blood, 1);
      }
      return;
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

  // ---------- 程序化回退（素材缺失时，行为与旧版一致） ----------
  drawProcedural(x, y, flash) {
    const g = this.g;
    g.clear();
    const step = Math.floor((this.walkPhase + this.phase * 10) / 160) % 2;
    const bob = step;
    const color = this.def?.color ?? C.bone;
    this.drawTelegraph(g, x, y);
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

  // 预警：血线指向锁定的目标点，目标点画蹄形环，敌人头顶亮菱形
  drawTelegraph(g, x, y) {
    if (!this.windup) return;
    const aim = this.brain?.aim;
    if (!aim || !Number.isFinite(aim.x) || !Number.isFinite(aim.y)) return;
    pxLine(g, x, y - 2, aim.x, aim.y, C.blood, 0.4);
    pxRing(g, aim.x, aim.y, 9, C.blood, 0.75, 1);
    pxDiamond(g, x, y - this.radius - 10, 2, C.blood, 0.9, true);
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

    if (flash) pxRect(g, x - 4, y - 12, 9, 18, C.white, 0.65);
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

    if (flash) pxRect(g, x - 6, y - 6, 13, 13, C.white, 0.6);
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

    if (flash) pxRect(g, x - 8, y - 13, 17, 21, C.white, 0.6);
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

    if (flash) pxRect(g, x - 5, y - 13, 11, 20, C.white, 0.6);
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

    if (flash) pxRect(g, x - 8, y - 16, 17, 24, C.white, 0.6);
  }

  drawHealth(g, x, y) {
    if (this.hp >= this.maxHp) return;
    const ratio = Math.max(0, Math.min(1, this.hp / this.maxHp));
    const barY = y - this.radius - 15;
    pxRect(g, x - 6, barY, 13, 2, C.void, 0.8);
    pxRect(g, x - 5, barY + 1, Math.max(1, Math.round(11 * ratio)), 1, C.blood, 1);
  }


  destroy() {
    this.sprite?.destroy();
    this.g.destroy();
  }
}
