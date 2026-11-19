// 场次流转：通幕、幕内换场、Boss 收据与战利品、通幕演出、死亡与结算数据。
// 从 BattleScene 迁出（2026-11-19 架构重构波 3）。场景方法保留同名一行委托。
import { nextStage, firstStageOf, isValidStage, chapterOf } from '../logic/acts.js';
import { recordAct } from '../logic/run.js';
import { clearRun } from '../logic/save.js';
import { snapshotBuild } from '../logic/build.js';
import { playCutscene, cutscenesDisabled } from '../ui/transition.js';
import { WORLD_SIZES, ACTS } from '../logic/constants.js';
import { getEventPoints } from '../data/map-events.js';
import { STAGE_CARDS } from '../data/cinematics.js';
import { C, HEX } from '../ui/Palette.js';
import { shakeCamera } from '../ui/camera-shake.js';
import { followBaseY } from '../ui/battle-camera.js';
import { resolveBossOnce } from '../logic/boss.js';
import { stageSpellCard, stageAdvanceDecision } from './battle-pure.js';
import { cardKeyOf } from '../logic/workshop.js';
import { rollVariant } from '../data/variants.js';
import { COMPASS_BUFFS, rollBuffWeighted } from '../logic/progression.js';
import { metaLevel, applyPassiveToCompass, metaPassiveLabel } from '../logic/meta.js';
import { rebuildDerived } from '../logic/grid.js';
import { appendPassive, countPassives } from '../ui/passive-summary.js';
import { sfx } from '../audio/Sfx.js';

export function finishStage(scene) {
  if (scene.phase !== 'bossDefeated' || !scene.bossDefeated) return;
  if (scene.stageOutcome === 'swap') { scene.swapStage(nextStage(scene.stage)); return; }
  scene.phase = 'intermission'; scene.paused = true; scene.engine.paused = true;
  const report = { ...scene.engine.summary(scene.engine.now), elapsedMs: scene.engine.now, kills: scene.kills, peakRate: scene.peakRate };
  recordAct(scene.run, report);
  scene.run.shards = scene.shardCount;
  scene.run.draft = snapshotBuild(scene.grid, { act: scene.chapter });
  if (scene.stageOutcome !== 'victory') {
    // 通幕：幕号 +1，落回该幕第一场；先播「契约解除」标题卡与本幕数据，再落到幕间工作台。
    const clearedChapter = scene.chapter;
    const clearedStage = scene.stage;
    scene.chapter = Math.min(5, scene.chapter + 1);
    scene.stage = firstStageOf(scene.chapter);
  scene.run.chapter = scene.chapter;
  scene.run.stage = scene.stage;
  scene.stageOutcome = 'none';
  // 进入新的一幕/新场：落盘当前游标，供「继续冒险」从此处读档。
  scene.saveProgress();
  // 通幕卡按「刚打完的那一幕」出卡：stage 显式传刚清空的场（合并幕=后半场），
    // payload.run 已指向下一幕第一场，供幕间工作台使用。
    playCutscene(scene, {
      kind: 'clear', act: clearedChapter, stage: clearedStage, report, to: 'IntermissionScene',
      payload: { run: scene.run, report, __cine: true },
    });
  } else {
    const totals = scene.run.reports.reduce((out, report) => ({
      elapsedMs: out.elapsedMs + report.elapsedMs,
      kills: out.kills + report.kills,
      triggers: out.triggers + report.triggers,
      combos: out.combos + report.combos,
      blocked: out.blocked + report.blocked,
      peakRate: Math.max(out.peakRate, report.peakRate),
    }), { elapsedMs: 0, kills: 0, triggers: 0, combos: 0, blocked: 0, peakRate: 0 });
    // 通关：本局已结束，清除断点存档，避免标题页还提示续玩一个已通关的局。
    clearRun();
    // 终局：三道契约环碎裂 → 结局演出（StoryScene ending）→ 胜利结算。
    // ?cine=0 / ?stress=1 时不播结局直达面板，保持调试契约（playCutscene 兜底会把结局照播）。
    const victoryPayload = { ...scene.buildSummary(), ...totals, victory: true, bossResolutions: structuredClone(scene.run.bossResolutions), __cine: true };
    if (cutscenesDisabled()) {
      const fallback = { ...victoryPayload };
      delete fallback.__cine;
      scene.scene.start('GameOverScene', fallback);
      return;
    }
    playCutscene(scene, {
      kind: 'victory', act: scene.chapter, stage: scene.stage, report: totals, to: 'StoryScene',
      payload: { mode: 'ending', stats: victoryPayload, __cine: true },
    });
  }
}

// 幕内换场：同一幕的下一场，不切场景、不弹工作台，只在原地重建世界层。
// 保留：构筑/手牌/碎晶/击杀数/引擎时间/成长/血量；重置：敌人/弹幕/宝箱/事件点/刷怪节奏。

export function swapStage(scene, next) {
  if (!isValidStage(next) || next === scene.stage) return;
  scene.stage = next;
  scene.run.stage = next;
  scene.chapter = chapterOf(next);
  scene.run.chapter = scene.chapter;
  scene.stageOutcome = 'none';
  // 换场即换关：技能库清零，冷却复位，下一场只看本场发放了什么道具。
  scene.run.skillLibrary = [];
  scene.run.skillStage = next;
  scene.skillCooldowns = [0, 0, 0];
  scene.saveProgress();
  const world = WORLD_SIZES[next] ?? WORLD_SIZES[1];
  scene.world = { w: world.w, h: world.h };
  scene.worldBounds = { left: 24, top: 40, right: world.w - 24, bottom: world.h - 24 };
  scene.battleBounds = scene.worldBounds;
  scene.background.setAct(next);
  scene.cameras.main.setBounds(0, 0, world.w, world.h);
  // 清场：旧场的敌人、弹幕、宝箱全部回收；经验粒子先结算，避免「差一点没捡到」。
  scene.flushExpMotes();
  for (const enemy of scene.enemies) enemy.destroy();
  scene.enemies = [];
  scene.boss = null;
  scene.bossStarted = false;
  scene.bossDefeated = false;
  scene.releaseProjectiles();
  scene.hostileShots = []; scene.hostileG.clear();
  scene.summons = []; scene.summonG?.clear(); scene.summonAirG?.clear();
  for (const chest of scene.chests) chest.g?.destroy();
  scene.chests = [];
  // 新场中心落位 + 事件点按新场重建（旧场已完成点仍记在 run.completedEvents）
  scene.player.x = world.w / 2;
  scene.player.y = world.h / 2;
  scene.player.moving = false;
  scene.player.draw(scene.engine.now);
  scene.cameras.main.startFollow(scene.player, true, 0.12, 0.12);
  scene.cameras.main.setDeadzone(60, 40);
  scene.cameras.main.setFollowOffset(0, followBaseY());
  scene.eventPoints = getEventPoints(next, scene.world).map(p => ({ ...p, done: !!scene.run.completedEvents[p.id], icon: null, label: null }));
  // 刷怪节奏轻启，但引擎时间/等级/构筑全部延续（密度按新的幕生效）。
  scene.spawnTimer = 700;
  scene.warmupMs = 1400;
  scene.timeExpTimer = 0;
  scene.lastKillAt = scene.engine.now - 9999;
  scene.killStreak = 0;
  // 场次卡：1.6 秒原地停留，期间战斗冻结
  const card = STAGE_CARDS[next];
  scene.phase = 'stageIntro'; scene.paused = true; scene.engine.paused = true;
  scene.input.keyboard.resetKeys();
  scene.stageIntroLeft = 1600;
  sfx.bossRoar();
  scene.cameras.main.flash(180, 255, 246, 224);
  scene.effects.text(240, 90, card ? card.numeral + ' · ' + card.title : '第 ' + next + ' 场', 12, HEX.brassLight, true);
  scene.effects.text(240, 110, card ? card.star + ' 位 · 第 ' + scene.chapter + ' 幕' : '', 9, HEX.brass, true);
  scene.effects.text(240, 126, '新的场地已经展开', 8, HEX.mute, true);
}


export function defeatBoss(scene, method, bossId, tier = 'major') {
  const receipt = resolveBossOnce(scene.run, scene.stage, bossId, method, tier);
  if (!receipt.ok) return;
  scene.shardCount += receipt.reward; scene.kills++;
  // Boss 战利品：问答定义给出法术卡进手牌 + 随机一个罗盘本体增益。
  // 这张卡只进手牌，不自动进技能库——技能库严格来自升级三选一玩家自己选的卡。
  const spellDefId = stageSpellCard(scene.stage);
  const spellKey = cardKeyOf({ kind: 'sigil', defId: spellDefId, variant: rollVariant(scene.combatRng, spellDefId) });
  scene.run.hand[spellKey] = (scene.run.hand[spellKey] ?? 0) + 1;
  const buff = rollBuffWeighted(COMPASS_BUFFS, () => scene.combatRng.next(), scene.run.kitAffinity);
  if (buff) {
    const level = metaLevel(scene.metaSave, buff.id);
    const desc = applyPassiveToCompass(buff, scene.run.compassBuffs, level);
    scene.engine.comboWindowMul = scene.run.compassBuffs.comboWindowMul;
    if (scene.engine.combos) scene.engine.combos.windowMul = scene.engine.comboWindowMul;
    rebuildDerived(scene.grid, ACTS[scene.chapter - 1].baseIntervalMs * scene.run.compassBuffs.intervalMul, { cooldownMul: scene.run.compassBuffs.cooldownMul });
    appendPassive(scene.run.passiveLog, 'compass', buff, level, desc);
    scene.passiveCounts = countPassives(scene.run.passiveLog);
    scene.effects.text(240, 96, '罗盘增益 · ' + buff.name + metaPassiveLabel(level) + '：' + desc, HEX.teal, true);
  }
  scene.cameras.main.flash(140, 255, 246, 224);
  sfx.bossShatter();
  if (tier !== 'mini') {
    scene.bossDefeated = true;
    // 本场大 Boss 已清空：合并幕前半场换场，单场幕/末场通幕，第七场通关。
    scene.stageOutcome = stageAdvanceDecision({ stage: scene.stage, majorCleared: true });
  }
  scene.bossStarted = false; // 复位：小Boss解决后，大Boss等级触发仍可生效
  scene.hostileShots = []; scene.hostileG.clear();
  scene.summons = []; scene.summonG?.clear(); scene.summonAirG?.clear();
  if (scene.boss) {
    const x = scene.boss.x, y = scene.boss.y;
    scene.boss.alive = false; scene.boss.rewarded = true; scene.boss.destroy();
    scene.effects.burst(x, y, C.arcane, 20);
    sfx.bossDown();
    scene.enemies = scene.enemies.filter(e => e !== scene.boss);
  }
  // 小 Boss 打完不经过通幕，镜头立刻回到常规取景；大 Boss 由 startBossClearTransition 复位。
  if (tier === 'mini') { scene.bossCamOffset = 0; scene.resumeFollow(); }
}


export function startBossClearTransition(scene) {
  if (scene.phase === 'bossDefeated' || scene.phase === 'intermission') return;
  scene.phase = 'bossDefeated'; scene.paused = true; scene.engine.paused = true; scene.transitionLeft = 800;
  // 还在飞的经验粒子立刻结算：过场里不该出现「差一点没捡到」的损失
  scene.flushExpMotes();
  scene.bossCamOffset = 0;
  scene.resumeFollow();
  scene.hostileShots = []; scene.hostileG.clear();
  scene.summons = []; scene.summonG?.clear(); scene.summonAirG?.clear();
  for (const enemy of scene.enemies) enemy.destroy(); scene.enemies = [];
  scene.releaseProjectiles();
  // 通幕瞬间的余韵：白闪 + 杖尖余波，再交给过场接住
  scene.cameras.main.flash(160, 255, 246, 224);
  shakeCamera(scene, 'major', 120, 0.003);
  scene.effects.burst(scene.player.x, scene.player.y, C.arcaneLight, 24);
  scene.effects.text(240, 115, '契约解除 · Boss 已击败', HEX.arcaneLight, true);
}


export function checkDeath(scene) {
  if (scene.phase === 'play' && !scene.player.alive) scene.die();
}


export function die(scene) {
  if (scene.phase !== 'play') return;
  scene.phase = 'dying';
  // 死亡：本局结束，清除断点存档；再战从第一幕重来。
  clearRun();
  scene.paused = true;
  scene.engine.paused = true;
  // 玩家死亡：清空敌方弹幕与召唤物（炮台/符文不再继续打）
  scene.hostileShots = []; scene.hostileG?.clear();
  scene.summons = []; scene.summonG?.clear(); scene.summonAirG?.clear();
  scene.pauseMenu.hide();
  scene.board.setDetailVisible(false);
  scene.pauseHint.setVisible(false);
  scene.hint.setVisible(false);
  scene.player.draw(scene.engine.now); // 让玩家绘制成倒地状态
  scene.effects.deathBurst(scene.player.x, scene.player.y);
  shakeCamera(scene, 'major', 240, 0.006);
  const summary = scene.buildSummary();
  scene.time.delayedCall(1000, () => {
    // 死亡：先演魂火熄灭，再揭开结算页；合计约 2.1 秒，仍可按键跳过
    if (scene.phase === 'dying') playCutscene(scene, { kind: 'death', act: scene.chapter, stage: scene.stage, to: 'GameOverScene', payload: { ...summary, __cine: true }, report: summary });
  });
}


export function buildSummary(scene) {
  const s = scene.engine.summary(scene.engine.now);
  return {
    elapsedMs: scene.engine.now,
    chapter: scene.chapter,
    stage: scene.stage,
    hp: 0,
    kills: scene.kills,
    shards: scene.shardCount,
    triggers: s.triggers,
    triggersPerSec: s.triggersPerSec,
    combos: s.combos,
    blocked: s.blocked,
    reroutes: s.reroutes,
    dissipations: s.dissipations,
    peakRate: scene.peakRate,
    cells: scene.grid.unlockedIds().length,
    // 结算给局外成长用：首杀/问答击破的原始凭据。
    bossResolutions: structuredClone(scene.run.bossResolutions ?? {}),
    miniBossResolutions: structuredClone(scene.run.miniBossResolutions ?? {}),
    quick: scene.quickMode,
  };
}

// 压测：真实实体类堆到 150 敌 / 300 弹丸 / 200 碎片，采样 20 秒帧时间
