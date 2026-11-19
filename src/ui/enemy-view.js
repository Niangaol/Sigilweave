// 敌人绘制：程序化回退（骷髅/蝙蝠/腐尸/邪教徒/骑士）、血条、施法姿态、地面扇形、编队标记。
// 从 entities/Enemy.js 拆出（2026-11-19 架构重构波 4）：只搬家不改像素。
// 所有函数第一个参数是 Enemy 实例，字段一律从 e 读；素材精灵路径（drawSpriteBody）保留原样。
import { C, pxRect, pxDiamond, pxPoly, pxRing } from './Palette.js';
import { placeVariantPart } from './variant-parts.js';

// defId → 素材 key（《美术素材交付规范 v1.0》参数总表）。
// stitch_abomination 用 ghoul（尸骸体量贴合缝合尸魁）；oath_bishop 用 cultist 放大提色（同属robed施法者）。
export const ENEMY_TEXTURE = {
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
export const ENEMY_FEET = {
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
export const ENEMY_ANIM = { skeleton: 'skeleton', corpse: 'corpse' };
// 编队标记的 4 个预设色（spec §5.4）：按编队实例 id 哈希取，同队同色、不同队尽量不同色。
// 用 4 槽轮转而不是全色板：同屏最多几队，4 色足够分开，也免得每队一个色反而像装饰。
// 注意青=护盾条、金=精英框都在别处有固定含义，这里确实借用了其中两色——
// 三角是脚下 6×4 的填充小图形、没有描边、透明度 0.85，靠形状和位置区分，
// 不靠颜色独占语义；实机若糊成一团再换色板。
const FORMATION_MARK_COLORS = Object.freeze([C.teal, C.arcane, C.brass, C.mute]);

// 一个够用的确定性哈希：只用来把 id 摊到 4 个槽位，不追求分布质量。
// 不能用 Math.random（会让同一队在两个客户端画出不同颜色），也不能用对象 id。
function formationColorIndex(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 4096;
  return h % FORMATION_MARK_COLORS.length;
}

// 精英放大/提色，让大体积敌人撑住半径
export const ENEMY_STYLE = {
  stitch_abomination: { scale: 1.15 },
  oath_bishop: { scale: 1.2, tint: 0x9a86b8 },
  brass_warden: { scale: 1.1 },
  // 后四幕精英统一放大 15%，普通怪保持原尺寸
  index_hound: { scale: 1.15 },
  scale_arbiter: { scale: 1.15 },
  anvil_tyrant: { scale: 1.15 },
  eclipse_priest: { scale: 1.15 },
};

export function drawEnemy(e, now) {
  const x = Math.round(e.x);
  const y = Math.round(e.y);
  const off = e.hitOffset(now);
  const rx = x + off.x;
  const ry = y + off.y;
  const moving = Math.abs(e.x - e.prevX) > 0.02;
  if (moving) e.face = e.x < e.prevX ? -1 : 1;
  if (e.sprite) {
    drawSpriteBody(e, now, rx, ry, off.flash, moving, off.age, off.hitT, off.power);
  } else {
    drawProcedural(e, rx, ry, off.flash);
  }
  drawOverlay(e, x, y, now);
  // 配件（盾/肩甲/王冠）逐帧跟随本体：位置、缩放、朝向、层级都在这里刷新
  placeVariantPart(this);
  e.prevX = e.x;
}

// ---------- 素材表现 ----------
export function drawSpriteBody(e, now, x, y, flash, moving, age = Infinity, hitT = 0, power = 0) {
  const s = e.sprite;
  // 蝙蝠没有飞行动画，用旧节奏做 1px 上下浮动，读作振翅
  const bob = e.defId === 'bat' && Math.floor((e.walkPhase + e.phase * 10) / 90) % 2 === 0 ? -1 : 0;
  s.setPosition(x, y + (ENEMY_FEET[e.defId] ?? 7) + bob);
  s.setDepth(Math.floor(e.y));
  s.setFlipX(e.face < 0);
  s.setVisible(e.alive);
  // 受击挤压：横向鼓一点、纵向压一点，再沿受击方向轻微倾斜（脚底为原点，倾斜不会飘）
  const base = e.baseScale ?? 1;
  const squash = 0.18 * power * hitT;
  s.setScale(base * (1 + squash), base * (1 - squash * 0.8));
  s.setRotation(-(e.hitDirX ?? 0) * 0.12 * power * hitT);
  // 闪白 → 残红 → 回到原本的状态色，三帧层次比单帧白闪更「打实了」
  if (flash > 0.55) {
    s.setTintFill(0xffffff);
  } else if (flash > 0) {
    s.setTint(0xff9d93);
  } else if (age >= 0 && age < 170) {
    s.setTint(0xd98a84);
  } else if ((e.frozenUntil ?? 0) > (e.scene?.engine?.now ?? 0)) {
    // 冻结优先于抬手：冰蓝是状态，抬起的手不该盖掉它
    s.setTint(0x9fd8ff);
  } else if (e.windup) {
    // 抬手：身体亮色按 90ms 节拍闪动（tint 只改表现，不动逻辑坐标/碰撞）。
    // 远程抬手只闪身体、不画任何指向线；近战的地面扇形由 drawCastPose 补。
    const t = Number.isFinite(now) ? now : (e.scene?.engine?.now ?? 0);
    s.setTint(Math.floor(t / 90) % 2 === 0 ? 0xffe6c0 : 0xffc98a);
  } else {
    // 受击状态色恢复到「变体 tint 优先、否则该型固有 tint」，都没配就清掉
    if (e.tintColor != null) s.setTint(e.tintColor);
    else s.clearTint();
  }
  const prefix = ENEMY_ANIM[e.defId];
  if (!e.alive || !prefix || !e.scene.anims?.exists(prefix + '-idle')) return;
  let want = 'idle';
  if (e.windup) want = 'attack';
  else if (e.speed > 0 && moving) want = 'walk';
  const key = prefix + '-' + want;
  // 一次性动画（挥剑/攻击）播完后 currentAnim 不清，必须允许 !isPlaying 时重播
  if (e.scene.anims.exists(key) && (s.anims.currentAnim?.key !== key || !s.anims.isPlaying)) s.play(key, true);
}

// 预警线 / 血条 / 精英描边 / 盾条 / 眩晕：覆盖层，压在精灵上一层。
// 素材路径按精灵实际外框定位，避免大体积精灵把标记画进身体里。
export function drawOverlay(e, x, y, now = Infinity) {
  const g = e.g;
  g.clear();
  drawCastPose(e, g, x, y, now);
  const m = overlayMetrics(e, x, y);
  if (e.sprite) {
    if (e.def?.elite) {
      pxRect(g, x - m.hw, m.top, m.hw * 2, 1, C.brass, 0.9);
      pxRect(g, x - m.hw, y + e.radius + 1, m.hw * 2, 1, C.brass, 0.9);
      pxRect(g, x - m.hw, m.top, 1, y + e.radius + 2 - m.top, C.brass, 0.9);
      pxRect(g, x + m.hw - 1, m.top, 1, y + e.radius + 2 - m.top, C.brass, 0.9);
      pxRect(g, x - 8, m.top - 6, 16, 2, C.void, 0.8);
      pxRect(g, x - 8, m.top - 6, Math.max(1, Math.round(16 * e.hp / e.maxHp)), 2, C.brassLight, 1);
    }
    if (e.hp < e.maxHp) {
      const ratio = Math.max(0, Math.min(1, e.hp / e.maxHp));
      // 延迟白条：先留在受伤前的位置，220ms 后再缩回真实血量
      const chip = Math.max(ratio, Math.min(1, e.hpChip / e.maxHp));
      pxRect(g, x - 6, m.barY, 13, 2, C.void, 0.8);
      if (chip > ratio) pxRect(g, x - 5, m.barY + 1, Math.max(1, Math.round(11 * chip)), 1, C.brassLight, 0.95);
      pxRect(g, x - 5, m.barY + 1, Math.max(1, Math.round(11 * ratio)), 1, C.blood, 1);
    }
  } else {
    drawHealth(e, g, x, y);
    if (e.def?.elite) {
      pxRect(g, x - e.radius - 2, y - e.radius - 2, e.radius * 2 + 4, 1, C.brass, 0.9);
      pxRect(g, x - e.radius - 2, y + e.radius + 1, e.radius * 2 + 4, 1, C.brass, 0.9);
      pxRect(g, x - e.radius - 2, y - e.radius - 2, 1, e.radius * 2 + 4, C.brass, 0.9);
      pxRect(g, x + e.radius + 1, y - e.radius - 2, 1, e.radius * 2 + 4, C.brass, 0.9);
      pxRect(g, x - 8, y - e.radius - 8, 16, 2, C.void, 0.8);
      pxRect(g, x - 8, y - e.radius - 8, Math.max(1, Math.round(16 * e.hp / e.maxHp)), 2, C.brassLight, 1);
    }
  }
  drawShieldBar(e, g, x, m.barY);
  drawStun(e, g, x, m.top, now);
  drawShieldFlash(e, g, x, m, now);
  drawFormationMark(e, g, x, y);
}

// 编队标记（spec §5.4）：脚下一个小三角，同队同色。
// 放在 drawOverlay 而不是 draw 里单独画：覆盖层每次都会 clear 后重画，
// 标记跟着它走就自然不会有「上一帧的三角没擦掉」。
// 精英不画——它们不吃光环，画了会让玩家误以为「先打那个带标记的」。
// 但有一个例外：站前排的精英要画。盾墙的前排池里第 3/5 幕只有精英黄铜守誓者，
// 它是光环**唯一**的来源；不画就等于「光环来自一只没有标记的怪」，
// 而 G19 的文案恰恰在教玩家「打掉带三角标记的前排」。收方规则不变（精英仍不吃光环）。
export function drawFormationMark(e, g, x, y) {
  if (!e.formationId) return;
  if (e.isBoss) return;
  if (e.def?.elite && e.formationPath !== 'vanguard') return;
  // 色相按「这一批」取，不按模板：同模板连着刷两批时，两批是两支独立的队，
  // 同色会让玩家把两批看成一队，而光环实际是各算各的。
  const id = String(e.formationUid ?? e.formationId);
  const color = FORMATION_MARK_COLORS[formationColorIndex(id)];
  // 脚底基线两条路径不同：素材的脚在 ENEMY_FEET，程序化的脚在半径处。
  // 画在脚下 2px 起，避免和身体像素糊在一起。
  const feet = e.sprite ? y + (ENEMY_FEET[e.defId] ?? 7) : y + e.radius;
  const top = feet + 2;
  // pxPoly 传三个顶点就是三角形（Palette 没有 pxTriangle，且 Palette 已冻结不能加）。
  pxPoly(g, [
    { x, y: top },
    { x: x + 3, y: top + 4 },
    { x: x - 3, y: top + 4 },
  ], color, 0.85);
}

// 覆盖层定位基准：素材路径吃精灵实际外框，程序化路径退回逻辑半径。
// barY 与血条同基线，盾条画在它上方 3px。
export function overlayMetrics(e, x, y) {
  if (e.sprite) {
    const s = e.sprite;
    const hw = Math.round((s.displayWidth ?? 2 * e.radius) / 2) + 2;
    const h = Number.isFinite(s.displayHeight) && s.displayHeight > 0 ? s.displayHeight : 2 * e.radius;
    const top = Math.round(y + (ENEMY_FEET[e.defId] ?? 7) - h);
    return { hw, top, barY: top - 4, width: hw * 2, height: Math.max(1, Math.round(h)) };
  }
  const hw = e.radius + 2;
  return {
    hw,
    top: y - e.radius - 10,
    barY: y - e.radius - 15,
    width: hw * 2,
    height: e.radius * 2 + 10,
  };
}

// 一次性护盾条：血条上方 3px 的 11×1 青钢条，长度按剩余盾值比例。
export function drawShieldBar(e, g, x, barY) {
  if (!(e.shield > 0)) return;
  const max = e.shieldMax > 0 ? e.shieldMax : 1;
  const ratio = Math.max(0, Math.min(1, e.shield / max));
  pxRect(g, x - 6, barY - 3, 13, 1, C.void, 0.7);
  pxRect(g, x - 5, barY - 3, Math.max(1, Math.round(11 * ratio)), 1, C.teal, 1);
}

// 破盾眩晕：头顶 3 个菱形按固定相位绕头转（只用 now 推导，不用随机数）。
export function drawStun(e, g, x, top, now) {
  if (!(Number.isFinite(now) && now < e.stunUntil)) return;
  const t = now - (e.stunUntil - 400);
  for (let i = 0; i < 3; i++) {
    const a = (t / 260) * Math.PI * 2 + (i * Math.PI * 2) / 3;
    const px = Math.round(x + Math.cos(a) * 5);
    const py = Math.round(top - 4 + Math.sin(a) * 2);
    pxDiamond(g, px, py, 2, C.outline, 1, true);
    pxDiamond(g, px, py, 1, C.bone, 1, true);
  }
}

// 破盾白闪：160ms 内给整个身体压一层白，与特效层的碎片同时出现。
export function drawShieldFlash(e, g, x, m, now) {
  const age = now - e.shieldFlashAt;
  if (!(age >= 0 && age < 160)) return;
  const flash = 1 - age / 160;
  const w = Math.max(1, Math.round(m.width));
  const h = Math.max(1, Math.round(m.height));
  pxRect(g, x - Math.round(w / 2), m.top, w, h, C.white, 0.7 * flash);
}

// ---------- 程序化回退（素材缺失时，行为与旧版一致） ----------
export function drawProcedural(e, x, y, flash) {
  const g = e.g;
  g.clear();
  const step = Math.floor((e.walkPhase + e.phase * 10) / 160) % 2;
  const bob = step;
  const color = e.def?.color ?? C.bone;
  // 抬手姿态统一在 drawOverlay 里画（draw() 每次都会调用它），此处不重复画
  switch (e.defId) {
    case 'bat': drawBat(e, g, x, y, color, flash); break;
    case 'corpse': drawCorpse(e, g, x, y, bob, color, flash); break;
    case 'cultist': drawCultist(e, g, x, y, bob, color, flash); break;
    case 'knight': drawKnight(e, g, x, y, bob, color, flash); break;
    default: drawSkeleton(e, g, x, y, bob, color, flash); break;
  }
  drawHealth(e, g, x, y);
  if (e.def?.elite) {
    pxRect(g, x - e.radius - 2, y - e.radius - 2, e.radius * 2 + 4, 1, C.brass, 0.9);
    pxRect(g, x - e.radius - 2, y + e.radius + 1, e.radius * 2 + 4, 1, C.brass, 0.9);
    pxRect(g, x - e.radius - 2, y - e.radius - 2, 1, e.radius * 2 + 4, C.brass, 0.9);
    pxRect(g, x + e.radius + 1, y - e.radius - 2, 1, e.radius * 2 + 4, C.brass, 0.9);
    pxRect(g, x - 8, y - e.radius - 8, 16, 2, C.void, 0.8);
    pxRect(g, x - 8, y - e.radius - 8, Math.max(1, Math.round(16 * e.hp / e.maxHp)), 2, C.brassLight, 1);
  }
}

// 抬手姿态（替代旧的瞄准线预告）：身体亮色闪 + 头顶小菱形；
// 近战前摇额外在地面画扇形提示（仅近战，不是瞄准线/落点环）。
// 远程抬手不画任何指向线——方向在发射瞬间才算，玩家靠「抬手」读威胁。
export function drawCastPose(e, g, x, y, now = 0) {
  if (!e.windup) return;
  const t = Number.isFinite(now) ? now : 0;
  const blink = Math.floor(t / 90) % 2 === 0;
  // 头顶小菱形：暗描边打底 + arcane 核，亮拍再点白芯（纯填充，不依赖 stroke API）
  const dy = y - e.radius - 11;
  pxDiamond(g, x, dy, 3, C.outline, 1, true);
  pxDiamond(g, x, dy, 2, C.arcane, blink ? 1 : 0.55, true);
  if (blink) pxDiamond(g, x, dy, 1, C.white, 0.95, true);
  // 抬手弧光：只取肩线以上一段「括号」形，不再围成整只怪的方框（那会像 UI 选中框）。
  // 素材/程序化两条路径共用；顶边 + 两侧短竖边，亮度随闪拍呼吸。
  const m = overlayMetrics(e, x, y);
  const hw = Math.max(2, Math.round(m.width / 2));
  const top = Math.round(m.top) + 2;
  const bodyH = Math.max(4, y + e.radius - top);
  const tick = Math.max(3, Math.min(9, Math.round(bodyH * 0.32)));
  const col = blink ? C.arcaneLight : C.arcane;
  const alpha = blink ? 0.55 : 0.3;
  pxRect(g, x - hw, top, 2, tick, col, alpha);
  pxRect(g, x + hw - 2, top, 2, tick, col, alpha);
  pxRect(g, x - hw, top, hw * 2, 1, col, alpha);
  // 近战前摇：地面扇形。角度/张角/距离由 AI 在 windup 期间给出（见 meleePreview）。
  const preview = meleePreview(e);
  if (preview) drawMeleeFan(e, g, x, y, preview, blink);
}

// windup 期间从 brain 读取近战预告：优先 meleePreview / melee，其次 tune 里的近战参数
// （若 T2 只把参数放进 tune，就用「当前朝玩家」补角度）。缺失时返回 null，不画扇形。
export function meleePreview(e) {
  const brain = e.brain;
  const p = brain?.meleePreview ?? brain?.melee;
  if (p
    && Number.isFinite(p.angle) && Number.isFinite(p.range) && Number.isFinite(p.arc)
    && p.range > 0 && p.arc > 0) {
    return { angle: p.angle, range: p.range, arc: p.arc };
  }
  return null;
}

// 地面扇形提示：几条虚线辐条 + 弧边，低透明度硬边点阵；只标「哪里会被扫到」，
// 不指向任何锁定点（区别于旧版瞄准红线 + 落点双环）。
export function drawMeleeFan(e, g, x, y, melee, blink) {
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

export function drawSkeleton(e, g, x, y, bob, color, flash) {
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

export function drawBat(e, g, x, y, color, flash) {
  const flap = Math.floor((e.walkPhase + e.phase * 10) / 90) % 2;
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

export function drawCorpse(e, g, x, y, bob, color, flash) {
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

export function drawCultist(e, g, x, y, bob, color, flash) {
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
  if (e.windup) pxRing(g, staffX, y - 12 + bob, 4, C.blood, 0.9, 1);

  // 献祭项链
  pxRect(g, x - 1, y - 4 + bob, 3, 1, C.brass, 0.9);
  pxRect(g, x - 1, y - 2 + bob, 1, 1, C.blood, 0.8);
  pxRect(g, x + 1, y - 2 + bob, 1, 1, C.blood, 0.8);

  if (flash > 0) pxRect(g, x - 5, y - 13, 11, 20, C.white, 0.58 * flash);
}

export function drawKnight(e, g, x, y, bob, color, flash) {
  // 冲锋残影
  if (e.charging && e.brain?.dir) {
    const dir = e.brain.dir;
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

export function drawHealth(e, g, x, y) {
  if (e.hp >= e.maxHp) return;
  const ratio = Math.max(0, Math.min(1, e.hp / e.maxHp));
  const chip = Math.max(ratio, Math.min(1, e.hpChip / e.maxHp));
  const barY = y - e.radius - 15;
  pxRect(g, x - 6, barY, 13, 2, C.void, 0.8);
  if (chip > ratio) pxRect(g, x - 5, barY + 1, Math.max(1, Math.round(11 * chip)), 1, C.brassLight, 0.95);
  pxRect(g, x - 5, barY + 1, Math.max(1, Math.round(11 * ratio)), 1, C.blood, 1);
}


