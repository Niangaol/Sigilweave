// 幕与场的唯一映射表：「幕 chapter」是叙事单位（1..5），「场 stage」是玩法单位（1..7）。
// 第三幕之后开始合并：第四幕 = 沉钟书库 → 衡律法庭，第五幕 = 熔星锻炉 → 破晓之座。
// 账目、等级、遭遇、事件点、场次卡都以 stage 为准；幕间、通幕、结算以 chapter 为准。
export const STAGE_COUNT = 7;
export const CHAPTER_COUNT = 5;

export const CHAPTERS = Object.freeze([
  Object.freeze({ chapter: 1, numeral: 'Ⅰ', title: '荒废墓园', star: '天枢', stages: Object.freeze([1]) }),
  Object.freeze({ chapter: 2, numeral: 'Ⅱ', title: '腐沼教堂', star: '天璇', stages: Object.freeze([2]) }),
  Object.freeze({ chapter: 3, numeral: 'Ⅲ', title: '星陨王庭', star: '天玑', stages: Object.freeze([3]) }),
  Object.freeze({ chapter: 4, numeral: 'Ⅳ', title: '审判书库', star: '天权 · 玉衡', stages: Object.freeze([4, 5]) }),
  Object.freeze({ chapter: 5, numeral: 'Ⅴ', title: '熔星破晓', star: '开阳 · 摇光', stages: Object.freeze([6, 7]) }),
]);

export function isValidStage(stage) {
  return Number.isInteger(stage) && stage >= 1 && stage <= STAGE_COUNT;
}

export function isValidChapter(chapter) {
  return Number.isInteger(chapter) && chapter >= 1 && chapter <= CHAPTER_COUNT;
}

export function chapterOf(stage) {
  if (!isValidStage(stage)) throw new RangeError('场号无效：' + stage);
  return stage <= 3 ? stage : stage <= 5 ? 4 : 5;
}

export function stagesOf(chapter) {
  if (!isValidChapter(chapter)) throw new RangeError('幕号无效：' + chapter);
  return [...CHAPTERS[chapter - 1].stages];
}

export function firstStageOf(chapter) {
  return stagesOf(chapter)[0];
}

export function lastStageOf(chapter) {
  const stages = stagesOf(chapter);
  return stages[stages.length - 1];
}

export function nextStage(stage) {
  if (!isValidStage(stage) || stage === STAGE_COUNT) return null;
  return stage + 1;
}

// 前三幕各四个小 Boss，合并幕各两个：场 1-3 有 a..d，场 4-7 只有 a、b。
export function minorBossIdsOfStage(stage) {
  if (!isValidStage(stage)) throw new RangeError('场号无效：' + stage);
  const suffixes = chapterOf(stage) <= 3 ? ['a', 'b', 'c', 'd'] : ['a', 'b'];
  return suffixes.map((s) => 'miniboss-' + stage + s);
}

export function majorBossIdOfStage(stage) {
  if (!isValidStage(stage)) throw new RangeError('场号无效：' + stage);
  return 'boss-' + stage;
}

export function encounterIdsOfStage(stage) {
  return ['npc-' + stage, ...minorBossIdsOfStage(stage), majorBossIdOfStage(stage)];
}

export function encounterIdsOfChapter(chapter) {
  return stagesOf(chapter).flatMap(encounterIdsOfStage);
}

// 通幕条件：本幕每一场的大 Boss 都已记入 bossResolutions（每场一条，共七条）。
export function chapterMajorsCleared(run, chapter) {
  const receipts = run?.bossResolutions;
  if (!receipts || typeof receipts !== 'object') return false;
  return stagesOf(chapter).every((stage) => {
    const receipt = receipts[stage];
    return !!receipt && receipt.tier !== 'mini';
  });
}
