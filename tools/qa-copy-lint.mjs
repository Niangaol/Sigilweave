// 问答文案自查脚本（只读，不改任何文件）
// 用法：node tools/qa-copy-lint.mjs
// 检查两类问题：
//   1) 硬约束：与 tests/encounters.test.js 同源，改文案时踩了会挂测试
//   2) 容量告警：横屏 480×270 面板放不下（不会裁剪，文字会压到选项/按钮上）
import { ENCOUNTERS } from '../src/data/encounters.js';

// 横屏面板实测容量（字号 × 行数 × 每行字数），改版式后请同步调整
const BUDGET = {
  title: 32,        // 标题行 12px，1 行
  clueTotal: 138,   // 线索行 9px，3 行 × 46 字
  question: 82,     // 题面 10px，2 行 × 41 字
  option: 12,       // 选项单行显示
  body: 111,        // 答对/答错正文 11px，3 行 × 37 字
  explanation: 225, // 解析 9px，5 行 × 45 字
};

const len = (s) => [...String(s ?? '')].length;
const errors = [];
const warns = [];
const rows = [];
const expectIds = ['npc-1','npc-2','npc-3','boss-1','boss-2','boss-3','miniboss-1a','miniboss-1b','miniboss-2a','miniboss-2b','miniboss-3a','miniboss-3b'];

const ids = Object.keys(ENCOUNTERS).sort();
if (JSON.stringify(ids) !== JSON.stringify([...expectIds].sort())) {
  errors.push('遭遇 ID 集合变了：' + ids.join(', ') + '（测试固定为 12 条）');
}

const questions = new Map();
for (const [id, d] of Object.entries(ENCOUNTERS)) {
  const err = (m) => errors.push(`${id}: ${m}`);
  const warn = (m) => warns.push(`${id}: ${m}`);
  for (const key of ['name','title','question','explanation','successText','failureText']) {
    if (!String(d[key] ?? '').trim()) err(`字段 ${key} 为空`);
  }
  if (!Array.isArray(d.clues) || d.clues.length === 0) err('没有线索');
  else d.clues.forEach((c, i) => { if (!c?.id || !String(c.text ?? '').trim()) err(`线索 ${i + 1} 缺少 id 或文字`); });
  if (!Array.isArray(d.choices) || d.choices.length !== 3) err('选项必须正好 3 个');
  else {
    if (new Set(d.choices.map(c => c.id)).size !== 3) err('选项 id 有重复');
    if (d.choices.filter(c => c.id === d.correctChoiceId).length !== 1) err('正确选项不唯一');
    d.choices.forEach((c, i) => { if (!String(c.label ?? '').trim()) err(`选项 ${i + 1} 文案为空`); });
  }
  const q = String(d.question ?? '').trim();
  if (questions.has(q)) err(`题面与 ${questions.get(q)} 重复（12 条题面必须互不相同）`);
  else questions.set(q, id);

  const isBoss = d.type !== 'npc';
  if (isBoss) {
    if (!d.successText.includes('无需战斗')) err('Boss 的 successText 必须包含「无需战斗」四个字');
    if (d.bossId !== d.id) err('bossId 必须等于自身 id');
    if (JSON.stringify(d.penalty) !== '{}') err('Boss 的 penalty 必须是 {}');
    const want = d.tier === 'mini' ? { shards: 6 } : { shards: 4 };
    if (JSON.stringify(d.reward) !== JSON.stringify(want)) err('Boss reward 必须是 ' + JSON.stringify(want));
  } else {
    if ('bossId' in d) err('NPC 不应有 bossId');
    if (JSON.stringify(d.reward) !== JSON.stringify({ shards: 8, heal: 15 })) err('NPC reward 必须是 {"shards":8,"heal":15}');
    if (JSON.stringify(d.penalty) !== JSON.stringify({ slowMs: 8000 })) err('NPC penalty 必须是 {"slowMs":8000}');
  }

  const titleLen = len(d.name) + 3 + len(d.title);
  const clueLen = (d.clues ?? []).reduce((a, c) => a + len(c.text), 0) + Math.max(0, (d.clues.length - 1));
  if (titleLen > BUDGET.title) warn(`标题 ${titleLen} 字 > ${BUDGET.title}，会被裁`);
  if (clueLen > BUDGET.clueTotal) warn(`线索合计 ${clueLen} 字 > ${BUDGET.clueTotal}，第 4 行起会压到题面`);
  if (len(d.question) > BUDGET.question) warn(`题面 ${len(d.question)} 字 > ${BUDGET.question}，会压到第一个选项`);
  (d.choices ?? []).forEach((c, i) => { if (len(c.label) > BUDGET.option) warn(`选项 ${i + 1} ${len(c.label)} 字 > ${BUDGET.option}，会折行盖住下一项`); });
  for (const [key, label] of [['successText','答对'],['failureText','答错']]) {
    if (len(d[key]) > BUDGET.body) warn(`${label}正文 ${len(d[key])} 字 > ${BUDGET.body}，会压到解析行`);
  }
  if (len(d.explanation) > BUDGET.explanation) warn(`解析 ${len(d.explanation)} 字 > ${BUDGET.explanation}，会盖住继续按钮`);

  rows.push({ id, titleLen, clueLen, q: len(d.question), opt: Math.max(...(d.choices ?? []).map(c => len(c.label))), body: Math.max(len(d.successText), len(d.failureText)), exp: len(d.explanation) });
}

console.log('id            标题  线索  题面  选项  正文  解析   （预算：32/138/82/12/111/225）');
console.log('-'.repeat(64));
for (const r of rows) {
  const pad = (n, w) => String(n).padStart(w);
  console.log(r.id.padEnd(13) + pad(r.titleLen, 4) + pad(r.clueLen, 6) + pad(r.q, 6) + pad(r.opt, 6) + pad(r.body, 6) + pad(r.exp, 6));
}
console.log('-'.repeat(64));
if (warns.length) {
  console.log('\n容量告警（不阻断，但横屏会溢出）：');
  for (const w of warns) console.log('  ! ' + w);
} else {
  console.log('\n容量：全部在横屏预算内。');
}
if (errors.length) {
  console.log('\n硬错误（会让 npm test 挂）：');
  for (const e of errors) console.log('  x ' + e);
  process.exit(1);
}
console.log('硬约束：全部通过（题面唯一 / 无需战斗 / 3 选项 / 数值未变）。');
