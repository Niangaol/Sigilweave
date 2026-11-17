// 首页主菜单：六项顺序、循环选择、点击命中、档案行与说明文案；再扫源码确保面板都接上了。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  TITLE_MENU, MENU_GEOM, menuRowY, moveIndex, hitMenuRow, menuLayout, HERO_BOX, totalPassiveLevel,
  codexProgress, statusLine, recordLines, HELP_PAGES, HELP_PAGE_MAX_LINES, HELP_LINE_MAX_CHARS,
  HELP_PAGE_GEOM, clampPage, movePage, pageLabel, CREDITS_LINES, PANEL_TITLES,
} from '../src/ui/title-menu.js';
import { defaultMeta, STORAGE_KEY } from '../src/logic/meta.js';

const root = resolve(import.meta.dirname, '..');
const titleSrc = readFileSync(resolve(root, 'src/scenes/TitleScene.js'), 'utf8');

describe('首页菜单模型', () => {
  it('六项，顺序固定：开始 / 祭坛 / 说明 / 设置 / 档案 / 名单', () => {
    expect(TITLE_MENU.map((m) => m.id)).toEqual(['start', 'meta', 'help', 'settings', 'record', 'credits']);
    for (const item of TITLE_MENU) {
      expect(item.label.length).toBeGreaterThan(0);
      expect(item.hint.length).toBeGreaterThan(0);
    }
  });

  it('六行从 104 排到 224，全部落在 270 高画布内且不压状态条', () => {
    expect(menuRowY(0)).toBe(MENU_GEOM.top);
    expect(menuRowY(5) + MENU_GEOM.h).toBeLessThanOrEqual(232);
    expect(MENU_GEOM.x + MENU_GEOM.w).toBeLessThanOrEqual(480);
    expect(menuRowY(5)).toBeGreaterThan(menuRowY(0));
  });

  it('有主角立绘时菜单右移，任何一行都不压到人物身上', () => {
    const plain = menuLayout(false);
    const hero = menuLayout(true);
    expect(plain.x).toBe(MENU_GEOM.x);
    expect(hero.x).toBeGreaterThan(plain.x);
    // 立绘真实占位到 x=142，菜单底板从 x-18 起，必须让开
    expect(hero.x - 18).toBeGreaterThanOrEqual(HERO_BOX.right);
    // 右缘也不越界
    expect(hero.x + hero.w).toBeLessThanOrEqual(480 - 16);
    expect(hero.cx).toBe(hero.x + Math.round(hero.w / 2));
  });

  it('上下移动到顶/到底循环，非法输入不炸', () => {
    expect(moveIndex(0, -1, 6)).toBe(5);
    expect(moveIndex(5, 1, 6)).toBe(0);
    expect(moveIndex(2, 1, 6)).toBe(3);
    expect(moveIndex(NaN, 1, 6)).toBe(1);
    expect(moveIndex(3, 0, 0)).toBe(3 % 1);
    expect(moveIndex(0, 1, -3)).toBe(0);
  });

  it('点击命中：行矩形内命中，行外返回 -1', () => {
    expect(hitMenuRow(200, menuRowY(0) + 8)).toBe(0);
    expect(hitMenuRow(200, menuRowY(5) + 8)).toBe(5);
    expect(hitMenuRow(200, menuRowY(0) - 20)).toBe(-1);
    expect(hitMenuRow(200, 269)).toBe(-1);
    expect(hitMenuRow(200, NaN)).toBe(-1);
  });
});

describe('档案行与状态条', () => {
  it('空档：残响 0、被动 0/55、契约 0/34、最远第 1 幕', () => {
    const meta = defaultMeta();
    expect(totalPassiveLevel(meta)).toBe(0);
    expect(codexProgress(meta)).toEqual({ unlocked: 0, total: 34 });
    expect(statusLine(meta)).toBe('残响 0　·　契约 0/34　·　最远 第 1 幕');
    const rows = recordLines(meta);
    expect(rows.map((r) => r.label)).toEqual(['残响余额', '被动总级', '契约图鉴', '累计局数', '通关次数', '问答破局', '最远幕', '最高击杀']);
    expect(rows[1].value).toBe('0/55');
  });

  it('有进度时按档读出数值', () => {
    const meta = {
      ...defaultMeta(),
      resonance: 137,
      levels: { life: 5, swift: 2, might: 1 },
      milestones: ['boss-3', 'boss-5'],
      counters: { runs: 9, wins: 2, quizWins: 4, bestAct: 4, bestKills: 311 },
    };
    expect(totalPassiveLevel(meta)).toBe(8);
    expect(codexProgress(meta)).toEqual({ unlocked: 2, total: 34 });
    expect(statusLine(meta)).toContain('残响 137');
    expect(statusLine(meta)).toContain('最远 第 4 幕');
    const rows = recordLines(meta);
    expect(rows[0].value).toBe('137');
    expect(rows[1].value).toBe('8/55');
    expect(rows[6].value).toBe('第 4 幕');
    expect(rows[7].value).toBe('311');
  });

  it('脏数据（负数/字符串/非整数）当 0 处理', () => {
    const meta = { resonance: -5, levels: { life: 99, swift: 'x' }, milestones: ['nope'], counters: { runs: -1, bestAct: 0 } };
    expect(totalPassiveLevel(meta)).toBe(5);   // 等级夹在上限 5
    expect(codexProgress(meta).unlocked).toBe(1); // 图鉴只按数组长度算，未知 id 由存档层过滤
    expect(recordLines(meta)[0].value).toBe('0');
    expect(statusLine(meta)).toContain('最远 第 1 幕');
  });

  it('图鉴总数是 34，与存档层一致', () => {
    expect(codexProgress(defaultMeta()).total).toBe(34);
    expect(STORAGE_KEY).toBe('sigilweave:meta:v1');
  });
});

describe('面板文案与接线', () => {
  it('四个面板标题齐全，说明分页、名单有人名', () => {
    expect(Object.keys(PANEL_TITLES).sort()).toEqual(['credits', 'help', 'record', 'settings']);
    expect(HELP_PAGES.length).toBeGreaterThanOrEqual(6);
    for (const page of HELP_PAGES) {
      expect(page.id.length).toBeGreaterThan(0);
      expect(page.title.length).toBeGreaterThan(0);
      expect(page.lines.length).toBeGreaterThanOrEqual(5);
      expect(page.lines.length).toBeLessThanOrEqual(HELP_PAGE_MAX_LINES);
    }
    expect(CREDITS_LINES.length).toBeGreaterThanOrEqual(3);
    expect(CREDITS_LINES.join('')).toContain('年糕');
    expect(CREDITS_LINES.join('')).toContain('向量');
    expect(CREDITS_LINES.join('')).toContain('君が好きだ');
  });

  it('每页文案都不会折行，整页版面装得进面板', () => {
    // 一行 40 个全角字 = 320px，面板内宽 416px；超了就会折行把 9 行顶到页脚
    for (const page of HELP_PAGES) {
      for (const line of page.lines) {
        expect(line.length).toBeLessThanOrEqual(HELP_LINE_MAX_CHARS);
        expect(line.trim()).toBe(line);
      }
    }
    // 最后一行文字底边不能压到页脚翻页条
    const lastBottom = HELP_PAGE_GEOM.top + (HELP_PAGE_MAX_LINES - 1) * HELP_PAGE_GEOM.step + 11;
    expect(lastBottom).toBeLessThan(HELP_PAGE_GEOM.footY);
  });

  it('页码循环、夹紧与标签', () => {
    expect(clampPage(-1)).toBe(HELP_PAGES.length - 1);
    expect(clampPage(HELP_PAGES.length)).toBe(0);
    expect(clampPage(NaN)).toBe(0);
    expect(movePage(0, -1)).toBe(HELP_PAGES.length - 1);
    expect(movePage(0, 1)).toBe(1);
    expect(pageLabel(0)).toBe('第 1 / ' + HELP_PAGES.length + ' 页');
  });

  it('七页覆盖操作、罗盘、符印、构筑、敌情、成长、Boss', () => {
    expect(HELP_PAGES.map((p) => p.id)).toEqual([
      'control', 'compass', 'sigil', 'build', 'enemy', 'growth', 'boss',
    ]);
    const all = HELP_PAGES.map((p) => p.title + p.lines.join('')).join('');
    for (const word of ['WASD', '罗盘', '锐', '谐', '进化', '连携', '变体', '护盾',
      '被动', '残响', 'Boss', '问答']) {
      expect(all).toContain(word);
    }
  });

  it('说明面板会翻页：键盘左右、上下与鼠标箭头都接上', () => {
    expect(titleSrc).toContain('HELP_PAGES[this.helpPage]');
    expect(titleSrc).toContain('this.turnPage(');
    expect(titleSrc).toContain("on('keydown-LEFT'");
    expect(titleSrc).toContain("on('keydown-RIGHT'");
    expect(titleSrc).toContain('help-prev');
    expect(titleSrc).toContain('help-next');
    expect(titleSrc).toContain('pageLabel(this.helpPage)');
    expect(titleSrc).toContain('page: this.helpPage');
  });

  it('TitleScene 里每项菜单都有去处，且保留调试与验收钩子', () => {
    expect(titleSrc).toContain("case 'start'");
    expect(titleSrc).toContain("case 'meta'");
    expect(titleSrc).toContain("case 'help'");
    expect(titleSrc).toContain("case 'settings'");
    expect(titleSrc).toContain("case 'record'");
    expect(titleSrc).toContain("case 'credits'");
    expect(titleSrc).toContain('__SIGILWEAVE_TITLE__');
    expect(titleSrc).toContain("jump === 'battle'");
    expect(titleSrc).toContain('playCutscene(this, { kind: \'sigil\', to: \'LoadoutScene\'');
  });

  it('键盘与鼠标两条路都在，Esc 能退面板', () => {
    for (const key of ['keydown-UP', 'keydown-DOWN', 'keydown-ENTER', 'keydown-ESC']) {
      expect(titleSrc).toContain(key);
    }
    expect(titleSrc).toContain("this.input.on('pointermove', pointerMove)");
    expect(titleSrc).toContain("this.input.on('pointerdown', pointerDown)");
    expect(titleSrc).toContain('closePanel()');
  });

  it('设置面板真的会落盘并立刻生效（音效 / 震屏 / 引导）', () => {
    expect(titleSrc).toContain('applySettings');
    expect(titleSrc).toContain('setSoundEnabled');
    expect(titleSrc).toContain('SETTING_ROWS');
    const shakeSrc = readFileSync(resolve(root, 'src/ui/camera-shake.js'), 'utf8');
    expect(shakeSrc).toContain("settingValue('shake')");
  });
});
