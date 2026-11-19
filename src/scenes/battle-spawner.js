// 刷怪：波次节拍、编队波、普通波、单只合成与落点。
// 从 BattleScene 迁出（2026-11-19 架构重构波 3）。场景方法保留同名一行委托。
// RNG 顺序是契约：类型 roll → 变体 roll → 波后间隔抖动；编队波指定 defId 时少一次类型 roll。
import { difficultyAt, DIFFICULTY, ENEMY_TYPES, pickEnemyType } from '../data/roster.js';
import { enemySpawnLoad, pickWavePoints, pickSpawnPoint, rollFormation } from '../logic/spawn.js';
import { pickEnemyVariant, composeEnemyDef } from '../data/enemy-variants.js';
import { levelStats } from '../logic/progression.js';
import { fireGuide } from '../logic/guide.js';
import Enemy from '../entities/Enemy.js';

export function updateSpawner(scene, dt) {
  if (scene.bossStarted) return;
  scene.spawnTimer -= dt;
  if (scene.spawnTimer > 0) return;
  const dif = difficultyAt(scene.engine.now, scene.stage);
  const warming = scene.engine.now < scene.warmupMs;
  // 槽位预算：变体 cost 2 的怪顶两只，所以 room 按 enemySpawnLoad 而不是只数算
  const room = dif.maxAlive - enemySpawnLoad(scene.enemies);
  if (room <= 0) {
    // 满场：短暂停手等击杀腾位，避免每帧空转。
    // 这一支是提前 return：本轮不刷，编队轮次也不消耗——waveIndex 只在真正
    // spawn 出怪之后才 +1，否则满场期会把轮次空烧掉，腾位那一刻刷的就不是编队。
    scene.spawnTimer = 160;
    return;
  }
  let spawned = 0;
  // 每 formationEvery 波试一次编队（spec §5.2）。waveIndex 从 0 起算，
  // 所以第一波必是普通波：开场先让玩家看到杂兵，别一上来就是队形。
  if (scene.waveIndex > 0 && scene.waveIndex % DIFFICULTY.formationEvery === 0) {
    spawned = scene.spawnFormation(dif);
  }
  if (spawned === 0) {
    const wave = warming ? 1 : Math.max(1, Math.min(dif.wave ?? 1, room));
    spawned = scene.spawnWave(dif, wave);
  }
  // 只有真的刷出怪才推进轮次：满场早退（上面那个 return）一只没刷，不推进；
  // 编队没编成时降级成的普通波也是真刷了怪的一轮，照常推进——
  // 这样「每 3 轮一次编队」的节拍始终稳定，不会因为某幕编队常年抽不到
  // 就变成「每轮都试一次编队再降级」，把普通波的兵种多样性挤掉。
  if (spawned > 0) scene.waveIndex++;
  const jitter = 0.85 + scene.combatRng.next() * 0.3;
  scene.spawnTimer = Math.max(150, dif.spawnMs * jitter * (warming ? 2.2 : 1));
}


export function spawnFormation(scene, dif) {
  const roll = rollFormation({
    chapter: scene.chapter,
    load: enemySpawnLoad(scene.enemies),
    maxAlive: dif.maxAlive,
    rng: () => scene.combatRng.next(),
  });
  if (!roll) return 0;
  // 这一批的实例 id：分组（谁给谁加成）用 uid，取数值/取色相仍用模板 id。
  // 不这么拆的话，同模板两批同屏时 A 队前排已死、B 队前排还活着，
  // A 队后排仍会被加成——「打掉前排光环就散」在正常节奏下不成立。
  const formationUid = `${roll.formation.id}#${++scene.formationSeq}`;
  // 扇区取「玩家反方向」：整队从一个方向压过来，队形才读得出来。
  // Player 只有 facing（±1）没有速度矢量，所以按朝向取反当扇区中心；
  // spread 1.2 = spec 的 ±0.6rad（扇区公式里 spread 是全宽）。
  const sectorAngle = (scene.player?.facing ?? 1) < 0 ? 0 : Math.PI;
  const sectorSpread = 1.2;
  let spawned = 0;
  for (const pick of roll.picks) {
    const points = pickWavePoints({
      rng: () => scene.combatRng.next(),
      player: scene.player,
      world: scene.world,
      enemies: scene.enemies,
      count: pick.count,
      sectorAngle, sectorSpread,
      minDist: 275, maxDist: 380, minGap: 30,
      nearDist: 250, farDist: 430,
    });
    for (const point of points) {
      // 槽位预算与普通波同一套：已落地 ≥1 只后超载就收手，
      // 但已经落地的成员留着——半支编队比整轮回滚更自然。
      if (spawned > 0 && enemySpawnLoad(scene.enemies) >= dif.maxAlive) return spawned;
      scene.spawnEnemy(dif, point, {
        defId: pick.defId,
        formationId: roll.formation.id,
        formationUid,
        formationPath: pick.path,
      });
      spawned++;
    }
  }
  return spawned;
}


export function spawnWave(scene, dif, count) {
  const points = pickWavePoints({
    rng: () => scene.combatRng.next(),
    player: scene.player,
    world: scene.world,
    enemies: scene.enemies,
    count,
    minDist: 275, maxDist: 380, minGap: 30,
    nearDist: 250, farDist: 430,
  });
  let spawned = 0;
  for (const point of points) {
    // 槽位预算：变体 cost 2（持盾/精英/天生精英）时一波可能只塞得下 1 只。
    // 已刷出 ≥1 只后超载就 break；一只都还没刷时仍落第一只，避免整波空转。
    if (spawned > 0 && enemySpawnLoad(scene.enemies) >= dif.maxAlive) break;
    scene.spawnEnemy(dif, point);
    spawned++;
  }
  return spawned;
}


export function spawnEnemy(scene, dif, point = null, opts = {}) {
  // 幸存者式：以玩家为中心、屏幕外环形生成；压测等调用方可直接传 dif 不传落点。
  const { x, y } = point ?? pickSpawnPoint({
    rng: () => scene.combatRng.next(),
    player: scene.player,
    world: scene.world,
    enemies: scene.enemies,
    minDist: 275, maxDist: 380, minGap: 30,
    nearDist: 250, farDist: 430,
  });

  // 按幕权重抽敌人类型，再按幕权重叠一层变体；天生精英（def.elite）不再叠变体。
  // RNG 顺序固定：类型 roll → 变体 roll，同一 seed 的刷怪序列可复现。
  // 编队波由 opts.defId 指定怪种（rollFormation 已按幕过滤过），此时不抽类型，
  // 变体照抽——所以编队波比普通波少一次 rng 调用，这是编队波固有的消耗差异。
  const base = opts.defId && ENEMY_TYPES[opts.defId]
    ? ENEMY_TYPES[opts.defId]
    : pickEnemyType(scene.chapter, scene.combatRng.next());
  const variant = base.elite ? null : pickEnemyVariant(scene.chapter, base, scene.combatRng.next());
  const def = composeEnemyDef(base, variant);
  // 属性 = 难度基准 × 等级成长 × 敌种/变体倍率
  // 新手引导 G10：第三幕首次刷出精英「咒誓主教」时给一条战斗内短提示
  if (scene.chapter === 3 && def?.id === 'oath_bishop') {
    fireGuide(scene, scene.run, 'G10', { highlight: '敌人' });
  }
  // 新手引导 G13：第一次刷出带变体的敌人（迅捷/重甲/精英），讲清边色与重甲盾
  if (variant) fireGuide(scene, scene.run, 'G13', { highlight: '敌人' });
  const lv = levelStats(scene.run.progression.level);
  const enemy = new Enemy(
    scene,
    def,
    x, y,
    { x: scene.player.x, y: scene.player.y }, // 出生瞬间锁定，之后直线推进
    Math.max(1, Math.round(dif.hp * (def.hpMul ?? 1) * lv.hpMul)),
    dif.speed * (def.speedMul ?? 1) * lv.speedMul,
    Math.round((def.damage ?? dif.damage) * lv.damageMul),
    scene.enemySeq++,
  );
  scene.enemies.push(enemy);
  // 编队成员打标（spec §5.2）：C4 的光环判定（前排活着 → 同队加甲减速）按编队分组。
  // formationPath 记的职能决定「谁算前排」——没有这个标记，updateEnemies 只能靠 defId 反查
  // 编队模板，而同一个 defId 在不同编队里可能站在不同职能上（例如 page_golem 既做 vanguard
  // 也出现在 elite 池），反查会串队。随成员一起落库，一次写入、之后只读。
  // formationId 是模板（数值/色相），formationUid 是这一批（分组）：
  // 同模板的两批是两支独立的队，A 队前排死了不该给 B 队后排加成。
  if (opts.formationId) enemy.formationId = opts.formationId;
  if (opts.formationId) enemy.formationUid = opts.formationUid ?? opts.formationId;
  if (opts.formationId && opts.formationPath) enemy.formationPath = opts.formationPath;
  // 新手引导 G19（spec §6.4）：第一次出现带三角标记的怪时讲清「脚下一伙的会互相加成」。
  // 放在打标之后、返回之前：只有真的成为编队成员才会触发，普通波（无 formationId）不会误报。
  // 用 oncePerRun 去重，整局只出现一次——玩家看懂标记后不需要再听第二遍。
  if (opts.formationId) fireGuide(scene, scene.run, 'G19', { highlight: '敌人' });
  return enemy;
}

