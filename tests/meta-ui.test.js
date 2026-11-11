import { describe, expect, it } from 'vitest';
import {
  passiveRows, costText, nextLevelText, metaHeader, metaPassiveRow, metaCodexGrid, metaFooter,
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

  it('图鉴 24 格：未点亮显示 ???，点亮显示名字与奖励', () => {
    const scene = fakeScene();
    const save = defaultMeta();
    save.milestones = ['boss-1', 'clear'];
    const out = metaCodexGrid(scene, { save });
    expect(out.cells).toHaveLength(MILESTONES.length);
    expect(out.cells).toHaveLength(24);
    expect(out.unlocked).toBe(2);
    const boss1 = out.cells[0];
    expect(boss1.unlocked).toBe(true);
    expect(boss1.label).toBe('契约主 · 第 1 幕');
    expect(out.cells[1].label).toBe('???');
    const texts = scene.texts.map((t) => t.text);
    expect(texts.filter((t) => t === '???')).toHaveLength(22);
  });

  it('页脚按页给不同键位提示', () => {
    expect(metaFooter(fakeScene(), { page: 0 }).hintText.text).toContain('Enter 升级');
    expect(metaFooter(fakeScene(), { page: 1 }).hintText.text).toContain('Tab 切回祭坛');
  });
});
