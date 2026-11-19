// 道具技能库：升级三选一选中的法术卡登记为 1/2/3 主动技能，冷却与释放。
// 从 BattleScene 迁出（2026-11-19 架构重构波 3）。场景方法保留同名一行委托；
// 技能复用法术命中管线（applySigil），伤害/命中/连锁/经验照常结算。
import { SIGIL_DEFS } from '../logic/effects.js';
import { HEX } from '../ui/Palette.js';
import { fireGuide } from '../logic/guide.js';
import { sfx } from '../audio/Sfx.js';
import { saveRun } from '../logic/save.js';
import { visibleFilter } from '../logic/sector.js';

export const SKILL_CD_BASE = 5200;
const SKILL_SLOT_MAX = 3;


export function grantSkill(scene, defId) {
  if (!Object.hasOwn(SIGIL_DEFS, defId)) return;
  const def = SIGIL_DEFS[defId];
  const lib = scene.run.skillLibrary ?? (scene.run.skillLibrary = []);
  const existing = lib.find(s => s.defId === defId);
  if (existing) { existing.cdMs = scene.skillCdOf(def); return; }
  const entry = { defId, name: def.name, kind: def.kind, cdMs: scene.skillCdOf(def), cooldownUntil: 0 };
  if (lib.length < SKILL_SLOT_MAX) lib.push(entry);
  else { lib.shift(); lib.push(entry); } // 槽位已满：顶掉最早的一格
  const slot = lib.indexOf(entry) + 1;
  scene.effects.text(240, 116, '技能入库 · ' + def.name + '（按 ' + slot + '）', HEX.teal, true);
  fireGuide(scene, scene.run, 'SKILL_GAIN', { name: def.name, slot });
  scene.saveProgress();
}


export function skillCdOf(scene, def) {
  return Math.round(SKILL_CD_BASE * (Number.isFinite(def.cdMul) ? def.cdMul : 1));
}


export function skillHostCell(scene) {
  const cells = scene.grid?.cells ?? [];
  for (const cell of cells) {
    if (cell.unlocked && !cell.mutedOutput && cell.slot?.kind === 'sigil') return cell.id;
  }
  return Number.isInteger(scene.startCell) ? scene.startCell : (cells.find(c => c.unlocked)?.id ?? 4);
}


export function pickSkillAim(scene) {
  const visible = visibleFilter(scene.viewRect());
  let best = null, bestD = Infinity;
  for (const e of scene.enemies) {
    if (!e.alive || !visible(e)) continue;
    const d = Math.hypot(e.x - scene.player.x, e.y - scene.player.y);
    if (d < bestD) { bestD = d; best = e; }
  }
  if (best) return { x: best.x, y: best.y };
  const facing = Number.isFinite(scene.player.facing) ? scene.player.facing : 0;
  return { x: scene.player.x + Math.cos(facing) * 60, y: scene.player.y + Math.sin(facing) * 60 };
}


export function castSkill(scene, index) {
  if (scene.phase !== 'play' || scene.paused || scene.hitstopLeft > 0 || !scene.player.alive) return;
  const entry = scene.run.skillLibrary?.[index];
  if (!entry) return;
  if (scene.engine.now < (entry.cooldownUntil ?? 0)) {
    scene.effects.text(240, 116, '技能冷却中', HEX.mute, true);
    return;
  }
  const def = SIGIL_DEFS[entry.defId];
  if (!def) return;
  const origin = scene.player.staffTip();
  const aim = scene.pickSkillAim();
  const angle = Math.atan2(aim.y - origin.y, aim.x - origin.x);
  entry.cooldownUntil = scene.engine.now + entry.cdMs;
  sfx.trigger();
  scene.effects.spellCast(entry.defId, origin.x, origin.y, angle);
  // 复用法术命中管线：伤害/命中数字/连锁/经验/碎片全部照常结算。
  const result = scene.applySigil(scene.skillHostCell(), entry.defId, aim, angle);
  if (def.kind === 'ward') scene.effects.spellWard(entry.defId, def.radius ?? 40);
  else if (!result.empty) scene.effects.spellImpact(entry.defId, aim.x, aim.y, def.radius ?? 14, angle);
  fireGuide(scene, scene.run, 'SKILL_CAST', { name: entry.name });
  scene.saveProgress();
}

