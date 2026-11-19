// 敌人前摇统一红环（A5）：暗→亮那一帧记下 windupAt / windupDur，并向特效层推一颗地面预警环。
//
// windupDur 的唯一事实源是「暗→亮那一帧大脑里真实剩余的倒计时」，不是 §3 近战表 / §4 远程表的
// windupMs——前摇由各 behavior 自己的计时器驱动（beginCast/beginWindup 写 windupLeft、近战层写
// meleeLeft、phase/blink 写 pauseLeft、星屑骑士收势写在 cast 模式的 chargeLeft 里），两张表只是
// 事件层配置，和真实前摇经常不一致（腐尸近战 520 / 蹒跚 450、枷锁守卫近战 550 / 甩链 1000…）。
// 所以这里的断言一律是「环上写的时长 == 从起手到下一次攻击真正落地的实测时长」：
// 驱动真实大脑逐帧推进，用场景回调（近战/践踏/弹丸/召唤）抓出手帧，再和环比对。
// 早先「windupDur === 表值」那种断言是重言式——表值就是实现读的东西，错值永远测不出来。
import { describe, it, expect } from 'vitest';
import Enemy from '../src/entities/Enemy.js';
import { MELEE_RULES, RANGED_RULES, AI_PROFILE } from '../src/logic/enemy-ai.js';
import { C } from '../src/ui/Palette.js';

// ---------- 假 Graphics / Scene：只为让 Enemy 在没有 Phaser 的环境里跑 ----------
function fakeGraphics() {
  const g = {
    fillStyle: () => g, fillRect: () => g, fillPoints: () => g, lineStyle: () => g,
    strokePoints: () => g, clear: () => g, setDepth: () => g, setScrollFactor: () => g,
    setVisible: () => g, destroy: () => {},
  };
  return g;
}

function fakeScene() {
  const telegraphs = [];
  const attacks = [];
  const scene = {
    telegraphs,
    attacks,
    battleBounds: { left: 0, right: 4000, top: 0, bottom: 3000 },
    player: { x: 240, y: 135 },
    engine: { now: 0 },
    grid: { cells: [] },
    textures: { exists: () => false },
    anims: { exists: () => false },
    time: { now: 0 },
    effects: { telegraph: (x, y, dur, color, r) => telegraphs.push({ at: scene.engine.now, x, y, dur, color, r }) },
    add: {
      graphics: () => fakeGraphics(),
      text: () => ({ setOrigin() { return this; }, setDepth() { return this; }, setScrollFactor() { return this; }, setText() { return this; } }),
      sprite: () => null,
    },
    cameras: { main: { worldView: { x: 0, y: 0, width: 480, height: 270 } } },
  };
  // 出手事件：近战 / 践踏 / 弹丸 / 召唤，四种都算「这次前摇等的东西落地了」
  const stamp = () => attacks.push({ at: scene.engine.now });
  scene.onEnemyMelee = stamp;
  scene.onEnemyStomp = stamp;
  scene.addHostileShot = stamp;
  scene.addEnemySummon = stamp;
  return scene;
}

const makeEnemy = (defId) => {
  const scene = fakeScene();
  const enemy = new Enemy(scene, { id: defId, radius: 6, color: 0xe4dcc4 }, 240, 135, { x: 240, y: 135 }, 100, 10, 8, 1);
  return { scene, enemy };
};

// 逐帧推进，返回每一次「暗 → 亮」与「亮 → 暗」的时刻（构造期就已在前摇里的算 now=0 一次：
// 贴在玩家脸上刷出的怪，构造期就已经起手了）。
function drive(enemy, untilMs) {
  const scene = enemy.scene;
  const rises = [];
  const darks = [];
  let prev = enemy.windup === true;
  if (prev) rises.push(0);
  for (let now = 16; now <= untilMs; now += 16) {
    scene.engine.now = now;
    enemy.update(16, now);
    const cur = enemy.windup === true;
    if (cur && !prev) rises.push(now);
    if (!cur && prev) darks.push(now);
    prev = cur;
  }
  return { rises, darks };
}

// 核心口径：每一颗环写的时长，必须等于「从这颗环到下一次攻击真正落地」的实测时长
// （没有出手事件的纯姿态/冲锋前摇，则等于旗标熄灭的实测时长）。
// 攻击按「落地时刻离这颗环预告的时刻不超过一帧」归属——同一帧既有攻击落地又有新环起手时
// （枷锁守卫甩链出手的那一刻近战已经重新起手），那一击算上一颗环的，不算这一颗的。
// 被后面一颗更早开始的环顶掉的环跳过：它的倒计时已被作废，不该再为它背书。
// 容差一帧（16ms）：实测时长只能按帧取整，倒计时本身是连续值。
function expectRingsHonest(scene, rises, darks) {
  const rings = scene.telegraphs;
  for (const rise of rises) {
    expect(rings.some((g) => g.at === rise), `起手帧 ${rise} 没有推环`).toBe(true);
  }
  for (const ring of rings) {
    const expected = ring.at + ring.dur;
    const hit = scene.attacks.find((a) => Math.abs(a.at - expected) <= 16);
    if (hit) {
      expect(Math.abs(hit.at - ring.at - ring.dur), `环@${ring.at} 写 ${ring.dur}ms，实测 ${hit.at - ring.at}ms`).toBeLessThanOrEqual(16);
      continue;
    }
    // 没有出手事件落在预告时刻上：要么被后面的环顶掉，要么看旗标什么时候灭
    const limit = rings.filter((g) => g.at > ring.at).sort((a, b) => a.at - b.at)[0]?.at ?? Infinity;
    if (limit < expected) continue;   // 下一颗环在这颗预告落地之前就开始了，倒计时已作废
    const dark = darks.find((d) => d >= ring.at && d < limit);
    if (dark === undefined) continue;   // 观测窗口内没解析，不断言
    expect(Math.abs(dark - expected), `环@${ring.at} 写 ${ring.dur}ms，实测旗标 ${dark - ring.at}ms 熄灭`).toBeLessThanOrEqual(16);
  }
  return rings;
}

describe('前摇统一红环', () => {
  it('近战：环时长 = 起手到挥砍落地的实测时长，每次起手至少一颗血色环', () => {
    const { scene, enemy } = makeEnemy('skeleton');
    const { rises, darks } = drive(enemy, 8000);
    expect(rises.length).toBeGreaterThan(1);
    const rings = expectRingsHonest(scene, rises, darks);
    expect(rings[0]).toMatchObject({ at: 0, x: 240, y: 135, color: C.blood, r: 6 * 1.6 });
    expect(rings[0].dur).toBe(MELEE_RULES.skeleton.windupMs);   // 骷髅两表一致，顺带锁住参数形状
  });

  it('远程：环时长 = 起手到弹幕落地的实测时长', () => {
    const { scene, enemy } = makeEnemy('cultist');
    const { rises, darks } = drive(enemy, 8000);
    expect(rises.length).toBeGreaterThan(0);
    const rings = expectRingsHonest(scene, rises, darks);
    expect(rings.at(-1).dur).toBe(RANGED_RULES.cultist.windupMs);
  });

  // 这四个是审查里点出的「表值与真实前摇差得最多」的敌种：每一个都不止一种前摇，
  // 所以环时长必须随「这次起手的是哪一招」变化，而不是整个敌种一个常数。
  it('corpse / shackle_guard / stardust_knight / slag_beast：环时长随招式而变，且都等于实测', () => {
    for (const defId of ['corpse', 'shackle_guard', 'stardust_knight', 'slag_beast']) {
      const { scene, enemy } = makeEnemy(defId);
      const { rises, darks } = drive(enemy, 20000);
      expect(rises.length, defId).toBeGreaterThan(2);
      const rings = expectRingsHonest(scene, rises, darks);
      const durs = new Set(rings.map((g) => g.dur));
      expect(durs.size, `${defId} 只观测到一种环时长 ${[...durs]}`).toBeGreaterThan(1);
      expect([...durs].every((d) => d > 0), defId).toBe(true);
    }
  });

  // Important-2：一锤定音的怪也有前摇，只是 §3/§4 两张表里没有它们的 windupMs。
  // 改读大脑剩余量之后它们照样开环，时长同样对得上实测。
  it('knight / stone_gargoyle / brass_warden / index_hound / anvil_tyrant 也开环', () => {
    for (const defId of ['knight', 'stone_gargoyle', 'brass_warden', 'index_hound', 'anvil_tyrant']) {
      expect(MELEE_RULES[defId], defId).toBeUndefined();
      expect(RANGED_RULES[defId], defId).toBeUndefined();
      const { scene, enemy } = makeEnemy(defId);
      const { rises, darks } = drive(enemy, 12000);
      expect(rises.length, defId).toBeGreaterThan(0);   // 这些怪确实会抬手
      const rings = expectRingsHonest(scene, rises, darks);
      expect(rings.length, defId).toBeGreaterThan(0);
      for (const g of rings) expect(g.dur, defId).toBeGreaterThan(0);
      // 记录下来的状态和最后一颗环对齐
      expect(enemy.windupAt, defId).toBe(rings.at(-1).at);
      expect(enemy.windupDur, defId).toBe(rings.at(-1).dur);
    }
  });

  it('从不起手的敌种也保持 0（缝合尸魁只践踏不抬手）', () => {
    const { scene, enemy } = makeEnemy('stitch_abomination');
    const { rises } = drive(enemy, 8000);
    expect(rises).toHaveLength(0);
    expect(enemy.windupDur).toBe(0);
    expect(scene.telegraphs).toHaveLength(0);
  });

  it('26 个 defId 全覆盖：会抬手的都开环，环时长全部等于实测', () => {
    for (const defId of Object.keys(AI_PROFILE)) {
      const { scene, enemy } = makeEnemy(defId);
      const { rises, darks } = drive(enemy, 16000);
      if (rises.length === 0) {
        // 从不起手：一个环都不该有（缝合尸魁）
        expect(scene.telegraphs, defId).toHaveLength(0);
        expect(enemy.windupDur, defId).toBe(0);
        continue;
      }
      expect(scene.telegraphs.length, defId).toBeGreaterThanOrEqual(rises.length);
      expectRingsHonest(scene, rises, darks);
      for (const g of scene.telegraphs) {
        expect(g.dur, defId).toBeGreaterThan(0);
        expect(g.color, defId).toBe(C.blood);
        expect(g.r, defId).toBe(6 * 1.6);
      }
    }
  });

  // 兜底：大脑四个计时字段一个都不存在的手写替身，才落回 §3/§4 表值。
  it('大脑没有计时字段时落回表值（兜底）', () => {
    const { scene, enemy } = makeEnemy('skeleton');
    scene.telegraphs.length = 0;   // 构造期那颗不算，单独验兜底
    enemy.brain = { defId: 'skeleton', mode: 'walk' };
    enemy.windup = false;
    enemy.applyResult({ x: enemy.x, y: enemy.y, windup: true }, 16, 1000);
    expect(enemy.windupDur).toBe(MELEE_RULES.skeleton.windupMs);
    expect(scene.telegraphs).toHaveLength(1);
    expect(scene.telegraphs[0].dur).toBe(MELEE_RULES.skeleton.windupMs);
  });

  // 前摇中途倒计时被重新武装成更长的值时要补环：枷锁守卫的近战抬手（550ms）会被
  // behavior 自己的甩链抬手（1000ms）取消替换，只认起手帧的话玩家拿着 550ms 躲 1000ms 的招。
  it('前摇中途倒计时变长要补一颗更长的环', () => {
    const { scene, enemy } = makeEnemy('shackle_guard');
    drive(enemy, 20000);
    const rings = scene.telegraphs;
    const superseded = rings.filter((g, i) => i + 1 < rings.length && rings[i + 1].at - g.at < g.dur);
    expect(superseded.length, '没有任何一颗环被更长的倒计时顶掉').toBeGreaterThan(0);
    for (const g of superseded) {
      const next = rings[rings.indexOf(g) + 1];
      expect(next.dur, '补环必须更长').toBeGreaterThan(g.dur);
    }
  });
});
