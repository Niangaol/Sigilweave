// 局内被动清单的纯逻辑：只吃 run.passiveLog / run.evolutions 这类普通对象，
// 不碰 Phaser，方便在 Node 里单测。HUD 的常驻计数与暂停菜单的「已获」文案都从这里出。
import { evolutionOf } from '../data/evolutions.js';

// passiveLog 里的来源：宝箱（人物被动）与 Boss 战利品（罗盘增益）。
export const PASSIVE_SOURCE = Object.freeze({ CHEST: 'chest', COMPASS: 'compass' });

// 暂停菜单里「进化」一行只有一行高度（折行会压住下面的诊断行），
// 所以按 7px 字号的估算宽度截断：CJK/箭头等宽字符 7px，空格数字 4px。
export const EVOLUTION_MAX_WIDTH = 232;

export function approxWidth(text) {
  let width = 0;
  for (const ch of String(text ?? '')) width += (ch.codePointAt(0) ?? 0) > 0x2000 ? 7 : 4;
  return width;
}

// 同一条被动重复拿到只算「一种」（stacks 记次数），与暂停菜单里一行一条对齐。
export function countPassives(passiveLog) {
  const counts = { character: 0, compass: 0 };
  if (!Array.isArray(passiveLog)) return counts;
  const seen = new Set();
  for (const entry of passiveLog) {
    const source = entry?.source;
    const id = entry?.id;
    if (!id || (source !== PASSIVE_SOURCE.CHEST && source !== PASSIVE_SOURCE.COMPASS)) continue;
    const key = source + ':' + id;
    if (seen.has(key)) continue;
    seen.add(key);
    counts[source === PASSIVE_SOURCE.CHEST ? 'character' : 'compass'] += 1;
  }
  return counts;
}

// 同来源同 id 只留第一条：重复拿到时 stacks +1、level 取较高值，desc 以最新一次为准。
// 纯函数，直接改传进来的数组；调用方负责保证它是 run 上的数组（create 里兜底为 []）。
export function appendPassive(passiveLog, source, buff, level = 0, desc = '') {
  if (!Array.isArray(passiveLog) || !buff?.id) return null;
  const found = passiveLog.find((entry) => entry?.source === source && entry?.id === buff.id);
  if (found) {
    found.stacks = (found.stacks ?? 1) + 1;
    found.level = Math.max(found.level ?? 0, Number.isFinite(level) ? level : 0);
    if (desc) found.desc = desc;
    return found;
  }
  const entry = {
    source,
    id: buff.id,
    name: buff.name ?? String(buff.id),
    level: Number.isFinite(level) ? level : 0,
    stacks: 1,
    desc: desc ?? '',
  };
  passiveLog.push(entry);
  return entry;
}

// 同来源同 id 只留第一条：BattleScene 已把重复拿到的合并成 stacks，
// 这里再兜一层，保证调用方传了脏数据也不会多印一行。
function collectEntries(passiveLog, source) {
  const out = [];
  if (!Array.isArray(passiveLog)) return out;
  const seen = new Set();
  for (const entry of passiveLog) {
    if (!entry || typeof entry !== 'object') continue;
    const id = entry.id;
    if (entry.source !== source || id === undefined || id === null || id === '') continue;
    const key = String(id);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(entry);
  }
  return out;
}

// 名称兜底顺序：条目上记的中文名 → names 表 → id 本身（未知 id 也不炸、不空白）。
function entryLabel(entry, names) {
  const id = entry.id;
  const name = (typeof entry.name === 'string' && entry.name)
    || names?.buffs?.[id]
    || names?.[id]
    || String(id);
  // 文案里的 Lv 是「这局拿到几次」：宝箱能反复开出同一条，stacks 最直观。
  const stacks = Number.isSafeInteger(entry.stacks) && entry.stacks > 0 ? entry.stacks : 1;
  return name + ' Lv' + stacks;
}

function blockText(title, entries, names) {
  if (!entries.length) return title + ' · 暂无';
  return title + ' · ' + entries.map((entry) => entryLabel(entry, names)).join(' · ');
}

// run.evolutions 是 { defId: evoId }；文案写成「基础法术名→进化路线名」。
function evolutionLine(evolutions, names) {
  if (!evolutions || typeof evolutions !== 'object') return '';
  const items = [];
  for (const defId of Object.keys(evolutions)) {
    const evoId = evolutions[defId];
    if (typeof evoId !== 'string' || !evoId) continue;
    const base = names?.sigils?.[defId] ?? defId;
    items.push(base + '→' + (evolutionOf(defId, evoId)?.name ?? evoId));
  }
  if (!items.length) return '';
  let text = '进化 · ';
  let shown = 0;
  for (const item of items) {
    const candidate = text + (shown === 0 ? '' : ' · ') + item;
    // 预留「 · …」的宽度；至少保留第一条，避免未知超长 id 时整行空白。
    if (shown > 0 && approxWidth(candidate) + 24 > EVOLUTION_MAX_WIDTH) {
      text += ' · …';
      break;
    }
    text = candidate;
    shown += 1;
  }
  return text;
}

// passiveLog: [{ source, id, name, level, stacks, desc }]
// evolutions: run.evolutions（可为 null）
// names: { buffs: {id:中文名}, sigils: {defId:中文名} }；也允许直接传平铺的 id→名称表
export function summarizePassives(passiveLog, evolutions = null, names = null) {
  const character = collectEntries(passiveLog, PASSIVE_SOURCE.CHEST);
  const compass = collectEntries(passiveLog, PASSIVE_SOURCE.COMPASS);
  return {
    counts: { character: character.length, compass: compass.length },
    character: blockText('人物被动', character, names),
    compass: blockText('罗盘增益', compass, names),
    evolution: evolutionLine(evolutions, names),
  };
}

// 顶栏常驻小字：有货就报两个计数，全空时退化成一句「按 Esc 查看」。
export function passiveHudText(counts) {
  const n = (value) => (Number.isFinite(value) && value > 0 ? Math.floor(value) : 0);
  const character = n(counts?.character);
  const compass = n(counts?.compass);
  if (!character && !compass) return '被动 · 按 Esc 查看';
  return '被动 ' + character + ' · 增益 ' + compass;
}
