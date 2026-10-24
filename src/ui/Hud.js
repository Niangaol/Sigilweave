// 顶栏：生命 / 符文碎片 / 最近 5 秒实测触发频率 / 幕数与时间
// 黄铜刻度尺式血条，整体保持「羊皮纸面板 + 黄铜边」的 UI 语言。
import { C, HEX, addText, pxRect, pxFrame, pxHeart, pxShard, fmtTime } from './Palette.js';

export default class Hud {
  constructor(scene) {
    this.scene = scene;
    this.bg = scene.add.graphics().setDepth(1000).setScrollFactor(0);
    this.dyn = scene.add.graphics().setDepth(1001).setScrollFactor(0);

    this.hpText = addText(scene, 92, 4, '100', 9, HEX.parchment).setDepth(1002);
    this.shardText = addText(scene, 128, 4, '碎片 0', 9, HEX.parchment).setDepth(1002);
    this.freqText = addText(scene, 180, 3, '脉频5s 0.0/s', 9, HEX.arcaneLight).setDepth(1002);
    this.actText = addText(scene, 300, 4, '第一幕 · 演武', 9, HEX.brassLight).setDepth(1002);
    this.timeText = addText(scene, 474, 4, '00:00', 9, HEX.parchment).setDepth(1002).setOrigin(1, 0);
    // 成长信息单列第二行，延续黄铜刻度与青色经验。
    this.lvText = addText(scene, 8, 20, 'LV 1', 9, HEX.brassLight).setDepth(1002);
    this.expText = addText(scene, 170, 20, 'EXP 0/10', 9, HEX.teal).setDepth(1002);
    for (const text of [this.hpText, this.shardText, this.freqText, this.actText, this.timeText, this.lvText, this.expText]) text.setScrollFactor(0);
    this.cache = { hp: -1, shard: -1, freq: '', time: '', act: '', progression: '' };

    this.drawStatic();
  }

  drawStatic() {
    const g = this.bg;
    g.clear();
    // 顶栏底板：不透明的深紫，下面一条黄铜细线
    pxRect(g, 0, 0, 480, 33, C.ink, 1);
    pxRect(g, 0, 33, 480, 1, C.brassDark, 1);
    pxRect(g, 0, 18, 480, 1, C.ink, 1);
    // 边角铆钉
    for (const x of [3, 474]) {
      pxRect(g, x, 3, 2, 2, C.brass, 0.7);
      pxRect(g, x, 14, 2, 2, C.brass, 0.4);
    }
    // 血条槽与刻度
    pxRect(g, 14, 7, 74, 6, C.nightDeep, 1);
    pxFrame(g, 14, 7, 74, 6, C.stoneDark, 1, 1);
    for (let i = 1; i < 10; i++) {
      pxRect(g, 14 + i * 7, 7, 1, 6, C.groove, 0.25);
    }
    // 频率小格的底槽
    pxRect(g, 180, 14, 22, 4, C.nightDeep, 0.9);
    pxFrame(g, 180, 14, 22, 4, C.stoneDark, 1, 0.8);
  }

  update(data) {
    const { hp, maxHp, shield = 0, shards, rate, buckets, elapsedMs, act, lv = 1, exp = 0, expNeed = 10 } = data;
    const g = this.dyn;
    g.clear();

    // 生命图标与血条
    pxHeart(g, 6, 6, hp / maxHp <= 0.3 && Math.floor(this.scene.time.now / 220) % 2 === 0 ? C.white : C.blood, 1);
    const ratio = Math.max(0, Math.min(1, hp / maxHp));
    if (ratio > 0) {
      pxRect(g, 15, 8, Math.max(1, Math.round(72 * ratio)), 4, C.blood, 1);
      pxRect(g, 15, 8, Math.max(1, Math.round(72 * ratio)), 1, 0xd45a4a, 0.9);
    }
    for (let i = 1; i < 10; i++) {
      pxRect(g, 14 + i * 7, 7, 1, 6, C.nightDeep, 0.45);
    }
    // 低血警告：左右各闪一条短红边
    if (ratio <= 0.3 && Math.floor(this.scene.time.now / 260) % 2 === 0) {
      pxRect(g, 0, 0, 3, 19, C.blood, 0.7);
      pxRect(g, 477, 0, 3, 19, C.blood, 0.7);
    }

    const expRatio = Math.max(0, Math.min(1, exp / Math.max(1, expNeed)));
    pxRect(g, 52, 24, 108, 5, C.nightDeep, 1);
    pxFrame(g, 52, 24, 108, 5, C.brassDark, 1, 1);
    if (expRatio > 0) pxRect(g, 53, 25, Math.round(106 * expRatio), 3, C.teal, 1);
    const progressionStr = lv + ':' + exp + ':' + expNeed;
    if (this.cache.progression !== progressionStr) {
      this.cache.progression = progressionStr;
      this.lvText.setText('LV ' + lv);
      this.expText.setText('EXP ' + exp + '/' + expNeed);
    }

    // 碎片
    pxShard(g, 119, 6, C.teal, 1);

    // 最近 5 秒频率：五根小柱，每根代表 1 秒内的触发次数
    for (let i = 0; i < 5; i++) {
      const n = Math.max(0, Math.min(9, buckets?.[i] ?? 0));
      const h = n === 0 ? 1 : Math.min(4, 1 + Math.ceil(n / 2));
      pxRect(g, 181 + i * 4, 17 - h, 3, h, C.arcane, n === 0 ? 0.25 : 0.9);
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
      this.freqText.setText('脉频5s ' + freqStr);
    }
    const timeStr = fmtTime(elapsedMs);
    if (this.cache.time !== timeStr) {
      this.cache.time = timeStr;
      this.timeText.setText(timeStr);
    }
    const actStr = '第' + (act === 1 ? '一' : act === 2 ? '二' : '三') + '幕 · 演武';
    if (this.cache.act !== actStr) {
      this.cache.act = actStr;
      this.actText.setText(actStr);
    }
  }
}
