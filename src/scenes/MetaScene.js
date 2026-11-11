// 残响祭坛：两页（被动升级 / 契约图鉴）。局外成长的唯一界面入口。
import Phaser from 'phaser';
import { HEX, addText, applyPixelZoom } from '../ui/Palette.js';
import { loadMeta, saveMeta, upgradePassive, metaLevel } from '../logic/meta.js';
import { passiveRows, metaHeader, metaPassiveRow, metaCodexGrid, metaFooter } from '../ui/meta-ui.js';

const COL_X = [26, 254];
const ROW_Y0 = 54;
const ROW_H = 30;
const COL_SPLIT = 5; // 前 5 条是人物被动，其余是罗盘被动

export default class MetaScene extends Phaser.Scene {
  constructor() {
    super('MetaScene');
  }

  create() {
    applyPixelZoom(this);
    this.save = loadMeta();
    this.applyDebugResonance();
    this.page = 0;
    this.selected = 0;
    this.lastMessage = '';
    this.layer = this.add.container(0, 0);
    // 把绘制层伪装成 scene：meta-ui 里 addText/add.graphics 都落进 container，重绘时整层销毁
    // 注意：Container.add 返回的是容器本身，必须先把对象取出再返回，绘制 helper 才算拿到 Graphics/Text
    this.face = {
      add: {
        text: (...args) => { const t = this.add.text(...args); this.layer.add(t); return t; },
        graphics: () => { const g = this.add.graphics(); this.layer.add(g); return g; },
      },
    };
    this.bindKeys();
    this.redraw();
  }

  // 验收钩子：?resonance=999 直接把存档残响灌满（写档，便于连续验收）
  applyDebugResonance() {
    if (typeof window === 'undefined') return;
    const raw = new URLSearchParams(window.location.search).get('resonance');
    if (raw == null || !/^\d+$/.test(raw)) return;
    this.save.resonance = Math.min(999999, Number(raw));
    this.save = saveMeta(this.save);
  }

  bindKeys() {
    const kb = this.input.keyboard;
    kb.addCapture(['TAB', 'UP', 'DOWN', 'LEFT', 'RIGHT', 'SPACE']);
    this.keyHandlers = [
      ['keydown-TAB', () => this.flipPage()],
      ['keydown-ESC', () => this.exit()],
      ['keydown-ENTER', () => this.activate()],
      ['keydown-SPACE', () => this.activate()],
      ['keydown-UP', () => this.move(-1)],
      ['keydown-W', () => this.move(-1)],
      ['keydown-DOWN', () => this.move(1)],
      ['keydown-S', () => this.move(1)],
      ['keydown-LEFT', () => this.jumpColumn(0)],
      ['keydown-RIGHT', () => this.jumpColumn(1)],
      ['keydown-A', () => this.jumpColumn(0)],
      ['keydown-D', () => this.jumpColumn(1)],
    ];
    for (const [event, fn] of this.keyHandlers) kb.on(event, fn);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      for (const [event, fn] of this.keyHandlers) kb.off(event, fn);
    });
  }

  rows() {
    return passiveRows(this.save);
  }

  // ↑↓ 在当前列内移动；走到列首/列尾会翻到相邻列，单用方向键也能走完 11 条
  move(delta) {
    if (this.page !== 0) return;
    if (!this.acceptNav()) return;
    const inFirst = this.selected < COL_SPLIT;
    const base = inFirst ? 0 : COL_SPLIT;
    const count = inFirst ? COL_SPLIT : COL_SPLIT + 1;
    const local = this.selected - base;
    const next = local + delta;
    if (next >= count) this.selected = inFirst ? COL_SPLIT : 0;
    else if (next < 0) this.selected = inFirst ? COL_SPLIT + COL_SPLIT : COL_SPLIT - 1;
    else this.selected = base + next;
    this.redraw();
  }

  jumpColumn(col) {
    if (this.page !== 0) return;
    if (!this.acceptNav()) return;
    const local = this.selected < COL_SPLIT ? this.selected : this.selected - COL_SPLIT;
    const base = col === 0 ? 0 : COL_SPLIT;
    const count = col === 0 ? COL_SPLIT : COL_SPLIT + 1;
    this.selected = base + Math.min(local, count - 1);
    this.redraw();
  }

  // 键盘事件在高频连按时会成对到达（DOM keydown 队列），菜单导航按 70ms 去抖，避免一次按键跳两格
  acceptNav() {
    const now = Date.now();
    if (this.lastNavAt && now - this.lastNavAt < 70) return false;
    this.lastNavAt = now;
    return true;
  }

  flipPage() {
    this.page = this.page === 0 ? 1 : 0;
    this.lastMessage = '';
    this.redraw();
  }

  activate() {
    if (this.page !== 0) return;
    const row = this.rows()[this.selected];
    if (!row) return;
    const result = upgradePassive(this.save, row.id);
    if (result.ok) {
      this.save = result.save;
      saveMeta(this.save);
      this.lastMessage = row.name + ' 升至 Lv.' + metaLevel(this.save, row.id);
    } else {
      this.lastMessage = this.reasonText(result.reason);
    }
    this.redraw();
  }

  reasonText(reason) {
    if (reason === 'cost') return '残响不足';
    if (reason === 'maxcap') return '需先首杀对应契约主';
    if (reason === 'maxlevel') return '已达满级';
    return '无法升级';
  }

  exit() {
    this.scene.start('TitleScene', { __cine: true });
  }

  redraw() {
    this.layer.removeAll(true);
    const face = this.face;
    metaHeader(face, { save: this.save, page: this.page });
    if (this.page === 1) {
      metaCodexGrid(face, { save: this.save });
    } else {
      const rows = this.rows();
      rows.forEach((row, i) => {
        const col = i < COL_SPLIT ? 0 : 1;
        const line = i < COL_SPLIT ? i : i - COL_SPLIT;
        metaPassiveRow(face, COL_X[col], ROW_Y0 + line * ROW_H, row, i, i === this.selected);
      });
      addText(face, 240, 232, this.lastMessage || '', 8, HEX.arcaneLight).setOrigin(0.5, 0);
    }
    metaFooter(face, { page: this.page });
    this.publish();
  }

  publish() {
    if (typeof window === 'undefined') return;
    const rows = this.rows();
    window.__SIGILWEAVE_META__ = {
      save: this.save,
      page: this.page,
      selected: rows[this.selected]?.id ?? null,
      selectedIndex: this.selected,
      lastMessage: this.lastMessage,
    };
  }
}
