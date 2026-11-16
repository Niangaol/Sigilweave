// 战斗场景的纯决策层：不依赖 Phaser，方便单测。
// 幕是叙事单位（1..5），场是玩法单位（1..7），映射统一来自 logic/acts.js。
import { chapterOf, isValidChapter, isValidStage, lastStageOf, stagesOf } from '../logic/acts.js';

// 每场参考时长（秒）。前三幕单场，第四/五幕是两场之和，HUD 倒计时按幕显示。
export const STAGE_REFERENCE_SECONDS = Object.freeze([210, 220, 230, 200, 200, 210, 240]);

// 每场的大 Boss 固定掉一张法术卡，顺序与旧七幕一致。
export const STAGE_SPELL_CARDS = Object.freeze([
  'frost_arrow', 'holy_ward', 'starfall', 'chain_lightning',
  'pierce_lance', 'meteor_judgment', 'quake_maw',
]);

export function chapterDurationMs(chapter) {
  if (!isValidChapter(chapter)) throw new RangeError('幕号无效：' + chapter);
  const seconds = stagesOf(chapter).reduce((sum, stage) => sum + STAGE_REFERENCE_SECONDS[stage - 1], 0);
  return seconds * 1000;
}

export function stageSpellCard(stage) {
  if (!isValidStage(stage)) return null;
  return STAGE_SPELL_CARDS[stage - 1];
}

// 本场大 Boss 结算之后的去向：none 原地不动 / swap 幕内换场 / clear 通幕 / victory 通关。
export function stageAdvanceDecision({ stage, majorCleared } = {}) {
  if (!isValidStage(stage)) throw new RangeError('场号无效：' + stage);
  if (!majorCleared) return 'none';
  if (stage === 7) return 'victory';
  return stage !== lastStageOf(chapterOf(stage)) ? 'swap' : 'clear';
}
