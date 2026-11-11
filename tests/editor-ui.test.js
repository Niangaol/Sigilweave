import { describe, it, expect } from 'vitest';
import { C, HEX } from '../src/ui/Palette.js';
import { SIGIL_DEFS, AUX_DEFS } from '../src/logic/effects.js';
import { CARD_HINTS } from '../src/data/card-hints.js';
import { kitPanel, kitBoard, kitBoardMotion, kitHeader, kitSteps, kitCell, kitHandRow, kitDetail, kitAction, clipText } from '../src/ui/editor-ui.js';

function fakeG() {
  const calls = [];
  const g = {
    calls,
    fillStyle: (c, a) => { calls.push(['fillStyle', c, a]); return g; },
    fillRect: (x, y, w, h) => { calls.push(['fillRect', x, y, w, h]); return g; },
    fillPoints: (pts, close) => { calls.push(['fillPoints', pts, close]); return g; },
    lineStyle: (w, c, a) => { calls.push(['lineStyle', w, c, a]); return g; },
    strokePoints: (pts, close) => { calls.push(['strokePoints', pts, close]); return g; },
    clear: () => { calls.push(['clear']); return g; },
  };
  return g;
}

function textSink() {
  const lines = [];
  const fn = (x, y, s, size = 8, color = HEX.parchment) => {
    const t = { x, y, s: String(s), size, color, origin: null, setOrigin(ox, oy) { this.origin = [ox, oy]; return this; } };
    lines.push(t);
    return t;
  };
  fn.lines = lines;
  return fn;
}

const rect = { x: 10, y: 10, w: 51, h: 26 };

describe('共享法阵编辑器组件', () => {
  it('面板画满四角铆钉与双层边框，且没有 NaN 坐标', () => {
    const g = fakeG();
    kitPanel(g, 10, 20, 100, 50);
    const rects = g.calls.filter(c => c[0] === 'fillRect');
    for (const c of rects) expect(c.slice(1).every(Number.isFinite)).toBe(true);
    // 四角铆钉：4 个黄铜 3×3 + 4 个高光点
    const rivets = rects.filter(c => c[3] === 3 && c[4] === 3);
    expect(rivets.length).toBeGreaterThanOrEqual(4);
  });

  it('法阵盘装饰层画出板框、罗盘钉与格间导线，且没有 NaN', () => {
    const g = fakeG();
    kitBoard(g, {
      panel: { x: 10, y: 42, w: 224, h: 210 },
      cells: { x0: 14, y0: 56, cw: 51, ch: 26, gapX: 3, gapY: 3 },
    });
    const rects = g.calls.filter(c => c[0] === 'fillRect');
    expect(rects.length).toBeGreaterThan(30);
    for (const c of rects) expect(c.slice(1).every(Number.isFinite)).toBe(true);
    // 四向罗盘钉是空心菱形（pxPolyLine 走 strokePoints）
    expect(g.calls.some(c => c[0] === 'strokePoints')).toBe(true);
  });

  it('法阵盘动态层：不同时间产生不同绘制，且坐标都是有限数', () => {
    const opts = {
      panel: { x: 10, y: 42, w: 224, h: 210 },
      cells: { x0: 14, y0: 56, cw: 51, ch: 26, gapX: 3, gapY: 3 },
      focusId: 5,
      selecting: true,
      unlocked: [4, 5, 6, 7],
      slots: [{ id: 5, slot: { kind: 'sigil', defId: 'arcane_bolt' } }],
    };
    const a = fakeG();
    kitBoardMotion(a, { ...opts, t: 0 });
    const b = fakeG();
    kitBoardMotion(b, { ...opts, t: 900 });
    expect(a.calls.length).toBeGreaterThan(20);
    expect(JSON.stringify(a.calls)).not.toBe(JSON.stringify(b.calls));
    for (const c of a.calls) {
      if (c[0] === 'fillRect') expect(c.slice(1).every(Number.isFinite)).toBe(true);
    }
  });

  it('步骤条把当前步骤画成黄铜、已完成画成青色', () => {
    const g = fakeG();
    const tx = textSink();
    kitSteps(g, tx, 10, 10, 460, { active: 1 });
    const colors = g.calls.filter(c => c[0] === 'fillStyle').map(c => c[1]);
    expect(colors).toContain(C.brassLight);
    expect(colors).toContain(C.teal);
    expect(tx.lines.map(t => t.s).join(' ')).toContain('2 放位');
  });

  it('符位：封印 / 空符位 / 已放置 三种文案，选中手牌时空位提示可放置', () => {
    const tx1 = textSink();
    kitCell(fakeG(), tx1, 0, rect, { unlocked: false });
    expect(tx1.lines.map(t => t.s).join(' ')).toContain('封印');

    const tx2 = textSink();
    kitCell(fakeG(), tx2, 8, rect, { unlocked: true, selecting: true });
    expect(tx2.lines.map(t => t.s).join(' ')).toContain('可放置');

    const tx3 = textSink();
    const g = fakeG();
    kitCell(g, tx3, 5, rect, {
      unlocked: true, slot: { kind: 'sigil', defId: 'arcane_bolt' }, runes: 2, exits: 3, target: 9,
    });
    const all = tx3.lines.map(t => t.s).join(' ');
    expect(all).toContain('奥术飞弹');
    expect(all).toContain('铭2');
    expect(all).toContain('出3');
    expect(all).toContain('→10');
    // 铭文槽：两个小菱形（pxDiamond 填充走 fillPoints）
    expect(g.calls.filter(c => c[0] === 'fillPoints').length).toBeGreaterThanOrEqual(2);
  });

  it('辅助待绑定：目标格描青框并提示可绑定', () => {
    const g = fakeG();
    const tx = textSink();
    kitCell(g, tx, 6, rect, { unlocked: true, auxValid: true });
    expect(tx.lines.map(t => t.s).join(' ')).toContain('可绑定');
    expect(g.calls.some(c => c[0] === 'fillStyle' && c[1] === C.teal)).toBe(true);
  });

  it('手牌行：名称×数量 + 截断效果说明，选中整行青框', () => {
    const g = fakeG();
    const tx = textSink();
    kitHandRow(g, tx, { x: 244, y: 88, w: 216, h: 14 }, {
      defId: 'starfall', kind: 'sigil', count: 2, hint: CARD_HINTS.starfall, selected: true,
    });
    const all = tx.lines.map(t => t.s).join(' ');
    expect(all).toContain('星陨 ×2');
    expect(all).toContain('…');
    expect(g.calls.some(c => c[0] === 'fillStyle' && c[1] === C.teal)).toBe(true);
  });

  it('详情面板按行裁剪，超长行以省略号结尾', () => {
    const tx = textSink();
    kitDetail(fakeG(), tx, { x: 10, y: 10, w: 224, h: 74 }, {
      title: '详情', lines: [{ text: '一'.repeat(50), max: 10 }],
    });
    expect(tx.lines[1].s).toBe('一'.repeat(9) + '…');
  });

  it('主按钮有 primary 青框，禁用时不改文字仍可见', () => {
    const g = fakeG();
    const tx = textSink();
    kitAction(g, tx, { x: 240, y: 234, w: 230, h: 18 }, '完成', { primary: true });
    expect(g.calls.some(c => c[0] === 'fillStyle' && c[1] === C.teal)).toBe(true);
    expect(tx.lines.map(t => t.s)).toContain('完成');
  });

  it('每张符印/辅助都有共享效果文案', () => {
    for (const id of Object.keys({ ...SIGIL_DEFS, ...AUX_DEFS })) {
      expect(CARD_HINTS[id], id + ' 缺效果文案').toBeTruthy();
    }
  });

  it('clipText 对负数/空值安全', () => {
    expect(clipText('', 10)).toBe('');
    expect(clipText(null, 10)).toBe('');
    expect(clipText('abc', 10)).toBe('abc');
    expect(clipText('abcdef', 4)).toBe('abc…');
  });
});
