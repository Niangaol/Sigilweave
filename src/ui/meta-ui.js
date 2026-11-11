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

// 24 格契约图鉴（4×6）：点亮显示名字，未点亮显示 ???；格子压到 24px 高，6 行才塞得进 270 高画布
export function metaCodexGrid(scene, { save, cols = 4, cellW = 104, cellH = 24, originX = 26, originY = 56, gapX = 8, gapY = 4 } = {}) {
  const unlockedIds = new Set(save?.milestones ?? []);
  const g = scene.add.graphics();
  const cells = [];
  MILESTONES.forEach((m, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = originX + col * (cellW + gapX);
    const y = originY + row * (cellH + gapY);
    const unlocked = unlockedIds.has(m.id);
    pxRect(g, x, y, cellW, cellH, unlocked ? C.nightSoft : C.ink, unlocked ? 0.95 : 0.6);
    pxFrame(g, x, y, cellW, cellH, unlocked ? C.brass : C.stoneDark, 1, unlocked ? 1 : 0.8);
    addText(scene, x + 5, y + 3, unlocked ? m.label : '???', 7, unlocked ? HEX.parchment : HEX.mute);
    addText(scene, x + cellW - 4, y + 3, unlocked ? '+' + m.reward : '·', 6, unlocked ? HEX.brass : HEX.stoneDark)
      .setOrigin(1, 0);
    if (m.unlockCap) addText(scene, x + 5, y + 12, '上限→' + m.unlockCap, 6, HEX.teal);
    cells.push({ id: m.id, label: unlocked ? m.label : '???', unlocked, reward: m.reward, x, y, cellW, cellH });
  });
  return { cells, unlocked: cells.filter((c) => c.unlocked).length };
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
