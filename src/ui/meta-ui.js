// 残响祭坛 · 纯绘制层（无 Phaser 场景依赖，可在 node 下用假 scene 测试）
import { C, HEX, FONT_DISPLAY, addText, pxRect, pxFrame } from './Palette.js';
import { CHARACTER_BUFFS, COMPASS_BUFFS } from '../logic/progression.js';
import { PASSIVE_LINES, MAX_META_LEVEL, MILESTONES, META_UI } from '../data/meta.js';
import { metaLevel, levelCap, canUpgrade } from '../logic/meta.js';

const BUFFS = new Map([...CHARACTER_BUFFS, ...COMPASS_BUFFS].map((b) => [b.id, b]));

export const GROUPS = [
  { key: 'character', title: '人物被动', hint: '宝箱开出' },
  { key: 'compass', title: '罗盘被动', hint: '大Boss战利品' },
];

// 一行一条被动的完整可用状态：名字/描述/等级/上限/消耗/能否升级
export function passiveRows(save) {
  const cap = levelCap(save);
  const rows = [];
  for (const group of GROUPS) {
    for (const id of PASSIVE_LINES[group.key]) {
      const def = BUFFS.get(id);
      if (!def) continue;
      const level = metaLevel(save, id);
      const can = canUpgrade(save, id);
      // 钱不够（reason 'cost'）仍然算「可升级」，只是买不起：行上要显示价格而不是「已满级」
      const upgradable = can.reason === 'ok' || can.reason === 'cost';
      rows.push({
        id,
        group: group.key,
        groupTitle: group.title,
        name: def.name,
        desc: def.desc,
        level,
        cap,
        cost: upgradable ? can.cost : null,
        reason: can.reason,
        affordable: can.reason === 'ok',
        upgradable,
        owned: level > 0,
      });
    }
  }
  return rows;
}

export function nextLevelText(level, cap) {
  return level < cap ? '下一级 · Lv' + (level + 1) : '已达上限';
}

export function costText(row) {
  if (row.upgradable) return META_UI.resonanceUnit + ' ' + row.cost;
  if (row.reason === 'maxcap') return META_UI.lockedHint;
  return '已满级';
}

// 页眉：标题 + 副标题 + 右上角残响余额
export function metaHeader(scene, { save, page = 0 } = {}) {
  const g = scene.add.graphics();
  pxRect(g, 0, 0, 480, 40, C.ink, 0.92);
  pxRect(g, 0, 40, 480, 1, C.brassDark, 0.9);
  const title = page === 1 ? '契约图鉴' : '残响祭坛';
  const sub = page === 1
    ? '大/小Boss 首杀、破局问答与全通，点亮契约节点'
    : '残响沉入法阵，把天赐被动再推一层';
  addText(scene, 22, 10, title, 18, HEX.parchment, { fontFamily: FONT_DISPLAY });
  addText(scene, 24, 29, sub, 7, HEX.mute);
  const balanceText = addText(scene, 458, 12, META_UI.resonanceUnit + ' ' + (save?.resonance ?? 0), 12, HEX.brassLight)
    .setOrigin(1, 0);
  return { balanceText, title };
}

// 单条被动行（左列信息 + 右列消耗）
export function metaPassiveRow(scene, x, y, row, index, selected = false) {
  const g = scene.add.graphics();
  if (selected) {
    pxRect(g, x - 8, y - 3, 216, 30, C.nightSoft, 0.95);
    pxFrame(g, x - 8, y - 3, 216, 30, C.brass, 1, 0.9);
  }
  const nameColor = row.owned ? HEX.brassLight : HEX.parchment;
  const nameText = addText(scene, x, y, row.name, 10, nameColor);
  const levelText = addText(scene, x + 92, y + 2, 'Lv.' + row.level + '/' + row.cap, 8, row.owned ? HEX.teal : HEX.mute);
  const costTextObj = addText(scene, x + 200, y + 1, costText(row), 8, row.upgradable ? (row.affordable ? HEX.arcaneLight : HEX.blood) : HEX.mute)
    .setOrigin(1, 0);
  const descText = addText(scene, x, y + 12, row.desc, 7, HEX.mute, { wordWrap: { width: 196 }, lineSpacing: 1 });
  return { nameText, levelText, costText: costTextObj, descText, index };
}

// 34 格契约图鉴：格宽/行高全部由 480×270 可用区反算，条目再多也不压画布与页脚。
// 默认 6 列 × 6 行：34 格刚好占 6 行，73×24 的格子、右缘 466、底边 220（页脚从 244 起）。
export const CODEX_GRID = Object.freeze({
  canvasW: 480,
  marginX: 13,
  top: 56,
  footerTop: 244,
  bottomPad: 6,
  cols: 6,
  gapX: 3,
  gapY: 4,
  cellH: 24,
});

// 纯算式：给定条目数与网格参数，算出列数、行数、格宽、格高与右缘/底边。
export function codexLayout(count = MILESTONES.length, opts = {}) {
  const cfg = { ...CODEX_GRID, ...(opts || {}) };
  const cols = Math.max(1, Math.floor(cfg.cols));
  const rows = Math.max(1, Math.ceil(Math.max(0, count) / cols));
  const usableW = cfg.canvasW - cfg.marginX * 2;
  const cellW = Math.max(1, Math.floor((usableW - cfg.gapX * (cols - 1)) / cols));
  const usableH = cfg.footerTop - cfg.bottomPad - cfg.top;
  const fitH = Math.floor((usableH - cfg.gapY * (rows - 1)) / rows);
  const cellH = Math.max(1, Math.min(cfg.cellH, fitH));
  const originX = cfg.marginX;
  const originY = cfg.top;
  return {
    cols, rows, cellW, cellH, originX, originY,
    gapX: cfg.gapX, gapY: cfg.gapY,
    right: originX + cols * cellW + (cols - 1) * cfg.gapX,
    bottom: originY + rows * cellH + (rows - 1) * cfg.gapY,
  };
}

// 像素风小字号的宽度估算：CJK/全角按 1 个字号宽，ASCII/半角按 0.55 个字号宽。
const isWideChar = (ch) => {
  const cp = ch.codePointAt(0);
  return cp >= 0x2e80 || cp === 0x2026;
};
export function codexTextWidth(text, size = 7) {
  let width = 0;
  for (const ch of String(text ?? '')) width += isWideChar(ch) ? size : size * 0.55;
  return width;
}

// 格子里的名字必须先塞得进可用宽度：够宽原样显示；略宽依次压「 · 」两侧空格、整句去空格；仍宽才用省略号截断。
export function fitCodexLabel(text, maxW, size = 7) {
  const raw = String(text ?? '');
  if (codexTextWidth(raw, size) <= maxW) return raw;
  const compact = raw.replace(/\s*·\s*/g, '·').replace(/\s{2,}/g, ' ').trim();
  if (codexTextWidth(compact, size) <= maxW) return compact;
  // 还宽就整句去空格（「破局者 · 问答击破 5 次」→「破局者·问答击破5次」），中文排版里这样读并不别扭。
  const dense = compact.replace(/\s+/g, '');
  if (codexTextWidth(dense, size) <= maxW) return dense;
  const chars = [...dense];
  while (chars.length > 0 && codexTextWidth(chars.join('') + '…', size) > maxW) chars.pop();
  return chars.length > 0 ? chars.join('') + '…' : '';
}

export function metaCodexGrid(scene, { save, layout } = {}) {
  const unlockedIds = new Set(save?.milestones ?? []);
  const g = scene.add.graphics();
  const L = layout || codexLayout(MILESTONES.length);
  const cells = [];
  MILESTONES.forEach((m, i) => {
    const col = i % L.cols;
    const row = Math.floor(i / L.cols);
    const x = L.originX + col * (L.cellW + L.gapX);
    const y = L.originY + row * (L.cellH + L.gapY);
    const unlocked = unlockedIds.has(m.id);
    pxRect(g, x, y, L.cellW, L.cellH, unlocked ? C.nightSoft : C.ink, unlocked ? 0.95 : 0.6);
    pxFrame(g, x, y, L.cellW, L.cellH, unlocked ? C.brass : C.stoneDark, 1, unlocked ? 1 : 0.8);
    // 名字独占第一行，奖励挪到第二行右侧：「小契约 · 第 1 场甲」这类长条目才有整格宽度可用。
    const text = unlocked ? fitCodexLabel(m.label, L.cellW - 4, 7) : '???';
    addText(scene, x + 3, y + 2, text, 7, unlocked ? HEX.parchment : HEX.mute);
    addText(scene, x + L.cellW - 4, y + 13, unlocked ? '+' + m.reward : '·', 6, unlocked ? HEX.brass : HEX.stoneDark)
      .setOrigin(1, 0);
    if (m.unlockCap) addText(scene, x + 4, y + 13, '上限→' + m.unlockCap, 6, HEX.teal);
    cells.push({ id: m.id, label: unlocked ? m.label : '???', text, unlocked, reward: m.reward, x, y, cellW: L.cellW, cellH: L.cellH });
  });
  return { cells, unlocked: cells.filter((c) => c.unlocked).length, layout: L };
}

export function metaFooter(scene, { page = 0 } = {}) {
  const g = scene.add.graphics();
  pxRect(g, 0, 244, 480, 26, C.void, 0.86);
  pxRect(g, 0, 244, 480, 1, C.brassDark, 0.7);
  const hint = page === 1
    ? 'Tab 切回祭坛　·　Esc 返回标题'
    : '↑↓ 选择　·　Enter 升级　·　Tab 看契约　·　Esc 返回标题';
  const hintText = addText(scene, 24, 252, hint, 7, HEX.mute);
  return { hintText };
}
