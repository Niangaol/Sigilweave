import { describe, expect, it } from 'vitest';
import {
  passiveRows, costText, nextLevelText, metaHeader, metaPassiveRow, metaCodexGrid, metaFooter,
  codexLayout, codexTextWidth, fitCodexLabel, CODEX_GRID,
} from '../src/ui/meta-ui.js';
import { defaultMeta } from '../src/logic/meta.js';
import { MILESTONES, LEVEL_COSTS } from '../src/data/meta.js';

function fakeText(text = '') {
  const t = {
    text, visible: true,
    setOrigin: () => t, setDepth: () => t, setResolution: () => t, setVisible: () => t,
    setText: (s) => { t.text = s; return t; }, setPosition: () => t, setAlpha: () => t, destroy: () => {},
  };
  return t;
}
function fakeGraphics() {
  const g = { clear: () => g, fillStyle: () => g, fillRect: () => g, lineStyle: () => g, lineBetween: () => g, strokeRect: () => g, strokePoints: () => g, fillPoints: () => g, setDepth: () => g };
  return g;
}
function fakeScene() {
  const texts = [];
  const scene = {
    texts,
    add: {
      graphics: () => fakeGraphics(),
      text: (x, y, str) => { const t = fakeText(str); texts.push(t); return t; },
    },
  };
  return scene;
}

describe('残响祭坛 UI 数据行', () => {
  it('11 条被动按人物→罗盘顺序出列，等级与消耗来自存档', () => {
    const save = defaultMeta();
    save.resonance = 30;
    save.levels.life = 1;
    const rows = passiveRows(save);
    expect(rows.map((r) => r.id)).toEqual(['life', 'swift', 'magnet', 'tough', 'aegis', 'might', 'haste', 'chill', 'wide', 'chain', 'greed']);
    const life = rows.find((r) => r.id === 'life');
    expect(life.level).toBe(1);
    expect(life.cap).toBe(2);
    expect(life.cost).toBe(LEVEL_COSTS[1]);
    expect(life.upgradable).toBe(true);
    expect(life.affordable).toBe(true);
    expect(life.owned).toBe(true);
    expect(rows.every((r) => typeof r.name === 'string' && r.name.length > 0)).toBe(true);
  });

  it('残响不够时仍可升级但标记买不起', () => {
    const save = defaultMeta();
    save.resonance = 0;
    const row = passiveRows(save).find((r) => r.id === 'might');
    expect(row.upgradable).toBe(true);
    expect(row.affordable).toBe(false);
  });

  it('升到上限后转成「需首杀」，升满后是「已满级」', () => {
    const capped = defaultMeta();
    capped.levels.might = 2;
    const capRow = passiveRows(capped).find((r) => r.id === 'might');
    expect(capRow.upgradable).toBe(false);
    expect(capRow.reason).toBe('maxcap');
    expect(costText(capRow)).toBe('需首杀');

    const maxed = defaultMeta();
    maxed.milestones = ['boss-3', 'boss-5', 'boss-7'];
    maxed.levels.might = 5;
    const maxRow = passiveRows(maxed).find((r) => r.id === 'might');
    expect(maxRow.cap).toBe(5);
    expect(costText(maxRow)).toBe('已满级');
  });

  it('可升级时显示残响价格', () => {
    const row = passiveRows(defaultMeta()).find((r) => r.id === 'swift');
    expect(costText(row)).toBe('残响 10');
  });

  it('nextLevelText 在满级时给上限文案', () => {
    expect(nextLevelText(1, 2)).toBe('下一级 · Lv2');
    expect(nextLevelText(2, 2)).toBe('已达上限');
  });
});

describe('残响祭坛 UI 绘制', () => {
  it('页眉显示标题与残响余额', () => {
    const scene = fakeScene();
    const save = defaultMeta();
    save.resonance = 42;
    const out = metaHeader(scene, { save, page: 0 });
    expect(out.title).toBe('残响祭坛');
    expect(out.balanceText.text).toBe('残响 42');
    expect(metaHeader(fakeScene(), { save, page: 1 }).title).toBe('契约图鉴');
  });

  it('被动行同时画出名字、等级、消耗、描述', () => {
    const scene = fakeScene();
    const row = passiveRows(defaultMeta())[0];
    metaPassiveRow(scene, 24, 60, row, 0, true);
    const texts = scene.texts.map((t) => t.text);
    expect(texts).toContain(row.name);
    expect(texts.some((t) => t.startsWith('Lv.0/2'))).toBe(true);
    expect(texts).toContain('残响 10');
    expect(texts).toContain(row.desc);
  });

  it('图鉴 34 格：未点亮显示 ???，点亮显示名字与奖励', () => {
    const scene = fakeScene();
    const save = defaultMeta();
    save.milestones = ['boss-1', 'clear-1'];
    const out = metaCodexGrid(scene, { save });
    expect(out.cells).toHaveLength(MILESTONES.length);
    expect(out.cells).toHaveLength(34);
    expect(out.unlocked).toBe(2);

    const boss1 = out.cells.find((c) => c.id === 'boss-1');
    expect(boss1.unlocked).toBe(true);
    expect(boss1.label).toBe('契约主 · 第 1 场');
    expect(boss1.reward).toBe(25);

    // clear-1..5 是幕通关（1..5 幕），旧的 'clear' 已被数据层删除，点亮的是 clear-1
    const clear1 = out.cells.find((c) => c.id === 'clear-1');
    expect(clear1.unlocked).toBe(true);
    expect(clear1.label).toBe('通关 · 第 1 幕');
    expect(clear1.reward).toBe(30);

    const locked = out.cells.filter((c) => !c.unlocked);
    expect(locked).toHaveLength(32);
    expect(locked.every((c) => c.label === '???')).toBe(true);

    const texts = scene.texts.map((t) => t.text);
    expect(texts.filter((t) => t === '???')).toHaveLength(32);
    expect(texts).toContain('契约主 · 第 1 场');
    expect(texts).toContain('通关 · 第 1 幕');
    expect(texts).toContain('+25');
    expect(texts).toContain('+30');
    // 未点亮的格子不该泄露奖励数值
    expect(texts).not.toContain('+8');
    expect(texts).not.toContain('+60');
  });

  it('小 Boss 点亮后显示「第 N 场」+ 甲乙丙丁后缀，长名字仍塞得进格子', () => {
    const scene = fakeScene();
    const save = defaultMeta();
    save.milestones = ['miniboss-1a', 'miniboss-1d', 'miniboss-4a'];
    const out = metaCodexGrid(scene, { save });

    const a1 = out.cells.find((c) => c.id === 'miniboss-1a');
    expect(a1.unlocked).toBe(true);
    expect(a1.label).toBe('小契约 · 第 1 场甲');
    expect(a1.label).toContain('第 1 场');
    expect(out.cells.find((c) => c.id === 'miniboss-1d').label).toBe('小契约 · 第 1 场丁');
    // 合并幕（第 4、5 幕）只有甲、乙两个小 Boss，标签里的场号仍是场号
    expect(out.cells.find((c) => c.id === 'miniboss-4a').label).toBe('小契约 · 第 4 场甲');

    const texts = scene.texts.map((t) => t.text);
    expect(texts).toContain('小契约 · 第 1 场甲');
    expect(texts).toContain('小契约 · 第 4 场甲');
    expect(texts).toContain('+8');

    // 每一格的渲染文字都必须落在格宽内（7px 字号按 CJK/半角估算像素宽）
    for (const c of out.cells) {
      expect(codexTextWidth(c.text, 7)).toBeLessThanOrEqual(c.cellW - 4);
    }
  });

  it('34 格排成 6 列 × 6 行，右边与底边都不越界', () => {
    const layout = codexLayout(34);
    expect(layout.cols).toBe(6);
    expect(layout.rows).toBe(6);
    expect(layout.cellW).toBe(73);
    expect(layout.cellH).toBe(24);
    expect(layout.right).toBe(466);      // 480 宽画布右侧留 14px
    expect(layout.bottom).toBe(220);     // 页脚从 244 起，留 24px 空隙
    expect(layout.right).toBeLessThanOrEqual(CODEX_GRID.canvasW - CODEX_GRID.marginX);
    expect(layout.bottom).toBeLessThanOrEqual(CODEX_GRID.footerTop);

    const out = metaCodexGrid(fakeScene(), { save: defaultMeta() });
    expect(new Set(out.cells.map((c) => c.x)).size).toBe(6);
    expect(new Set(out.cells.map((c) => c.y)).size).toBe(6);
    for (const c of out.cells) {
      expect(c.x).toBeGreaterThanOrEqual(0);
      expect(c.y).toBeGreaterThanOrEqual(0);
      expect(c.x + c.cellW).toBeLessThanOrEqual(CODEX_GRID.canvasW);
      expect(c.y + c.cellH).toBeLessThanOrEqual(CODEX_GRID.footerTop);
    }
  });

  it('超长标签先压空格、再省略号截断，绝不超出给定宽度', () => {
    // 常规名字原样保留；
    expect(fitCodexLabel('契约主 · 第 1 场', 69, 7)).toBe('契约主 · 第 1 场');
    // 略宽时压掉「 · 」两侧空格，保留「第 N 场」语义；
    expect(fitCodexLabel('清扫者 · 单局击杀 300', 69, 7)).toBe('清扫者·单局击杀 300');
    expect(fitCodexLabel('破局者 · 问答击破 5 次', 69, 7)).toBe('破局者·问答击破5次');
    // 压完还宽才截断，且结尾省略号、宽度不超限。
    const long = '小契约 · 第 12 场戊 · 极长的名字';
    const fitted = fitCodexLabel(long, 69, 7);
    expect(fitted.endsWith('…')).toBe(true);
    expect(codexTextWidth(fitted, 7)).toBeLessThanOrEqual(69);
    expect(fitted.length).toBeLessThan(long.length);
  });

  it('现有 34 条标签全部塞得进 73px 格子，无需省略号', () => {
    for (const m of MILESTONES) {
      const fitted = fitCodexLabel(m.label, 73 - 4, 7);
      expect(fitted.includes('…')).toBe(false);
      expect(codexTextWidth(fitted, 7)).toBeLessThanOrEqual(73 - 4);
    }
  });

  it('页脚按页给不同键位提示', () => {
    expect(metaFooter(fakeScene(), { page: 0 }).hintText.text).toContain('Enter 升级');
    expect(metaFooter(fakeScene(), { page: 1 }).hintText.text).toContain('Tab 切回祭坛');
  });
});
