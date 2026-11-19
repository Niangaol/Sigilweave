// 顶栏：生命 / 符文碎片 / 最近 5 秒实测触发频率 / 幕数与时间
// 黄铜刻度尺式血条，整体保持「羊皮纸面板 + 黄铜边」的 UI 语言。
import { C, HEX, addText, pxRect, pxFrame, pxPoly, pxHeart, pxShard, fmtTime } from './Palette.js';
import { PLAYER } from '../data/roster.js';
import { STAGE_CARDS } from '../data/cinematics.js';
import { passiveHudText } from './passive-summary.js';

// 幕是 1..5 的叙事单位，场是 1..7 的玩法单位。
// 前三幕各一场，顶栏用星名（第3幕 · 天玑）；合并幕用当前场的地名（第4幕 · 沉钟书库 → 衡律法庭）。
// 道具技能栏：三个 44×30 的硬边槽，放在底部、罗盘（右下）与提示（左下）之间的空档。
const SKILL_BAR = Object.freeze({ left: 178, top: 216, slotW: 44, slotH: 28, gap: 6 });
// 右键冲刺冷却环：技能栏左侧 24×24。右边留 6px 空档不与技能栏贴在一起，
// 环内画朝向 facing 的箭头（就绪）或顺时针压下的扇形遮罩（冷却中）。
const DASH_RING = Object.freeze({ left: 148, top: 216, size: 24 });

const ACT_CN = ['一', '二', '三', '四', '五'];
function actLabel(chapter, stage) {
  const c = Number.isInteger(chapter) && chapter >= 1 && chapter <= 5 ? chapter : 1;
  const s = Number.isInteger(stage) && stage >= 1 && stage <= 7 ? stage : c;
  const card = STAGE_CARDS[s];
  const tail = c <= 3 ? (card?.star ?? '') : (card?.title ?? '');
  return '第' + ACT_CN[c - 1] + '幕 · ' + tail;
}

export default class Hud {
  constructor(scene) {
    this.scene = scene;
    this.bg = scene.add.graphics().setDepth(1000).setScrollFactor(0);
    this.dyn = scene.add.graphics().setDepth(1001).setScrollFactor(0);

    this.hpText = addText(scene, 92, 13, '100', 9, HEX.parchment).setDepth(1002);
    this.shardText = addText(scene, 146, 13, '碎片 0', 9, HEX.parchment).setDepth(1002);
    this.freqText = addText(scene, 208, 13, '脉频 0.0/s', 9, HEX.arcaneLight).setDepth(1002);
    this.actText = addText(scene, 300, 13, '第一幕 · 天枢', 8, HEX.brassLight).setDepth(1002);
    this.timeText = addText(scene, 468, 13, '00:00', 9, HEX.parchment).setDepth(1002).setOrigin(1, 0);
    // 成长信息单列第二行，延续黄铜刻度与青色经验。
    // 第二行右半是空的：EXP 文案到 ~215 收尾，这里从 236 起放局内被动计数，
    // 7px 字最多长到 ~305，够不到第一行的场次名（300）与右边的时间（468 右对齐）。
    this.passiveText = addText(scene, 236, 29, '被动 · 按 Esc 查看', 7, HEX.mute).setDepth(1002);
    this.lvText = addText(scene, 8, 29, 'LV 1', 9, HEX.brassLight).setDepth(1002);
    this.expText = addText(scene, 170, 29, 'EXP 0/10', 9, HEX.teal).setDepth(1002);
    for (const text of [this.hpText, this.shardText, this.freqText, this.actText, this.timeText, this.lvText, this.expText, this.passiveText]) text.setScrollFactor(0);
    // act 存的是「幕:场」缓存键，不是文案；换场要能靠 key 变化触发重绘
    this.cache = { hp: -1, shard: -1, freq: '', time: '', act: '', progression: '', passive: '' };

    // 道具技能栏：屏幕底部中央三个槽，硬边黄铜框，按 1/2/3 释放，格子内画冷却遮罩。
    this.skillG = scene.add.graphics().setDepth(1003).setScrollFactor(0);
    this.skillKeyTexts = [];
    this.skillNameTexts = [];
    this.skillCdTexts = [];
    for (let i = 0; i < 3; i++) {
      const x = SKILL_BAR.left + i * (SKILL_BAR.slotW + SKILL_BAR.gap);
      this.skillKeyTexts.push(addText(scene, x + 3, SKILL_BAR.top + 1, String(i + 1), 8, HEX.brassLight).setDepth(1004).setScrollFactor(0));
      this.skillNameTexts.push(addText(scene, x + SKILL_BAR.slotW / 2, SKILL_BAR.top + 12, '', 7, HEX.parchment).setOrigin(0.5, 0).setDepth(1004).setScrollFactor(0));
      this.skillCdTexts.push(addText(scene, x + SKILL_BAR.slotW / 2, SKILL_BAR.top + 20, '', 7, HEX.arcaneLight).setOrigin(0.5, 0).setDepth(1004).setScrollFactor(0));
    }
    this.cache.skills = '';

    // 冲刺冷却环：独立一层，和技能栏同一深度档位，每帧按 now 重画扇形遮罩
    this.dashG = scene.add.graphics().setDepth(1003).setScrollFactor(0);
    // 角标放环左侧而不是下侧：下面是技能栏的冷却文字行，挤在一起会读错；
    // 右侧只留 6px 空档，放不下字。右键技没有键位提示，靠这枚「冲刺」说明来源。
    this.dashLabel = addText(scene, DASH_RING.left - 4, DASH_RING.top + 9, '冲刺', 7, HEX.mute)
      .setOrigin(1, 0).setDepth(1004).setScrollFactor(0);

    this.drawStatic();
  }

  drawStatic() {
    const g = this.bg;
    g.clear();
    // 顶栏底板：不透明的深紫，下面一条黄铜细线
    pxRect(g, 0, 0, 480, 42, C.ink, 1);
    pxRect(g, 0, 42, 480, 1, C.brassDark, 1);
    pxRect(g, 0, 27, 480, 1, C.ink, 1);
    // 顶栏不画边角铆钉：这圈位置现在是画框的框身与角花（8px，depth 6000），
    // 顶栏的任何像素都会被盖住，画了等于没画。
    // 血条槽与刻度
    pxRect(g, 14, 16, 74, 6, C.nightDeep, 1);
    pxFrame(g, 14, 16, 74, 6, C.stoneDark, 1, 1);
    for (let i = 1; i < 10; i++) {
      pxRect(g, 14 + i * 7, 16, 1, 6, C.groove, 0.25);
    }
    // 频率小格的底槽
    pxRect(g, 180, 23, 22, 4, C.nightDeep, 0.9);
    pxFrame(g, 180, 23, 22, 4, C.stoneDark, 1, 0.8);
  }

  update(data) {
    const { hp, maxHp, shield = 0, shards, rate, buckets, elapsedMs, chapter = 1, stage = 1, lv = 1, exp = 0, expNeed = 10, passives = null, skills = [], now = 0, dashReadyAt = 0 } = data;
    this.drawSkills(skills, now);
    this.drawDashCd(dashReadyAt, now);
    const g = this.dyn;
    g.clear();

    // 生命图标与血条
    pxHeart(g, 8, 15, hp / maxHp <= 0.3 && Math.floor(this.scene.time.now / 220) % 2 === 0 ? C.white : C.blood, 1);
    const ratio = Math.max(0, Math.min(1, hp / maxHp));
    if (ratio > 0) {
      pxRect(g, 15, 17, Math.max(1, Math.round(72 * ratio)), 4, C.blood, 1);
      pxRect(g, 15, 17, Math.max(1, Math.round(72 * ratio)), 1, 0xd45a4a, 0.9);
    }
    for (let i = 1; i < 10; i++) {
      pxRect(g, 14 + i * 7, 16, 1, 6, C.nightDeep, 0.45);
    }
    // 低血警告不再画左右短红边：内开口从 x=8 起就被心形与 LV 文字占满，
    // 任何贴边红条都会压住它们。低血的同频信号交给心形闪白 + 画框的 1.1Hz 血色脉动。

    const expRatio = Math.max(0, Math.min(1, exp / Math.max(1, expNeed)));
    pxRect(g, 52, 33, 108, 5, C.nightDeep, 1);
    pxFrame(g, 52, 33, 108, 5, C.brassDark, 1, 1);
    if (expRatio > 0) pxRect(g, 53, 34, Math.round(106 * expRatio), 3, C.teal, 1);
    const progressionStr = lv + ':' + exp + ':' + expNeed;
    if (this.cache.progression !== progressionStr) {
      this.cache.progression = progressionStr;
      this.lvText.setText('LV ' + lv);
      this.expText.setText('EXP ' + exp + '/' + expNeed);
    }

    // 碎片
    pxShard(g, 137, 15, C.teal, 1);

    // 最近 5 秒频率：五根小柱，每根代表 1 秒内的触发次数
    for (let i = 0; i < 5; i++) {
      const n = Math.max(0, Math.min(9, buckets?.[i] ?? 0));
      const h = n === 0 ? 1 : Math.min(4, 1 + Math.ceil(n / 2));
      pxRect(g, 181 + i * 4, 26 - h, 3, h, C.arcane, n === 0 ? 0.25 : 0.9);
    }

    // 文本：只在变化时重绘，降低每帧文字纹理开销
    const hpStr = Math.round(hp) + (shield ? ('+' + Math.round(shield)) : '');
    if (this.cache.hp !== hpStr) {
      this.cache.hp = hpStr;
      this.hpText.setText(hpStr);
    }
    if (this.cache.shard !== shards) {
      this.cache.shard = shards;
      this.shardText.setText('碎片 ' + shards);
    }
    const freqStr = rate.toFixed(1) + '/s';
    if (this.cache.freq !== freqStr) {
      this.cache.freq = freqStr;
      this.freqText.setText('脉频 ' + freqStr);
    }
    const timeStr = fmtTime(elapsedMs);
    if (this.cache.time !== timeStr) {
      this.cache.time = timeStr;
      this.timeText.setText(timeStr);
    }
    // 局内被动：只在拿到新被动（计数变化）时重设文本
    const passiveStr = passiveHudText(passives);
    if (this.cache.passive !== passiveStr) {
      this.cache.passive = passiveStr;
      this.passiveText.setText(passiveStr);
    }
    // 缓存键必须含「幕:场」：第 4 幕内场 4→5 换场时场名会变，只比文案会漏刷新
    const actKey = chapter + ':' + stage;
    if (this.cache.act !== actKey) {
      this.cache.act = actKey;
      this.actText.setText(actLabel(chapter, stage));
    }
  }

  // 道具技能栏：每帧重画（冷却遮罩随时间变化），文字只在内容变化时更新。
  drawSkills(skills, now) {
    const g = this.skillG;
    g.clear();
    for (let i = 0; i < 3; i++) {
      const s = skills[i];
      const x = SKILL_BAR.left + i * (SKILL_BAR.slotW + SKILL_BAR.gap);
      const y = SKILL_BAR.top;
      const ready = s && now >= (s.cooldownUntil ?? 0);
      const remain = s ? Math.max(0, (s.cooldownUntil ?? 0) - now) : 0;

      // 槽底 + 硬边外框；空格用更暗的描边表示「本场还没捡到道具」
      pxRect(g, x, y, SKILL_BAR.slotW, SKILL_BAR.slotH, s ? C.ink : C.nightDeep, 0.96);
      pxFrame(g, x, y, SKILL_BAR.slotW, SKILL_BAR.slotH, s ? (ready ? C.brass : C.stoneLight) : C.stoneDark, 1, 1);
      pxRect(g, x + 1, y + 1, SKILL_BAR.slotW - 2, 1, s ? (ready ? C.arcane : C.groove) : C.stoneDark, 0.8);
      // 键位角标底
      pxRect(g, x + 2, y + 2, 8, 9, C.brassDark, 0.9);

      if (s) {
        // 冷却：从顶向下压一条暗色遮罩，剩多久压多高；就绪时无遮罩并点亮边缘
        if (!ready && s.cdMs > 0) {
          const ratio = Math.min(1, remain / s.cdMs);
          const fillH = Math.round((SKILL_BAR.slotH - 2) * ratio);
          pxRect(g, x + 1, y + 1, SKILL_BAR.slotW - 2, fillH, C.void, 0.72);
        } else {
          pxRect(g, x + 1, y + 1, SKILL_BAR.slotW - 2, SKILL_BAR.slotH - 2, C.arcane, 0.06);
        }
      }

      const keyStr = String(i + 1);
      const nameStr = s ? (s.name.length > 4 ? s.name.slice(0, 3) + '…' : s.name) : '—';
      const cdStr = !s ? '' : (ready ? '就绪' : (remain / 1000).toFixed(1) + 's');
      const cacheKey = keyStr + '|' + nameStr + '|' + cdStr + '|' + (ready ? 'r' : 'c');
      if (!this.skillSlotCache) this.skillSlotCache = ['', '', ''];
      if (this.skillSlotCache[i] !== cacheKey) {
        this.skillSlotCache[i] = cacheKey;
        this.skillKeyTexts[i].setText(keyStr);
        this.skillNameTexts[i].setText(nameStr);
        this.skillCdTexts[i].setText(cdStr);
        if (typeof this.skillCdTexts[i].setColor === 'function') {
          this.skillCdTexts[i].setColor(ready ? HEX.teal : HEX.mute);
        }
      }
    }
  }

  // 冲刺冷却环（右键闪避）：24×24 硬边圆环，槽底 + 黄铜/石框。
  // 冷却中从正上方起顺时针压扇形暗遮罩（剩多久压多少，与技能栏同一套视觉语言）；
  // 就绪时画一枚朝右的箭头。整体保持硬边像素：不用平滑饼图，按 12 段 30° 切片近似。
  drawDashCd(dashReadyAt, now) {
    const g = this.dashG;
    if (!g) return;
    g.clear();
    const cx = DASH_RING.left + DASH_RING.size / 2;
    const cy = DASH_RING.top + DASH_RING.size / 2;
    const r = DASH_RING.size / 2 - 2;
    // 冷却总长与 startDash 的放行口径一致：位移+后摇 与 固定冷却 取更晚者
    const cdTotal = Math.max(PLAYER.dash.ms + PLAYER.dash.afterMs, PLAYER.dash.cooldownMs);
    const remain = Math.max(0, (Number.isFinite(dashReadyAt) ? dashReadyAt : 0) - (now ?? 0));
    const ready = remain <= 0;
    pxRect(g, DASH_RING.left + 1, DASH_RING.top + 1, DASH_RING.size - 2, DASH_RING.size - 2, C.nightDeep, 0.9);
    pxFrame(g, DASH_RING.left, DASH_RING.top, DASH_RING.size, DASH_RING.size, ready ? C.brass : C.stoneDark, 1, 1);
    if (ready) {
      // 朝右箭头：读作「现在能闪」。
      // 点必须是 {x, y} 对象：Phaser 的 fillPoints 读 point.x / point.y，
      // 传数组会被静默丢掉（不报错、也不画），环里就只剩一个空框。
      pxPoly(g, [{ x: cx - 3, y: cy - 4 }, { x: cx + 4, y: cy }, { x: cx - 3, y: cy + 4 }], C.teal, 0.95);
      if (this.dashLabel?.setColor) this.dashLabel.setColor(HEX.mute);
      return;
    }
    const ratio = Math.min(1, remain / cdTotal);
    const segs = Math.max(1, Math.ceil(ratio * 12));
    for (let i = 0; i < segs; i++) {
      const from = -Math.PI / 2 + (i / 12) * Math.PI * 2;
      const to = -Math.PI / 2 + Math.min(ratio, (i + 1) / 12) * Math.PI * 2;
      const pts = [{ x: Math.round(cx), y: Math.round(cy) }];
      for (let s = 0; s <= 2; s++) {
        const a = from + ((to - from) * s) / 2;
        pts.push({ x: Math.round(cx + Math.cos(a) * r), y: Math.round(cy + Math.sin(a) * r) });
      }
      pxPoly(g, pts, C.void, 0.72);
    }
    // 冷却中把角标压暗一档：与技能栏冷却数字同一套语义（就绪亮 teal、冷却回 mute）
    if (this.dashLabel?.setColor) this.dashLabel.setColor(ready ? HEX.teal : HEX.groove);
  }
}
