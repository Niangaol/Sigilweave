// 编队模板表（战斗深度 Wave C1：成群刷怪）。
// 纯数据 + 两个查询函数：零 Phaser、零 DOM、零 Math.random，整表深冻，
// 避免运行期被误改后「同一 seed 不同结果」——刷怪可复现是本项目的验收底线。
//
// 为什么 defIds 做成「池」而不是写死一只怪：
// 同一模板要跨幕复用，而每幕敌种池不同（roster.js 的 CHAPTER_ENEMY_WEIGHTS），
// 写死怪种会让模板换幕后立刻失效；做成池交给 rollFormation 按幕抽签，
// 整个池在本幕都抽不到就整轮降级成单点刷怪（spec §5.2），绝不硬塞本幕没有的怪。
import { CHAPTER_ENEMY_WEIGHTS } from './roster.js';

// 前排光环（spec §5.3）：只要同编队还有前排活着，其余成员 +15% 护甲、×0.9 速度。
// 取统一值而不是每队一套：这是「盾墙/夹击类编队」的共用规则，拆开配只会让
// C4 的生效判断多一堆分支，而玩家侧感知不到差别。
const VANGUARD_AURA = Object.freeze({ armorBonus: 0.15, speedMul: 0.9 });

// 模板顺序即加权抽样的兜底顺序，按「跨幕可编成率」降序排：
// 低 rng 落点更容易命中真能编成的队，高 rng 落点才轮到只在特定幕成立的队
// （蝠群锁一~三幕、钳形/混编的控制位在五幕没有候选，抽中就整轮降级）。
// 这是可陈述的排序原则，不是随手写的数组顺序。
export const FORMATIONS = Object.freeze([
  // 骚扰：三冲刺/蝠群怪贴脸 + 两远程压血。二幕起全程可编，是最稳的保底队。
  Object.freeze({
    id: 'harass',
    name: '骚扰',
    minChapter: 2,
    weight: 4,
    roles: Object.freeze([
      Object.freeze({
        path: 'swarm',
        defIds: Object.freeze(['bat', 'ember_imp', 'rune_spider', 'wraith']),
        count: 3,
      }),
      Object.freeze({
        path: 'ranged',
        defIds: Object.freeze(['crystal_dryad', 'verdict_wraith', 'void_elemental', 'dawn_shade']),
        count: 2,
      }),
    ]),
  }),
  // 远程阵地：一台前排肉盾顶线 + 三远程集火。有前排所以带光环。
  Object.freeze({
    id: 'siege',
    name: '远程阵地',
    minChapter: 2,
    weight: 3,
    roles: Object.freeze([
      Object.freeze({
        path: 'vanguard',
        defIds: Object.freeze(['page_golem', 'stone_gargoyle']),
        count: 1,
      }),
      Object.freeze({
        path: 'ranged',
        defIds: Object.freeze(['crystal_dryad', 'verdict_wraith', 'void_elemental']),
        count: 3,
      }),
    ]),
    aura: VANGUARD_AURA,
  }),
  // 重压：一只精英重甲带队 + 两只小怪填屏。精英池三幕起才齐全，故定二幕（二幕有缝合尸魁）。
  Object.freeze({
    id: 'brute',
    name: '重压',
    minChapter: 2,
    weight: 3,
    roles: Object.freeze([
      Object.freeze({
        path: 'elite',
        defIds: Object.freeze(['brass_warden', 'anvil_tyrant', 'stitch_abomination']),
        count: 1,
      }),
      Object.freeze({
        path: 'swarm',
        defIds: Object.freeze(['skeleton', 'corpse', 'ink_wisp', 'ember_imp']),
        count: 2,
      }),
    ]),
  }),
  // 盾墙推进（spec §5.1 示例，两值原样保留）：黄铜守誓者/纸页傀儡顶线，两远程后排输出。
  // 远程池补一个虚空符灵：否则五幕（只有它 + 晓色之影）编不成这个队。
  Object.freeze({
    id: 'shield_wall',
    name: '盾墙推进',
    minChapter: 3,
    weight: 3,
    roles: Object.freeze([
      Object.freeze({
        path: 'vanguard',
        defIds: Object.freeze(['page_golem', 'brass_warden']),
        count: 1,
      }),
      Object.freeze({
        path: 'ranged',
        defIds: Object.freeze(['crystal_dryad', 'verdict_wraith', 'void_elemental']),
        count: 2,
      }),
    ]),
    aura: VANGUARD_AURA,
  }),
  // 双法：两名施法精英（闪烁/星环都需要读条，聚在一起才有「法阵」感）+ 两只小怪护法。
  Object.freeze({
    id: 'casters',
    name: '双法',
    minChapter: 3,
    weight: 2,
    roles: Object.freeze([
      Object.freeze({
        path: 'elite',
        defIds: Object.freeze(['oath_bishop', 'eclipse_priest']),
        count: 2,
      }),
      Object.freeze({
        path: 'swarm',
        defIds: Object.freeze(['skeleton', 'bat', 'ink_wisp', 'ember_imp']),
        count: 2,
      }),
    ]),
  }),
  // 钳形夹击：两只冲锋怪从两侧切入 + 一个控场位断后路。控制池只有邪教徒/枷锁守卫
  // 两种真·控制行为（orbit / chain），五幕没有这类敌种，抽中即整轮降级。
  Object.freeze({
    id: 'pincer',
    name: '钳形夹击',
    minChapter: 3,
    weight: 3,
    roles: Object.freeze([
      Object.freeze({
        path: 'vanguard',
        defIds: Object.freeze(['knight', 'stardust_knight']),
        count: 2,
      }),
      Object.freeze({
        path: 'control',
        defIds: Object.freeze(['cultist', 'shackle_guard']),
        count: 1,
      }),
    ]),
    aura: VANGUARD_AURA,
  }),
  // 混编：四种职能各一只，只在后段出场——它是「什么都有一点」的对照组，
  // 太早出现会让前面几个特色编队的辨识度变糊。
  Object.freeze({
    id: 'mixed',
    name: '混编',
    minChapter: 4,
    weight: 2,
    roles: Object.freeze([
      Object.freeze({
        path: 'vanguard',
        defIds: Object.freeze(['page_golem', 'stone_gargoyle']),
        count: 1,
      }),
      Object.freeze({
        path: 'ranged',
        defIds: Object.freeze(['crystal_dryad', 'verdict_wraith', 'void_elemental']),
        count: 1,
      }),
      Object.freeze({
        path: 'control',
        defIds: Object.freeze(['cultist', 'shackle_guard']),
        count: 1,
      }),
      Object.freeze({
        path: 'swarm',
        defIds: Object.freeze(['skeleton', 'bat', 'ink_wisp', 'ember_imp']),
        count: 1,
      }),
    ]),
    aura: VANGUARD_AURA,
  }),
  // 蝠群：五只蝠 + 一只符纹蛛，第一幕的「怪海」启蒙队。物种锁死一~三幕，
  // 四幕起墨灵/火星精替代不了蝠的手感，直接降级也不硬塞。
  Object.freeze({
    id: 'swarm',
    name: '蝠群',
    minChapter: 1,
    weight: 4,
    roles: Object.freeze([
      Object.freeze({ path: 'swarm', defIds: Object.freeze(['bat']), count: 5 }),
      Object.freeze({ path: 'swarm', defIds: Object.freeze(['rune_spider']), count: 1 }),
    ]),
  }),
]);

// 按幕取可用模板。幕号只认 roster.js 里真实存在的键（1..5）：越界幕号返回空表，
// 让调用方走「降级单点刷怪」，而不是把五幕的怪塞进一个不存在的幕里。
// 这里不做「本幕抽不抽得到」的判断——那是 rollFormation 的职责（它要读敌种池）。
export function formationsFor(chapter) {
  if (!Number.isInteger(chapter) || !Object.hasOwn(CHAPTER_ENEMY_WEIGHTS, chapter)) return [];
  return FORMATIONS.filter((f) => f.minChapter <= chapter);
}

// 取编队光环；入参非法或光环数值不完整时返回 null。
// 两个数值都要求有限数：C4 会拿它们直接做乘算，缺一个就是 NaN 光环，
// 那种「静默变默认值」的怪比没有光环更难查。
// 注意这里只校验数值，**不看 roles**：没有 vanguard 角色的队（harass / swarm）也照样返回光环，
// 「没有前排就没有加成」是 C4 每帧扫成员时判的（没有存活前排 → 谁都不拿）。
// 别把不变量写在这里：模板层拿不到「场上还有没有前排活着」这个信息。
export function formationAuraOf(formation) {
  if (!formation || typeof formation !== 'object') return null;
  const aura = formation.aura;
  if (!aura || typeof aura !== 'object') return null;
  if (!Number.isFinite(aura.armorBonus) || !Number.isFinite(aura.speedMul)) return null;
  return aura;
}
