// 顶栏：生命 / 符文碎片 / 最近 5 秒实测触发频率 / 幕数与时间
// 黄铜刻度尺式血条，整体保持「羊皮纸面板 + 黄铜边」的 UI 语言。
import { C, HEX, addText, pxRect, pxFrame, pxHeart, pxShard, fmtTime } from './Palette.js';
import { STAGE_CARDS } from '../data/cinematics.js';

// 幕是 1..5 的叙事单位，场是 1..7 的玩法单位。
// 前三幕各一场，顶栏用星名（第3幕 · 天玑）；合并幕用当前场的地名（第4幕 · 沉钟书库 → 衡律法庭）。
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
    this.lvText = addText(scene, 8, 29, 'LV 1', 9, HEX.brassLight).setDepth(1002);
    this.expText = addText(scene, 170, 29, 'EXP 0/10', 9, HEX.teal).setDepth(1002);
    for (const text of [this.hpText, this.shardText, this.freqText, this.actText, this.timeText, this.lvText, this.expText]) text.setScrollFactor(0);
    // act 存的是「幕:场」缓存键，不是文案；换场要能靠 key 变化触发重绘
    this.cache = { hp: -1, shard: -1, freq: '', time: '', act: '', progression: '' };

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
    const { hp, maxHp, shield = 0, shards, rate, buckets, elapsedMs, chapter = 1, stage = 1, lv = 1, exp = 0, expNeed = 10 } = data;
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
    // 缓存键必须含「幕:场」：第 4 幕内场 4→5 换场时场名会变，只比文案会漏刷新
    const actKey = chapter + ':' + stage;
    if (this.cache.act !== actKey) {
      this.cache.act = actKey;
      this.actText.setText(actLabel(chapter, stage));
    }
  }
}
