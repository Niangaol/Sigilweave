// 标题页 = 正经游戏主菜单：祭坛背景 + 中央竖排六项（开始 / 祭坛 / 说明 / 设置 / 档案 / 名单）。
// 键盘 ↑↓ + Enter、鼠标悬停 + 点击都能操作；Esc 关子面板。
import Phaser from 'phaser';
import { C, HEX, addText, pxRect, pxFrame, pxLine, pxDiamond, applyPixelZoom, FONT_DISPLAY, getRenderScale } from '../ui/Palette.js';
import { playCutscene } from '../ui/transition.js';
import { describeSave, loadRun } from '../logic/save.js';
import { chapterOf } from '../logic/acts.js';
import { loadMeta, resetMeta } from '../logic/meta.js';
import { loadSettings, applySettings, SETTING_ROWS } from '../logic/settings.js';
import { setSoundEnabled } from '../audio/Sfx.js';
import {
  TITLE_MENU, MENU_GEOM, menuRowY, moveIndex, hitMenuRow, menuLayout,
  statusLine, recordLines, HELP_PAGES, HELP_PAGE_GEOM, pageLabel, movePage,
  CREDITS_LINES, PANEL_TITLES,
} from '../ui/title-menu.js';

// ?scene=xxx 调试跳转只在本次页面加载后生效一次：从祭坛 ESC 回标题时不该被再弹回去
let jumpConsumed = false;

// 面板统一占位：480×270 画布上留出标题与状态条，44..234 是内容区。
const PANEL = Object.freeze({ x: 20, y: 44, w: 440, h: 190 });

// 断点续玩横条：挤在状态条（232）与页脚之间，有存档时才画。
const CONTINUE_GEOM = Object.freeze({ y: 244, h: 13 });

export default class TitleScene extends Phaser.Scene {
  constructor() {
    super('TitleScene');
  }

  init(data = {}) {
    // 由过场进入时，过场负责揭开，标题页不再自己从黑场淡入
    this.__cine = !!data.__cine;
  }

  create() {
    applyPixelZoom(this);
    // 调试直达：?scene=battle / ?scene=gameover
    const params = new URLSearchParams(window.location.search);
    const jump = jumpConsumed ? null : params.get('scene');
    if (jump) jumpConsumed = true;
    if (jump === 'battle') {
      this.scene.start('BattleScene');
      return;
    }
    if (jump === 'meta') {
      this.scene.start('MetaScene');
      return;
    }
    if (jump === 'gameover') {
      this.scene.start('GameOverScene', {
        elapsedMs: 143000, act: 1, hp: 0, kills: 27, shards: 19,
        triggers: 61, combos: 3, blocked: 4, reroutes: 1, dissipations: 2,
        peakRate: 0.8, cells: 6,
      });
      return;
    }

    this.started = false;
    this.lastRingStep = -1;
    this.ringStep = 0;
    this.menuIndex = 0;
    this.panel = null;
    this.panelIndex = 0;
    this.confirmingReset = false;
    this.meta = loadMeta();
    this.settings = loadSettings();
    if (!this.__cine) this.cameras.main.fadeIn(220, 0, 0, 0);

    this.drawBackdrop();
    this.embers = this.buildEmbers();
    this.emberG = this.add.graphics().setDepth(1);
    this.ringG = this.add.graphics().setDepth(2);

    // 标题：像素衬线体 + 硬阴影
    addText(this, 240, 30, '共振法阵', 34, HEX.parchment, {
      fontFamily: FONT_DISPLAY,
      stroke: '#0d0a17',
      strokeThickness: 3,
      letterSpacing: 5,
      shadow: { offsetX: 2, offsetY: 2, color: '#0d0a17', blur: 0, fill: true },
    }).setOrigin(0.5, 0).setDepth(10);
    addText(this, 240, 74, 'R E S O N A N C E   S I G I L', 8, HEX.brass, {
      letterSpacing: 2,
    }).setOrigin(0.5, 0).setDepth(10);

    // 标题下的黄铜横线
    const rule = this.add.graphics().setDepth(9);
    pxRect(rule, 74, 94, 332, 1, C.brassDark, 0.9);
    pxRect(rule, 74, 95, 332, 1, C.ink, 0.6);
    pxDiamond(rule, 240, 94, 3, C.brass, 0.9, true);
    pxDiamond(rule, 74, 94, 2, C.brass, 0.7, true);
    pxDiamond(rule, 406, 94, 2, C.brass, 0.7, true);

    this.buildMenu();
    this.status = addText(this, this.menu.cx, 232, statusLine(this.meta), 8, HEX.brassLight)
      .setOrigin(0.5, 0).setDepth(10);
    // 有断点存档时，状态条下面多一条「继续冒险」横条，页脚顺势下移 10px 让位。
    const hasSave = this.buildContinue();
    this.footer = addText(this, this.menu.cx, hasSave ? 258 : 248, '↑↓ 选择　Enter 确认　·　鼠标可点', 7, HEX.mute)
      .setOrigin(0.5, 0).setDepth(10);

    // 子面板：一层图形 + 一组文字，打开时重建
    this.panelG = this.add.graphics().setDepth(40).setVisible(false);
    this.panelTexts = [];
    this.panelRows = [];
    this.helpPage = 0;

    this.bindInput();
    this.drawRing(0);
    this.refreshMenu();
    this.publishDebug();
  }

  // ---------- 断点续玩 ----------

  // 检测到本局存档时，在状态条与页脚之间加一条青绿横条：按 C 或直接点它，回到上次那一场。
  buildContinue() {
    this.saveInfo = describeSave();
    if (!this.saveInfo) return false;
    const { x, w, cx } = this.menu;
    const y = CONTINUE_GEOM.y;
    const h = CONTINUE_GEOM.h;
    this.continueG = this.add.graphics().setDepth(8);
    pxRect(this.continueG, x, y, w, h, C.ink, 0.92);
    pxFrame(this.continueG, x, y, w, h, C.teal, 1, 0.9);
    pxRect(this.continueG, x + 1, y + 1, w - 2, 1, C.teal, 0.25);
    this.continueText = addText(this, cx, y + 3, this.continueLabel(), 8, HEX.teal)
      .setOrigin(0.5, 0).setDepth(10);
    return true;
  }

  continueLabel() {
    // 幕号以 stage 为准重算：老档里 run.chapter 可能落后于 stage。
    const chapter = chapterOf(this.saveInfo.stage);
    return '按 C 继续冒险 · 第 ' + chapter + ' 幕 · 第 ' + this.saveInfo.stage + ' 场';
  }

  continueGame() {
    if (this.started || this.panel) return;
    const run = loadRun();
    if (!run) return;
    this.started = true;
    // 读档直达战斗场：跳过选套（套装已固化在 run.draft 里）。
    playCutscene(this, {
      kind: 'act', act: chapterOf(run.stage), to: 'BattleScene',
      payload: { run, __cine: true, __resume: true },
    });
  }

  // ---------- 菜单 ----------

  buildMenu() {
    // 有主角立绘时菜单右移，避免按钮压到人物身上（立绘占 x≈10..142）
    this.menu = menuLayout(this.textures.exists('hero_title'));
    this.rowG = this.add.graphics().setDepth(8);
    this.caret = this.add.graphics().setDepth(11);
    this.labels = [];
    this.hints = [];
    TITLE_MENU.forEach((item, i) => {
      const y = menuRowY(i);
      this.labels.push(addText(this, this.menu.cx, y + MENU_GEOM.h / 2, item.label, 10, HEX.parchment)
        .setOrigin(0.5, 0.5).setDepth(10));
      this.hints.push(addText(this, this.menu.x + this.menu.w - 8, y + MENU_GEOM.h / 2, item.hint, 6, HEX.brassDark)
        .setOrigin(1, 0.5).setDepth(10));
    });
  }

  refreshMenu() {
    const g = this.rowG;
    g.clear();
    if (!this.panel) {
      // 一整块压暗的菜单底板：六行零散方框看着像调试面板，铺一层底才像正经菜单
      pxRect(g, this.menu.x - 18, MENU_GEOM.top - 6, this.menu.w + 36, TITLE_MENU.length * MENU_GEOM.step + 4, C.void, 0.45);
      pxFrame(g, this.menu.x - 18, MENU_GEOM.top - 6, this.menu.w + 36, TITLE_MENU.length * MENU_GEOM.step + 4, C.brassDark, 1, 0.5);
    } else if (this.caret) {
      this.caret.clear();
    }
    TITLE_MENU.forEach((item, i) => {
      const y = menuRowY(i);
      const selected = i === this.menuIndex && !this.panel;
      pxRect(g, this.menu.x, y, this.menu.w, MENU_GEOM.h, selected ? C.stone : C.nightDeep, selected ? 0.94 : 0.88);
      pxFrame(g, this.menu.x, y, this.menu.w, MENU_GEOM.h, selected ? C.brass : C.stoneDark, 1, selected ? 1 : 0.8);
      if (selected) {
        pxRect(g, this.menu.x + 1, y + 1, this.menu.w - 2, 1, C.brassLight, 0.35);
        pxDiamond(g, this.menu.x - 8, y + MENU_GEOM.h / 2, 3, C.brass, 0.95, true);
      }
      this.labels[i].setColor(selected ? HEX.white : HEX.parchment)
        .setAlpha(selected ? 1 : 0.72);
      this.hints[i].setColor(selected ? HEX.brassLight : HEX.brassDark)
        .setVisible(!this.panel);
    });
    if (this.status) this.status.setVisible(!this.panel);
    // 面板自带页脚提示，标题页这条就收起来，免得两行字隔着半透明底打架
    if (this.footer) this.footer.setVisible(!this.panel);
    if (this.continueG) this.continueG.setVisible(!this.panel);
    if (this.continueText) this.continueText.setVisible(!this.panel);
  }

  moveSelection(delta) {
    if (this.panel) return;
    this.menuIndex = moveIndex(this.menuIndex, delta, TITLE_MENU.length);
    this.refreshMenu();
  }

  activate(index = this.menuIndex) {
    const item = TITLE_MENU[index];
    if (!item || this.started) return;
    switch (item.id) {
      case 'start':
        this.begin();
        break;
      case 'meta':
        this.openMeta();
        break;
      case 'help':
      case 'settings':
      case 'record':
      case 'credits':
        this.openPanel(item.id);
        break;
      default:
        break;
    }
  }

  // ---------- 子面板 ----------

  openPanel(kind) {
    this.panel = kind;
    this.panelIndex = 0;
    this.helpPage = 0;
    this.confirmingReset = false;
    this.panelG.setVisible(true);
    this.refreshMenu();
    this.drawPanel();
    this.publishDebug();
  }

  closePanel() {
    this.panel = null;
    this.confirmingReset = false;
    this.panelG.setVisible(false).clear();
    for (const t of this.panelTexts) t.destroy();
    this.panelTexts = [];
    this.panelRows = [];
    this.refreshMenu();
    this.publishDebug();
  }

  panelText(x, y, str, size = 9, color = HEX.parchment, extra = {}) {
    const t = addText(this, x, y, str, size, color, extra).setDepth(41);
    this.panelTexts.push(t);
    return t;
  }

  drawPanel() {
    const g = this.panelG;
    g.clear();
    for (const t of this.panelTexts) t.destroy();
    this.panelTexts = [];
    this.panelRows = [];
    if (!this.panel) return;

    // 全屏压暗 + 石质面板 + 双层黄铜边
    pxRect(g, 0, 0, 480, 270, C.void, 0.55);
    pxRect(g, PANEL.x, PANEL.y, PANEL.w, PANEL.h, C.ink, 0.98);
    pxFrame(g, PANEL.x - 1, PANEL.y - 1, PANEL.w + 2, PANEL.h + 2, C.outline, 1, 1);
    pxFrame(g, PANEL.x, PANEL.y, PANEL.w, PANEL.h, C.brassDark, 2, 1);
    pxFrame(g, PANEL.x + 4, PANEL.y + 4, PANEL.w - 8, PANEL.h - 8, C.brass, 0.45, 1);
    pxRect(g, PANEL.x + 8, PANEL.y + 22, PANEL.w - 16, 1, C.brassDark, 0.8);
    this.panelText(PANEL.x + 12, PANEL.y + 8, PANEL_TITLES[this.panel] ?? '', 11, HEX.brassLight);
    pxDiamond(g, PANEL.x + PANEL.w - 14, PANEL.y + 14, 3, C.brass, 0.8, false);

    if (this.panel === 'help') this.drawHelpPanel(g);
    if (this.panel === 'settings') this.drawSettingsPanel(g);
    if (this.panel === 'record') this.drawRecordPanel(g);
    if (this.panel === 'credits') this.drawCreditsPanel();

    // 说明面板自带满页文案，页脚提示会压到最后一行，故跳过。
    if (this.panel !== 'help') {
      this.panelText(240, PANEL.y + PANEL.h - 16, this.panelHint(), 7, HEX.mute)
        .setOrigin(0.5, 0);
    }
  }

  panelHint() {
    if (this.panel === 'settings') return '↑↓ 选择　Enter 切换　Esc 返回';
    if (this.panel === 'record') return '↑↓ 选择　Enter 确认　Esc 返回';
    return 'Esc 返回菜单';
  }

  drawHelpPanel(g) {
    const page = HELP_PAGES[this.helpPage] ?? HELP_PAGES[0];
    const X = PANEL.x + 12;
    this.panelText(X, PANEL.y + HELP_PAGE_GEOM.titleY, page.title, 9, HEX.teal);
    page.lines.forEach((line, i) => {
      this.panelText(X, PANEL.y + HELP_PAGE_GEOM.top + i * HELP_PAGE_GEOM.step, line, 8, HEX.parchment, {
        wordWrap: { width: PANEL.w - 24 }, lineSpacing: 3,
      });
    });

    // 页脚：左右箭头 + 页码 + 键位提示，箭头同时是鼠标热区
    const fy = PANEL.y + HELP_PAGE_GEOM.footY;
    const prevX = PANEL.x + 14;
    const nextX = PANEL.x + PANEL.w - 14;
    this.panelRows.push({ id: 'help-prev', x: prevX - 4, w: 18, y: fy - 2, h: 12, kind: 'help' });
    this.panelRows.push({ id: 'help-next', x: nextX - 14, w: 18, y: fy - 2, h: 12, kind: 'help' });
    pxRect(g, prevX - 4, fy - 2, 18, 12, C.nightDeep, 0.9);
    pxFrame(g, prevX - 4, fy - 2, 18, 12, C.brassDark, 1, 0.8);
    pxRect(g, nextX - 14, fy - 2, 18, 12, C.nightDeep, 0.9);
    pxFrame(g, nextX - 14, fy - 2, 18, 12, C.brassDark, 1, 0.8);
    this.panelText(prevX, fy, '◂', 8, HEX.brassLight).setOrigin(0.5, 0);
    this.panelText(nextX, fy, '▸', 8, HEX.brassLight).setOrigin(0.5, 0);
    this.panelText(240, fy, pageLabel(this.helpPage) + '　←→ 翻页　Esc 返回', 7, HEX.mute)
      .setOrigin(0.5, 0);
  }

  // 翻页：非法目标一律夹回合法页，避免面板空白
  turnPage(delta) {
    const next = movePage(this.helpPage, delta);
    if (next === this.helpPage) return;
    this.helpPage = next;
    this.drawPanel();
  }

  drawSettingsPanel(g) {
    SETTING_ROWS.forEach((row, i) => {
      const y = PANEL.y + 36 + i * 26;
      const selected = i === this.panelIndex;
      this.panelRows.push({ id: row.key, y, h: 22, kind: 'setting' });
      if (selected) {
        pxRect(g, PANEL.x + 10, y - 3, PANEL.w - 20, 22, C.stone, 0.55);
        pxFrame(g, PANEL.x + 10, y - 3, PANEL.w - 20, 22, C.brass, 1, 1);
        pxDiamond(g, PANEL.x + 16, y + 8, 2, C.brassLight, 1, true);
      }
      const on = this.settings[row.key] !== false;
      this.panelText(PANEL.x + 26, y, row.label, 10, selected ? HEX.white : HEX.parchment);
      this.panelText(PANEL.x + PANEL.w - 18, y - 1, on ? row.on : row.off, 10,
        on ? HEX.teal : HEX.mute).setOrigin(1, 0);
      this.panelText(PANEL.x + 26, y + 12, row.hint, 7, HEX.mute);
    });
    this.panelText(PANEL.x + 12, PANEL.y + PANEL.h - 44, '设置会记住，下次打开网页仍然生效。', 7, HEX.brass);
  }

  drawRecordPanel(g) {
    const lines = recordLines(this.meta);
    lines.forEach((line, i) => {
      const y = PANEL.y + 30 + i * 15;
      this.panelText(PANEL.x + 18, y, line.label, 8, HEX.parchment);
      this.panelText(PANEL.x + PANEL.w - 18, y, line.value, 8, HEX.brassLight).setOrigin(1, 0);
    });
    // 最后一行是「清空存档」：需要连按两次 Enter，防误触
    const y = PANEL.y + 30 + lines.length * 15 + 6;
    const selected = this.panelIndex === lines.length;
    this.panelRows.push({ id: 'reset', y, h: 14, kind: 'reset' });
    if (selected) {
      pxRect(g, PANEL.x + 12, y - 2, PANEL.w - 24, 14, C.bloodDark, 0.5);
      pxFrame(g, PANEL.x + 12, y - 2, PANEL.w - 24, 14, C.blood, 1, 0.9);
    }
    this.panelText(PANEL.x + 18, y, this.confirmingReset ? '再按一次 Enter 确认清空存档' : '清空存档', 8,
      this.confirmingReset ? HEX.blood : HEX.mute);
  }

  drawCreditsPanel() {
    const top = PANEL.y + 36;
    CREDITS_LINES.forEach((line, i) => {
      // 第一行是标题、第二行是三个人名：人名给到 11px，别跟小字注脚挤在一起
      const size = i === 0 ? 14 : i === 1 ? 11 : 9;
      const color = i === 0 ? HEX.parchment : i === 1 ? HEX.white : HEX.brassLight;
      this.panelText(240, top + i * 26, line, size, color).setOrigin(0.5, 0);
    });
    this.panelText(240, PANEL.y + PANEL.h - 30, ' Resonance Sigil · 480×270 像素单页游戏', 7, HEX.mute)
      .setOrigin(0.5, 0);
  }

  // ---------- 面板交互 ----------

  movePanel(delta) {
    // 说明面板没有列表，↑↓ 直接当翻页用，省一套键
    if (this.panel === 'help') {
      this.turnPage(delta);
      return;
    }
    const count = this.panel === 'settings' ? SETTING_ROWS.length
      : this.panel === 'record' ? recordLines(this.meta).length + 1 : 0;
    if (!count) return;
    this.panelIndex = moveIndex(this.panelIndex, delta, count);
    this.drawPanel();
  }

  activatePanel() {
    if (this.panel === 'help') {
      // 鼠标点到的方向箭头：面板里只有这两个热区
      const row = this.panelRows[this.panelIndex];
      if (row?.id === 'help-prev') this.turnPage(-1);
      else if (row?.id === 'help-next') this.turnPage(1);
      return;
    }
    if (this.panel === 'settings') {
      const row = SETTING_ROWS[this.panelIndex];
      if (!row) return;
      this.settings = applySettings({ ...this.settings, [row.key]: this.settings[row.key] === false });
      if (row.key === 'sfx') setSoundEnabled(this.settings.sfx);
      this.drawPanel();
      return;
    }
    if (this.panel === 'record') {
      const lines = recordLines(this.meta);
      if (this.panelIndex !== lines.length) return;
      if (!this.confirmingReset) {
        this.confirmingReset = true;
        this.drawPanel();
        return;
      }
      this.meta = resetMeta();
      this.confirmingReset = false;
      this.panelIndex = 0;
      this.status.setText(statusLine(this.meta));
      this.drawPanel();
    }
  }

  // ---------- 入口动作 ----------

  openMeta() {
    if (this.started) return;
    this.started = true;
    this.scene.start('MetaScene');
  }

  begin() {
    if (this.started) return;
    this.started = true;
    // 标题 → 选套：符文收拢的无缝转场（不压大标题，避免和标题页重复）
    playCutscene(this, { kind: 'sigil', to: 'LoadoutScene', payload: { __cine: true } });
  }

  // ---------- 输入 ----------

  bindInput() {
    const kb = this.input.keyboard;
    const on = (event, fn) => {
      kb.on(event, fn);
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => kb.off(event, fn));
    };
    on('keydown-UP', () => (this.panel ? this.movePanel(-1) : this.moveSelection(-1)));
    on('keydown-W', () => (this.panel ? this.movePanel(-1) : this.moveSelection(-1)));
    on('keydown-DOWN', () => (this.panel ? this.movePanel(1) : this.moveSelection(1)));
    on('keydown-S', () => (this.panel ? this.movePanel(1) : this.moveSelection(1)));
    // 说明面板左右翻页；菜单里左右不做事
    on('keydown-LEFT', () => { if (this.panel === 'help') this.turnPage(-1); });
    on('keydown-A', () => { if (this.panel === 'help') this.turnPage(-1); });
    on('keydown-RIGHT', () => { if (this.panel === 'help') this.turnPage(1); });
    on('keydown-D', () => { if (this.panel === 'help') this.turnPage(1); });
    on('keydown-ENTER', () => (this.panel ? this.activatePanel() : this.activate()));
    on('keydown-SPACE', () => (this.panel ? this.activatePanel() : this.activate()));
    on('keydown-ESC', () => { if (this.panel) this.closePanel(); });
    // H 直接看说明、B 直接进祭坛：老习惯保留，但不再是唯一入口
    on('keydown-H', () => { if (!this.started) { if (this.panel === 'help') this.closePanel(); else this.openPanel('help'); } });
    on('keydown-B', () => { if (!this.panel) this.openMeta(); });
    // C：断点续玩（只在有存档时有效，且不抢面板的按键）
    on('keydown-C', () => { if (!this.panel) this.continueGame(); });

    const logical = (pointer) => ({ x: pointer.x / getRenderScale(), y: pointer.y / getRenderScale() });
    const pointerMove = (pointer) => {
      if (this.panel) return;
      const { y } = logical(pointer);
      const idx = hitMenuRow(0, y, TITLE_MENU.length);
      if (idx >= 0 && idx !== this.menuIndex) { this.menuIndex = idx; this.refreshMenu(); }
    };
    const pointerDown = (pointer) => {
      const { x, y } = logical(pointer);
      if (this.panel) {
        for (let i = 0; i < this.panelRows.length; i++) {
          const row = this.panelRows[i];
          // 带 x/w 的行是窄热区（说明面板的左右箭头），要连横向一起判；其余整行可点
          if (row.x !== undefined
            ? x >= row.x && x <= row.x + row.w && y >= row.y && y <= row.y + row.h
            : y >= row.y - 3 && y <= row.y + row.h) {
            this.panelIndex = i;
            this.activatePanel();
            return;
          }
        }
        return;
      }
      const idx = hitMenuRow(x, y, TITLE_MENU.length);
      if (idx >= 0) { this.menuIndex = idx; this.refreshMenu(); this.activate(idx); return; }
      // 续玩横条整条可点：落在它的矩形里就走续玩，不落到菜单
      if (this.saveInfo && y >= CONTINUE_GEOM.y && y <= CONTINUE_GEOM.y + CONTINUE_GEOM.h) this.continueGame();
    };
    this.input.on('pointermove', pointerMove);
    this.input.on('pointerdown', pointerDown);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.off('pointermove', pointerMove);
      this.input.off('pointerdown', pointerDown);
    });
  }

  // 验收钩子：外部（脚本 / 冒烟测试）读当前菜单与面板状态
  publishDebug() {
    if (typeof window === 'undefined') return;
    window.__SIGILWEAVE_TITLE__ = {
      index: this.menuIndex, panel: this.panel, page: this.helpPage,
      pages: HELP_PAGES.length, items: TITLE_MENU.map((m) => m.id),
      save: this.saveInfo ? { ...this.saveInfo } : null,
    };
    window.__SIGILWEAVE_TITLE_HELP__ = this.panel === 'help';
  }

  // ---------- 背景（沿用旧版祭坛场景） ----------

  buildEmbers() {
    const rng = (() => {
      let s = 0x2f61;
      return () => {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        return s / 4294967296;
      };
    })();
    const list = [];
    for (let i = 0; i < 26; i++) {
      list.push({
        x: 20 + rng() * 440,
        y: rng() * 270,
        speed: 3 + rng() * 7,
        size: rng() > 0.82 ? 2 : 1,
        phase: rng() * Math.PI * 2,
      });
    }
    return list;
  }

  drawBackdrop() {
    if (this.textures.exists('title_wall')) {
      this.drawArtBackdrop();
      return;
    }
    const g = this.add.graphics().setDepth(0);
    pxRect(g, 0, 0, 480, 270, C.nightDeep, 1);
    // 三层硬边地面色带
    pxRect(g, 0, 196, 480, 34, C.nightSoft, 1);
    pxRect(g, 0, 230, 480, 40, C.night, 1);
    pxRect(g, 0, 196, 480, 1, C.stoneDark, 1);
    pxRect(g, 0, 230, 480, 1, C.stoneDark, 0.8);

    // 远景三座尖拱
    this.drawArch(g, 240, 170, 96, 196, C.nightSoft, C.stoneDark);
    this.drawArch(g, 86, 96, 120, 196, C.nightDeep, C.stoneDark);
    this.drawArch(g, 394, 96, 120, 196, C.nightDeep, C.stoneDark);

    // 月亮：阶梯状像素圆盘
    const mx = 402, my = 42;
    for (let r = 16; r >= 1; r -= 4) {
      pxRect(g, mx - r, my - Math.round(r * 0.72), r * 2, Math.round(r * 1.44), C.parchment, r > 8 ? 0.1 : 0.16);
    }
    pxRect(g, mx - 12, my - 8, 24, 16, C.parchment, 0.07);

    // 两侧石柱
    for (const x of [0, 456]) {
      pxRect(g, x, 96, 24, 140, C.stoneDark, 1);
      pxRect(g, x + 3, 96, 1, 140, C.groove, 0.25);
      pxRect(g, x + 9, 96, 1, 140, C.nightDeep, 0.9);
      pxRect(g, x + 18, 96, 6, 140, C.nightDeep, 0.8);
      pxRect(g, x - 2, 90, 28, 6, C.stone, 1);
      pxRect(g, x - 2, 230, 28, 6, C.stone, 1);
    }

    // 地面刻线：向中心汇聚的符阵暗示
    pxLine(g, 40, 268, 206, 214, C.groove, 0.18, 1);
    pxLine(g, 440, 268, 274, 214, C.groove, 0.18, 1);
    pxLine(g, 90, 268, 214, 228, C.groove, 0.12, 1);
    pxLine(g, 390, 268, 266, 228, C.groove, 0.12, 1);
    for (let x = 30; x < 460; x += 38) {
      pxRect(g, x, 244 + (x % 3), 2, 1, C.groove, 0.3);
    }

    // 烛台
    for (const [x, y] of [[52, 210], [428, 210]]) {
      pxRect(g, x - 1, y - 10, 3, 10, C.parchment, 1);
      pxRect(g, x - 3, y, 7, 2, C.brassDark, 1);
      pxRect(g, x - 4, y + 2, 9, 1, C.nightDeep, 0.8);
      pxRect(g, x, y - 14, 1, 4, C.arcane, 0.9);
      pxRect(g, x - 1, y - 12, 3, 3, C.arcane, 0.35);
      pxRect(g, x, y - 15, 1, 1, C.arcaneLight, 1);
    }
  }

  // 美术升级包标题：紫金地牢墙 + 主角立绘站左侧；保留上方标题、符环与操作提示。
  drawArtBackdrop() {
    this.add.image(240, 135, 'title_wall').setDisplaySize(480, 270).setDepth(0);
    const g = this.add.graphics().setDepth(1);
    pxRect(g, 0, 0, 480, 108, C.void, 0.38);
    pxRect(g, 0, 92, 480, 1, C.brassDark, 0.45);
    pxRect(g, 0, 184, 480, 86, C.void, 0.58);
    pxRect(g, 0, 251, 480, 19, C.ink, 0.82);
    pxRect(g, 0, 250, 480, 1, C.brassDark, 0.6);
    for (let i = 0; i < 10; i++) {
      pxRect(g, 0, i * 14, 12, 14, C.void, 0.05 + i * 0.01);
      pxRect(g, 468, i * 14, 12, 14, C.void, 0.05 + i * 0.01);
    }
    pxRect(g, 18, 257, 116, 2, C.void, 0.55);
    pxRect(g, 28, 259, 96, 1, C.void, 0.35);
    for (let i = 48; i >= 28; i -= 8) pxRect(g, 76 - i, 254, i * 2, 1, C.brassDark, 0.2);
    pxRect(g, 48, 252, 56, 1, C.arcane, 0.1);
    this.add.image(76, 258, 'hero_title').setOrigin(0.5, 1).setDepth(3).setScale(0.9);
    pxRect(g, 44, 242, 1, 1, C.arcaneLight, 0.8);
    pxRect(g, 110, 232, 1, 1, C.arcane, 0.55);
  }

  drawArch(g, cx, baseW, topY, bottomY, fill, edge) {
    const layers = 8;
    for (let i = 0; i < layers; i++) {
      const w = Math.round(baseW * (0.4 + (i / layers) * 0.6));
      const y = topY + i * 5;
      if (y > bottomY) break;
      pxRect(g, cx - w / 2, y, w, 5, fill, 1);
      pxRect(g, cx - w / 2, y, 1, 5, edge, 0.8);
      pxRect(g, cx + w / 2 - 1, y, 1, 5, edge, 0.8);
    }
    pxRect(g, cx - Math.round(baseW * 0.2), topY + 28, Math.round(baseW * 0.4), bottomY - topY - 28, C.ink, 0.85);
    pxRect(g, cx - 1, topY + 28, 2, bottomY - topY - 28, edge, 0.8);
    pxRect(g, cx - Math.round(baseW * 0.2) + 4, topY + 34, 1, bottomY - topY - 40, C.groove, 0.25);
    pxRect(g, cx + Math.round(baseW * 0.2) - 5, topY + 34, 1, bottomY - topY - 40, C.groove, 0.25);
  }

  drawRing(step) {
    const g = this.ringG;
    g.clear();
    const cx = 240;
    const cy = 140;
    const rot = step * ((Math.PI * 2) / 96);
    const rot2 = -step * ((Math.PI * 2) / 128);

    const poly = (rad, phase, count = 16) => {
      const out = [];
      for (let i = 0; i < count; i++) {
        const a = phase + (i / count) * Math.PI * 2;
        out.push({ x: cx + Math.cos(a) * rad, y: cy + Math.sin(a) * rad * 0.86 });
      }
      return out;
    };

    const drawPoly = (pts, color, alpha, width = 1) => {
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        const q = pts[(i + 1) % pts.length];
        pxLine(g, p.x, p.y, q.x, q.y, color, alpha, width);
      }
    };

    drawPoly(poly(54, rot), C.groove, 0.5);
    drawPoly(poly(48, rot), C.brass, 0.28);
    drawPoly(poly(38, rot2), C.groove, 0.32);
    drawPoly(poly(30, rot2), C.brassDark, 0.35);

    // 八根辐条与菱形端点
    for (let i = 0; i < 8; i++) {
      const a = rot * 2 + (i / 8) * Math.PI * 2;
      const x1 = cx + Math.cos(a) * 18;
      const y1 = cy + Math.sin(a) * 18 * 0.86;
      const x2 = cx + Math.cos(a) * 50;
      const y2 = cy + Math.sin(a) * 50 * 0.86;
      pxLine(g, x1, y1, x2, y2, C.brass, 0.4, 1);
      pxDiamond(g, x2, y2, 3, C.arcane, 0.55, true);
      pxDiamond(g, x2, y2, 1, C.arcaneLight, 0.9, true);
    }

    // 中心符印：两层菱形与四点
    pxDiamond(g, cx, cy, 9, C.brass, 0.6, false);
    pxDiamond(g, cx, cy, 5, C.arcane, 0.35, false);
    pxDiamond(g, cx, cy, 2, C.arcaneLight, 0.8, true);
    for (let i = 0; i < 4; i++) {
      const a = rot * 3 + (i / 4) * Math.PI * 2;
      pxRect(g, Math.round(cx + Math.cos(a) * 22), Math.round(cy + Math.sin(a) * 22 * 0.86), 1, 1, C.parchment, 0.5);
    }
  }

  update(time) {
    const step = Math.floor(time / 90);
    if (step !== this.lastRingStep) {
      this.lastRingStep = step;
      this.drawRing(step);
    }

    // 火星：匀速上升，超出画面就回到下方
    const g = this.emberG;
    g.clear();
    for (const e of this.embers) {
      const y = ((e.y - time * e.speed * 0.001) % 270 + 270) % 270;
      const x = Math.round(e.x + Math.sin(time * 0.001 + e.phase) * 3);
      pxRect(g, x, Math.round(y), e.size, e.size, C.arcane, 0.18 + (e.size === 2 ? 0.16 : 0.08));
    }
    // 选中项左侧的菱形呼吸：告诉玩家「这行现在是你选的」
    if (this.caret && !this.panel) {
      const y = menuRowY(this.menuIndex) + MENU_GEOM.h / 2;
      this.caret.clear();
      const a = Math.floor(time / 420) % 2 === 0 ? 1 : 0.55;
      pxDiamond(this.caret, this.menu.x - 8, y, 3, C.brass, a, true);
    }
  }
}
