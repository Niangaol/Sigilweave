// 首页主菜单的纯数据与纯算式：菜单项、排版几何、档案行、玩法说明与制作名单。
// 全部不碰 Phaser，场景与单测共用一份，避免文案/坐标两地维护。
import { MAX_META_LEVEL, PASSIVE_IDS, MILESTONES } from '../data/meta.js';

// 六项竖排菜单。hint 显示在菜单项右侧的极小字里，说明「点进去能得到什么」。
export const TITLE_MENU = Object.freeze([
  Object.freeze({ id: 'start', label: '开始游戏', hint: '选一套职业' }),
  Object.freeze({ id: 'meta', label: '残响祭坛', hint: '11 条被动' }),
  Object.freeze({ id: 'help', label: '玩法说明', hint: '罗盘与脉流' }),
  Object.freeze({ id: 'settings', label: '设置', hint: '音效·震动' }),
  Object.freeze({ id: 'record', label: '档案 · 战绩', hint: '残响与进度' }),
  Object.freeze({ id: 'credits', label: '制作名单', hint: '一页纸' }),
]);

// 菜单几何：480×270 画布，标题块占到 y≈95，底部 232 起留给状态条。
// 六行 × 20px 从 104 排到 224，行宽 200 居中于 x=240，避开左下角主角立绘（右缘约 124）。
export const MENU_GEOM = Object.freeze({
  top: 104,
  step: 20,
  h: 16,
  w: 200,
  x: 140,
  canvasW: 480,
});

export function menuRowY(index) {
  return MENU_GEOM.top + index * MENU_GEOM.step;
}

// 左下角主角立绘的真实占位（public/assets/ui/hero_title.png 146×176、scale 0.9、origin 0.5/1 于 (76,258)）。
// 它压到 x≈142、y≈100..258，所以有立绘时菜单整体右移，别让按钮压在人身上。
export const HERO_BOX = Object.freeze({
  left: 10, right: 142, top: 100, bottom: 258,
});

// 菜单整体布局：有立绘时右移 26px，宽度不变，居中线的位移同步给状态条与页脚。
export function menuLayout(hasHero = false) {
  const x = hasHero ? 166 : MENU_GEOM.x;
  return { x, w: MENU_GEOM.w, cx: x + Math.round(MENU_GEOM.w / 2), hasHero: !!hasHero };
}

// 上下移动：到顶/到底循环，键盘和鼠标共用一套索引。
export function moveIndex(index, delta, length = TITLE_MENU.length) {
  const n = Math.max(1, length | 0);
  const i = Number.isFinite(index) ? Math.trunc(index) : 0;
  const d = Number.isFinite(delta) ? Math.trunc(delta) : 0;
  return ((i + d) % n + n) % n;
}

// 指针落在哪一行：y 落在行矩形内即可，x 不参与（整行都可点，横向余量留给小屏）。
export function hitMenuRow(x, y, length = TITLE_MENU.length) {
  if (!Number.isFinite(y)) return -1;
  for (let i = 0; i < length; i++) {
    const top = menuRowY(i);
    if (y >= top - 2 && y <= top + MENU_GEOM.h + 2) return i;
  }
  return -1;
}

// 残响总级：11 条被动的等级之和，满级 55。
export function totalPassiveLevel(save) {
  const levels = save?.levels ?? {};
  let sum = 0;
  for (const id of PASSIVE_IDS) {
    const v = levels[id];
    if (Number.isSafeInteger(v) && v > 0) sum += Math.min(MAX_META_LEVEL, v);
  }
  return sum;
}

export function codexProgress(save) {
  const unlocked = new Set(Array.isArray(save?.milestones) ? save.milestones : []);
  return { unlocked: unlocked.size, total: MILESTONES.length };
}

// 底部状态条：残响、契约进度、最远幕。缺字段一律当 0/1 处理，老档也能读。
export function statusLine(save) {
  const resonance = Number.isSafeInteger(save?.resonance) && save.resonance > 0 ? save.resonance : 0;
  const codex = codexProgress(save);
  const best = Number.isSafeInteger(save?.counters?.bestAct) && save.counters.bestAct > 0 ? save.counters.bestAct : 1;
  return '残响 ' + resonance + '　·　契约 ' + codex.unlocked + '/' + codex.total + '　·　最远 第 ' + best + ' 幕';
}

// 档案页的行：左标签 + 右数值，UI 直接按行渲染。
export function recordLines(save) {
  const c = save?.counters ?? {};
  const codex = codexProgress(save);
  const resonance = Number.isSafeInteger(save?.resonance) && save.resonance > 0 ? save.resonance : 0;
  const safe = (v) => (Number.isSafeInteger(v) && v > 0 ? v : 0);
  return [
    { label: '残响余额', value: String(resonance) },
    { label: '被动总级', value: totalPassiveLevel(save) + '/' + PASSIVE_IDS.length * MAX_META_LEVEL },
    { label: '契约图鉴', value: codex.unlocked + '/' + codex.total },
    { label: '累计局数', value: String(safe(c.runs)) },
    { label: '通关次数', value: String(safe(c.wins)) },
    { label: '问答破局', value: String(safe(c.quizWins)) },
    { label: '最远幕', value: '第 ' + (safe(c.bestAct) || 1) + ' 幕' },
    { label: '最高击杀', value: String(safe(c.bestKills)) },
  ];
}

// 玩法说明的版面：面板 440×190，标题行 28、正文从 42 起、行距 14、最多 9 行，
// 页脚翻页条落在 174。正文 8px + 416 宽换行，单行不超过 HELP_LINE_MAX_CHARS 就不会折行。
export const HELP_PAGE_GEOM = Object.freeze({
  titleY: 28,
  top: 42,
  step: 14,
  maxLines: 9,
  footY: 174,
});

export const HELP_PAGE_MAX_LINES = HELP_PAGE_GEOM.maxLines;
// 40 个全角字 = 320px，留出右边距；超过就会折行，把 9 行的版面顶到页脚上。
export const HELP_LINE_MAX_CHARS = 40;

// 玩法说明分七页：基本操作 / 罗盘 / 符印 / 构筑 / 敌情 / 成长 / Boss 与幕间。
// 文案与 docs/试玩清单.md 的验收条目一一对应，改了哪条记得两边一起改。
export const HELP_PAGES = Object.freeze([
  Object.freeze({
    id: 'control',
    title: '一 · 操作与界面',
    lines: Object.freeze([
      'WASD 或方向键移动。攻击是自动的，符印按自己的间隔出手。',
      'Esc 暂停：看已获被动、进化与当前构筑，也能开关音效、震动。',
      'R 重开本局，T 回标题。M 直接静音。',
      '升级弹三选一：↑↓ 选、Enter 确认，也能用鼠标点。',
      '问答与幕间同理，Esc 退回上一层。',
      '开场与过场按住空格跳过，SKIP 提示出现后才生效。',
      '首轮先选初始套装：三套职业各有本命被动与小配件。',
    ]),
  }),
  Object.freeze({
    id: 'compass',
    title: '二 · 罗盘与脉流',
    lines: Object.freeze([
      '右下角罗盘就是你周围的 4×4 方位，一共 16 格。',
      '格子在左边，就朝你左侧的区域出手；同一符印可以摆多格。',
      '基础间隔 1400ms，随幕数收紧到 920ms。',
      '位置也有冷却：角落 800ms、边格 1100ms、中心 2200ms。',
      '越靠中间越贵，但也越容易同时覆盖多个方向。',
      '间隔下限 500ms、冷却下限 600ms，堆再快也有底。',
      '共鸣石：让正交相邻格的间隔与冷却 -25%，放中心最划算。',
      '脉流：金线在格间跳跃，踩到就触发；冷却没好会被吞跳（受阻）。',
      '联组：连续踩中指定形状（对偶／直线／折线／环封）追加伤害。',
    ]),
  }),
  Object.freeze({
    id: 'sigil',
    title: '三 · 符印与形态',
    lines: Object.freeze([
      '24 张符印：20 张有「锐」「谐」两种形态，4 张只有本体。',
      '锐：伤害 ×1.30，代价是失去联动；谐：伤害 ×0.82，能与同派系联动。',
      '抽取权重 0.45 / 0.275 / 0.275：本体、锐、谐。',
      '七派系：奥术、寒霜、烈焰、风暴、圣光、魂灵、荒野。',
      '四组反应：融 寒霜×烈焰、导 风暴×寒霜、焦 烈焰×荒野、净 魂灵×圣光。',
      '反应只看哪两个派系挨着摆，位置比数值更重要。',
      '进化：每张符印两条路线，共 48 条；进化不占格，只把整条强化。',
      '连携：10 组相邻搭配，摆对位置就自动生效。',
      '重档法术按幕解锁：中档第 2 幕、重档第 3 幕、演出级第 4 幕。',
    ]),
  }),
  Object.freeze({
    id: 'build',
    title: '四 · 构筑与三选一',
    lines: Object.freeze([
      '符印池 = 16 张基础符印 + 6 张辅助卡，抽到什么取决于当前幕。',
      '辅助卡（共鸣石、沙漏一类）不受按幕解锁限制，第一幕就出现。',
      '幕间是连续三轮三选一，越往后越接近定调。',
      '另有 4 条铭文与 3 条誓约，各自把构筑推向不同方向。',
      '进化牌出现时，说明对应符印已经满足进化条件。',
      '拿不准就选输出：活下来才谈得上构筑。',
    ]),
  }),
  Object.freeze({
    id: 'enemy',
    title: '五 · 敌情',
    lines: Object.freeze([
      '26 种敌人：19 种普通，7 种一出生就是精英。',
      '每场都混入变体：迅捷更快，重甲带 60% 生命护盾，精英全面强化。',
      '重甲盾打空会破盾眩晕 400ms，这是最好的出手窗口。',
      '近战怪先亮红色扇形前摇，冲锋撞上伤害 ×2.5。',
      '远程怪亮圆圈前摇后开枪，弹道看得见，能侧身躲。',
      '炮台与符阵这类召唤物会持续输出，优先级往往比小怪高。',
      '同屏上限随幕上涨，第一场封 24 只、第七场封 104 只。',
      '屏幕外的敌人打不到你，也不必追。',
    ]),
  }),
  Object.freeze({
    id: 'growth',
    title: '六 · 成长与被动',
    lines: Object.freeze([
      '升级需求是线性的：30 + 4 ×（等级 − 1），越往后越慢。',
      '宝箱给人物被动，共 5 条；Boss 战利品给罗盘增益，共 6 条。',
      'HUD 第二行常驻显示数量，Esc 暂停能看具体清单。',
      '残响是局外货币，每局按幕数、击杀、问答与胜负结算。',
      '残响祭坛有 11 条永久被动，每条 5 级，满级共 55 级。',
      '永久被动只在你抽到同一张被动时追加加成，不改开局强度。',
      '契约图鉴 34 个节点、合计 585 分，靠通关与特殊打法解锁。',
      '护盾上限只有 24 点，别指望靠它硬吃伤害。',
    ]),
  }),
  Object.freeze({
    id: 'boss',
    title: '七 · Boss 与幕间',
    lines: Object.freeze([
      '一局七场、五幕。每场打到等级门槛，Boss 就登场。',
      '门槛：5 / 11 / 16 / 20 / 24 / 27 / 30 级。',
      '小 Boss 常驻 25% 减伤，场 Boss 30%，硬拼要算时间。',
      '开打前可能先出问答，线索在当次对白与碑文里。',
      '答对可以直接送走 Boss，答错就进入实战。',
      'Boss 战镜头会为立绘让位，但你始终留在画面里。',
      '打完一场进幕间：三选一、回血、结算，然后下一场。',
      '整局约 27 分钟，单场 4–5 分钟。',
    ]),
  }),
]);

// 页码夹紧 + 循环翻页：非法输入一律回第一页，别让面板空白。
export function clampPage(index) {
  const n = HELP_PAGES.length;
  const i = Number.isFinite(index) ? Math.trunc(index) : 0;
  return ((i % n) + n) % n;
}

export function movePage(index, delta) {
  const n = HELP_PAGES.length;
  const d = Number.isFinite(delta) ? Math.trunc(delta) : 0;
  return clampPage((Number.isFinite(index) ? Math.trunc(index) : 0) + d);
}

// 页脚文案：第 3 / 7 页
export function pageLabel(index, total = HELP_PAGES.length) {
  const n = Math.max(1, total | 0);
  return '第 ' + (clampPage(index) + 1) + ' / ' + n + ' 页';
}

// 制作名单：三人，不标分工（分工待作者补，不瞎猜）。
export const CREDITS_LINES = Object.freeze([
  '共 振 法 阵',
  '年糕 · 向量 · 君が好きだ',
  '像素美术与程序化音乐均为自制',
  '感谢每一位刻阵者',
]);

export const PANEL_TITLES = Object.freeze({
  help: '玩法说明',
  settings: '设置',
  record: '档案 · 战绩',
  credits: '制作名单',
});
