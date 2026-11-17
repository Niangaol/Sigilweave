// 局内被动清单：纯逻辑（统计 / 文案）+ 源码扫描（两个入口都真的写入、HUD 与暂停菜单真的接了）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { summarizePassives, countPassives, passiveHudText, approxWidth, appendPassive, EVOLUTION_MAX_WIDTH } from '../src/ui/passive-summary.js';

const root = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

// 与 BattleScene.recordPassive 写进 run.passiveLog 的形状一致
const chestEntry = (id, name, stacks = 1, level = 0) => ({ source: 'chest', id, name, level, stacks, desc: name + '：效果' });
const compassEntry = (id, name, stacks = 1, level = 0) => ({ source: 'compass', id, name, level, stacks, desc: name + '：效果' });
const sigils = { starfall: '星陨', frost_arrow: '寒霜箭', flame_burst: '烈焰喷涌', holy_ward: '圣光壁垒' };

describe('局内被动清单 · 统计', () => {
  it('空清单：两种来源都是 0，文案退化成「暂无」', () => {
    expect(countPassives([])).toEqual({ character: 0, compass: 0 });
    expect(summarizePassives([], null)).toEqual({
      counts: { character: 0, compass: 0 },
      character: '人物被动 · 暂无',
      compass: '罗盘增益 · 暂无',
      evolution: '',
    });
    expect(passiveHudText({ character: 0, compass: 0 })).toBe('被动 · 按 Esc 查看');
  });

  it('宝箱与罗盘分开计数，文案各归各的「人物被动 / 罗盘增益」', () => {
    const log = [
      chestEntry('life', '丰沛生命'),
      compassEntry('might', '强能刻度'),
      chestEntry('swift', '轻盈步伐'),
    ];
    expect(countPassives(log)).toEqual({ character: 2, compass: 1 });
    const summary = summarizePassives(log, null);
    expect(summary.character).toBe('人物被动 · 丰沛生命 Lv1 · 轻盈步伐 Lv1');
    expect(summary.compass).toBe('罗盘增益 · 强能刻度 Lv1');
    expect(passiveHudText(summary.counts)).toBe('被动 2 · 增益 1');
  });

  it('同一条重复拿到只留一行，Lv 用 stacks；日志里残留重复行也按一行算', () => {
    const merged = [chestEntry('life', '丰沛生命', 3, 2)];
    expect(countPassives(merged)).toEqual({ character: 1, compass: 0 });
    expect(summarizePassives(merged, null).character).toBe('人物被动 · 丰沛生命 Lv3');

    // 防御：调用方没合并时（同来源同 id 出现两次）也只算一种、只印一行
    const dirty = [chestEntry('life', '丰沛生命', 1), chestEntry('life', '丰沛生命', 1)];
    expect(countPassives(dirty)).toEqual({ character: 1, compass: 0 });
    expect(summarizePassives(dirty, null).character).toBe('人物被动 · 丰沛生命 Lv1');

    // 同一 id 落在两种来源下要分开算（当前卡池 id 不重叠，这里只是防回归）
    const both = [chestEntry('life', '丰沛生命'), compassEntry('life', '丰沛生命')];
    expect(countPassives(both)).toEqual({ character: 1, compass: 1 });
  });

  it('名字缺失 / 未知 id / 脏输入都不炸', () => {
    const summary = summarizePassives([
      { source: 'chest', id: 'ghost', stacks: 2 },
      { source: 'compass', id: 'unknown_buff', name: '' },
      { source: 'npc', id: 'ignored', name: '不该出现' },
      null, 'x', 42, {},
    ], null);
    expect(summary.counts).toEqual({ character: 1, compass: 1 });
    expect(summary.character).toBe('人物被动 · ghost Lv2');
    expect(summary.compass).toBe('罗盘增益 · unknown_buff Lv1');
    for (const bad of [null, undefined, 'nope', 7, [null, {}]]) {
      expect(() => summarizePassives(bad, bad, bad)).not.toThrow();
      expect(countPassives(bad)).toEqual({ character: 0, compass: 0 });
    }
    // names 表只在条目没记名字时兜底
    expect(summarizePassives([{ source: 'chest', id: 'life' }], null, { buffs: { life: '丰沛生命' } }).character)
      .toBe('人物被动 · 丰沛生命 Lv1');
  });

  it('HUD 计数文案：全空给提示，有货给「被动 N · 增益 M」', () => {
    expect(passiveHudText(null)).toBe('被动 · 按 Esc 查看');
    expect(passiveHudText({ character: 0, compass: 0 })).toBe('被动 · 按 Esc 查看');
    expect(passiveHudText({ character: 3, compass: 0 })).toBe('被动 3 · 增益 0');
    expect(passiveHudText({ character: 0, compass: 2 })).toBe('被动 0 · 增益 2');
    expect(passiveHudText({ character: 5, compass: 6 })).toBe('被动 5 · 增益 6');
    expect(passiveHudText({ character: NaN, compass: -1 })).toBe('被动 · 按 Esc 查看');
  });
});

describe('局内被动清单 · 写入（appendPassive）', () => {
  it('第一次新增一行；重复拿到同一个 id 只叠 stacks，level 取高值、desc 跟最新一次', () => {
    const log = [];
    appendPassive(log, 'chest', { id: 'life', name: '丰沛生命' }, 2, '生命上限 +20');
    appendPassive(log, 'chest', { id: 'life', name: '丰沛生命' }, 1, '生命上限 +20');
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({
      source: 'chest', id: 'life', name: '丰沛生命', level: 2, stacks: 2, desc: '生命上限 +20',
    });
    expect(summarizePassives(log, null).character).toBe('人物被动 · 丰沛生命 Lv2');
    expect(passiveHudText(countPassives(log))).toBe('被动 1 · 增益 0');
    // 不同来源用同一个 id 也不合并（两个池子 id 不重叠，这里防回归）
    appendPassive(log, 'compass', { id: 'life', name: '丰沛生命' }, 0, '');
    expect(log).toHaveLength(2);
    expect(countPassives(log)).toEqual({ character: 1, compass: 1 });
  });

  it('非数组 / 无 id 的输入安全返回 null，不抛错', () => {
    expect(appendPassive(undefined, 'chest', { id: 'life' })).toBe(null);
    expect(appendPassive(null, 'chest', { id: 'life' })).toBe(null);
    for (const bad of [null, undefined, {}, 'x', 7]) {
      expect(appendPassive([], 'chest', bad)).toBe(null);
    }
    expect(appendPassive([], 'chest', { id: 'ghost' })).toMatchObject({ name: 'ghost', stacks: 1, level: 0 });
  });
});

describe('局内被动清单 · 进化文案', () => {
  it('有进化就写成「基础法术名→路线名」；没有就不出这一行', () => {
    const summary = summarizePassives([], { starfall: 'comet', frost_arrow: 'glacier_arrow' }, { sigils });
    expect(summary.evolution).toBe('进化 · 星陨→彗星 · 寒霜箭→冰河箭');
    expect(summarizePassives([], null, { sigils }).evolution).toBe('');
    expect(summarizePassives([], {}, { sigils }).evolution).toBe('');
  });

  it('未知 defId / 未知路线不掉字、不抛错', () => {
    expect(summarizePassives([], { ghost_spell: 'route_x' }, null).evolution).toBe('进化 · ghost_spell→route_x');
    // 未登记的路线走 id 兜底，已知法术名照常显示
    expect(summarizePassives([], { starfall: 'not_a_route' }, { sigils }).evolution).toBe('进化 · 星陨→not_a_route');
  });

  it('进化条目太多时按 7px 字宽截断并补「…」，保证只占一行', () => {
    const evolutions = {
      starfall: 'comet', frost_arrow: 'glacier_arrow', flame_burst: 'inferno', holy_ward: 'bastion',
    };
    const summary = summarizePassives([], evolutions, { sigils });
    expect(summary.evolution.endsWith('…')).toBe(true);
    expect(approxWidth(summary.evolution)).toBeLessThanOrEqual(EVOLUTION_MAX_WIDTH);
    expect((summary.evolution.match(/→/g) ?? []).length).toBeLessThanOrEqual(4);
    // 再长的未知 id 也至少保留第一条，不会整行空白
    expect(summarizePassives([], { a_very_long_unknown_spell_id_for_test: 'some_route' }, null).evolution)
      .toContain('a_very_long_unknown_spell_id_for_test→some_route');
  });
});

describe('局内被动清单 · 接入点（源码扫描）', () => {
  const scene = read('src/scenes/BattleScene.js');
  const hud = read('src/ui/Hud.js');
  const pause = read('src/ui/PauseMenu.js');

  it('宝箱与 Boss 战利品两条路都写 passiveLog，重复 id 走 stacks 而不是新增行', () => {
    expect((scene.match(/passiveLog/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((scene.match(/appendPassive\(this\.run\.passiveLog, 'chest'/g) ?? []).length).toBe(1);
    expect((scene.match(/appendPassive\(this\.run\.passiveLog, 'compass'/g) ?? []).length).toBe(1);
    // create 里初始化一次，两条获取路径各刷新一次
    expect((scene.match(/this\.passiveCounts = countPassives\(this\.run\.passiveLog\)/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect(scene).toMatch(/passiveLog \?\?= \[\]/);
    // 顶栏与暂停菜单都从 run 上取数
    expect(scene).toMatch(/passives: this\.passiveCounts/);
    expect(scene).toMatch(/passives: this\.run\.passiveLog/);
  });

  it('HUD 第二行右侧有常驻被动计数（x=236 / y=29 / 7px，只在变化时 setText）', () => {
    expect(hud).toMatch(/this\.passiveText = addText\(scene, 236, 29,/);
    expect(hud).toMatch(/passiveHudText\(passives\)/);
    expect(hud).toMatch(/this\.cache\.passive !== passiveStr/);
    expect(hud).toMatch(/this\.passiveText\.setText\(passiveStr\)/);
  });

  it('暂停菜单有「人物被动 / 罗盘增益」清单与 setPassives，且给了默认文案', () => {
    expect(pause).toContain('人物被动');
    expect(pause).toContain('罗盘增益');
    expect(pause).toMatch(/setPassives\(data = null\)/);
    expect(pause).toMatch(/this\.passiveEvo\.setVisible\(!!this\.passiveSummary\?\.evolution\)/);
    // 老调用不传 info 也不崩：show() 里从 scene.run 兜底
    expect(pause).toMatch(/data\?\.passives \?\? data\?\.passiveLog \?\? run\.passiveLog/);
  });

  it('清单在 y=176..244 内从 177 起排三块，诊断行下移到 233、分隔线让到 241', () => {
    expect(pause).toContain('PASSIVE_X = 124');
    expect(pause).toContain('PASSIVE_W = 232');
    expect(pause).toMatch(/this\.passiveChar = addText\(scene, PASSIVE_X, 177,/);
    expect(pause).toMatch(/this\.passiveCompass = addText\(scene, PASSIVE_X, 197,/);
    expect(pause).toMatch(/this\.passiveEvo = addText\(scene, PASSIVE_X, 217,/);
    expect(pause).toMatch(/this\.diag = addText\(scene, 240, 233,/);
    expect(pause).toMatch(/pxRect\(g, 120, 241, 240, 1/);
    // 不越界：177 + 两层 18.4 ≈ 195.4 < 197，197 + 18.4 ≈ 215.4 < 217，217 + 一层 10.2 ≈ 227.2 < 244
    expect(177 + 2 * 8.2 + 2).toBeLessThan(197);
    expect(197 + 2 * 8.2 + 2).toBeLessThan(217);
    expect(217 + 8.2 + 2).toBeLessThan(233);
  });
});
