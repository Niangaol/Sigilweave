// 遭遇问答与事件点：大 Boss/NPC/小 Boss 门的触发判定、事件点图标、问答面板流程、Boss 登场演出。
// 从 BattleScene 迁出（2026-11-19 架构重构波 2）。场景方法保留同名一行委托；
// checkProgressEvents 必须经 scene.beginEncounter(def) 回调（battle-flow 测试会覆盖该属性）。
import { C, HEX, addText, pxRect, pxFrame, pxDiamond } from '../ui/Palette.js';
import { shakeCamera } from '../ui/camera-shake.js';
import { MAJOR_BOSS_LEVEL, shouldTriggerMajorBoss } from '../logic/progression.js';
import { getEncounterById, getEncounterForStage } from '../data/encounters.js';
import { openEncounter, selectChoice, confirmChoice, finishEncounter } from '../logic/encounters.js';
import { fireGuide } from '../logic/guide.js';
import { sfx } from '../audio/Sfx.js';
import Boss from '../entities/Boss.js';

export function playBossIntro(scene, bossId) {
  const def = getEncounterById(bossId);
  const mini = def?.tier === 'mini';
  const dur = mini ? 900 : 1600;
  scene.phase = 'intro'; scene.paused = true; scene.engine.paused = true;
  // 大立绘需要更多上方取景：镜头整体上移，玩家被推到画面下半区，Boss 完整落在 HUD 下方。
  scene.bossCamOffset = mini ? 50 : 80;
  scene.resumeFollow(scene.bossCamOffset);
  scene.introDur = dur; scene.introLeft = dur;
  if (scene.boss) {
    scene.introToY = scene.boss.y;
    scene.introFromY = Math.max(60, scene.boss.y - 140);
    scene.boss.y = scene.introFromY;
  }
  sfx.bossRoar();
  shakeCamera(scene, 'major', mini ? 150 : 320, 0.005);
  scene.effects.text(240, 92, (def ? def.name + ' · ' + def.title : '未知的威胁'), 12, HEX.brassLight, true);
  scene.effects.text(240, 112, mini ? '小 Boss 拦路' : '大 Boss 降临', 9, HEX.blood, true);
  scene.effects.text(240, 128, mini ? '它挡住了去路' : '它的眼神锁定了你', 8, HEX.mute, true);
}

export function checkProgressEvents(scene) {
  // 新手引导：大 Boss 前置提示（各幕 G04/G08/G11）——等级逼近门槛时先给一句，不剧透答案
  const bossLv = MAJOR_BOSS_LEVEL[scene.stage];
  const guideId = scene.stage === 1 ? 'G04' : scene.stage === 2 ? 'G08' : scene.stage === 3 ? 'G11' : null;
  if (guideId && !scene.run.majorBossStages[scene.stage]
    && scene.run.progression.level >= bossLv - 1
    && scene.phase === 'play' && !scene.paused) {
    fireGuide(scene, scene.run, guideId, { act: scene.chapter, stage: scene.stage });
  }
  // 1) 大Boss：等级达标（时间保底经验推着等级走，磨蹭也会触发）
  if (!scene.bossStarted && !scene.run.majorBossStages[scene.stage] && shouldTriggerMajorBoss(scene.stage, scene.run.progression.level)) {
    const def = getEncounterForStage(scene.stage, 'boss');
    if (def) { scene.beginEncounter(def); return; }
  }
  // 2) 地图事件点：NPC 问答 / 小Boss 门
  for (const point of scene.eventPoints) {
    if (point.done) continue;
    if (Math.hypot(scene.player.x - point.x, scene.player.y - point.y) <= point.radius) {
      const def = getEncounterById(point.id);
      if (def) { scene.beginEncounter(def); return; }
    }
  }
}

// 绘制事件点图标与接近提示（每帧轻量）
export function updateEventPointVisuals(scene) {
  for (const point of scene.eventPoints) {
    if (point.done) { if (point.icon) { point.icon.destroy(); point.icon = null; } if (point.label) { point.label.destroy(); point.label = null; } continue; }
    const d = Math.hypot(scene.player.x - point.x, scene.player.y - point.y);
    if (!point.icon) {
      point.icon = scene.add.graphics().setDepth(Math.floor(point.y));
      const g = point.icon;
      const col = point.type === 'npc' ? C.teal : C.blood;
      pxRect(g, point.x - 5, point.y - 9, 10, 12, C.nightDeep, 1);
      pxFrame(g, point.x - 5, point.y - 9, 10, 12, col, 1);
      pxRect(g, point.x - 2, point.y + 3, 4, 2, C.stoneDark, 1);
      if (point.type === 'miniboss') pxDiamond(g, point.x, point.y - 3, 2, C.blood, 1, true);
      else pxRect(g, point.x - 1, point.y - 7, 2, 4, C.teal, 1);
    }
    const near = d < 130;
    if (near && !point.label) {
      // 新手引导 G03：首次靠近发光事件点（此时游戏原生提示标签也刚出现）
      fireGuide(scene, scene.run, 'G03', { highlight: 'eventPoint' });
    }
    if (near && !point.label) point.label = addText(scene, point.x, point.y - 24, point.name + '（' + point.hint + '）', 7, point.type === 'npc' ? HEX.teal : HEX.blood, { wordWrap: { width: 160 } }).setOrigin(0.5, 1).setDepth(300);
    if (!near && point.label) { point.label.destroy(); point.label = null; }
  }
}

export function beginEncounter(scene, definition) {
  if (scene.phase !== 'play') return;
  const opened = openEncounter(scene.run.encounters, definition, { seed: scene.run.seed + ':' + definition.id });
  if (!opened.ok) return;
  // 大Boss一旦触发过（无论答对处决/答错开战）就不再重复触发，防止等级条件恒真导致无限开问答
  if (definition.type === 'boss' && definition.tier !== 'mini') scene.run.majorBossStages[scene.stage] = true;
  // 冻结镜头跟随：问答面板挂世界坐标，镜头再动面板就会漂移、点击全偏
  scene.cameras.main.stopFollow();
  scene.phase = 'encounter'; scene.paused = true; scene.engine.paused = true;
  scene.menuOpen = false; scene.spaceHeld = false; scene.focusPaused = false;
  scene.pauseMenu.hide(); scene.hint.setVisible(false); scene.pauseHint.setVisible(false);
  scene.board.setDetailVisible(false); scene.input.keyboard.resetKeys();
  if (definition.type === 'boss') {
    scene.bossStarted = true;
    scene.boss = new Boss(scene, definition, scene.stage, scene.enemySeq++);
    // 阶段基线归零：否则上一只 Boss 的 phase 会让新 Boss 登场同帧误判一次「转阶段」。
    // model.phase 在 createBossModel 时还是 undefined，由 stepBoss 首次调用补成 0，
    // 所以这里必须写 0（而不是 model.phase）：写 undefined 会让新 Boss 第一帧
    // updateEnemies 之后被误判成一次转阶段，G18 引导也会在开战瞬间就弹。
    scene.lastBossPhase = scene.boss.model.phase ?? 0;
    scene.boss.x = scene.player.x;
    // 新 Boss 立绘 72/104px：下限按实际显示高度算，保证整只 Boss 落在 HUD 下方。
    const bossMinY = 42 + (scene.boss.sprite?.displayHeight ?? 0) - 21 + 4;
    // 92 而不是 110：大立绘 104px 时，110 的间距会把 Boss 头顶顶到 HUD 里
    scene.boss.y = Math.max(bossMinY, scene.player.y - 92);
    scene.enemies.push(scene.boss);
  }
  scene.encounterPanel.show(scene.run.encounters.active);
  sfx.quiz();
}

export function selectEncounterAnswer(scene, choiceId) {
  if (scene.phase !== 'encounter') return;
  const response = selectChoice(scene.run.encounters, choiceId);
  window.__LAST_SELECT__ = { choiceId, ok: response.ok, message: response.message };
  scene.encounterPanel.show(scene.run.encounters.active, response.ok ? '' : response.message);
}

export function confirmEncounterAnswer(scene) {
  if (scene.phase !== 'encounter') return;
  const response = confirmChoice(scene.run.encounters);
  if (!response.ok) { scene.encounterPanel.show(scene.run.encounters.active, response.message); return; }
  const result = response.result;
  scene.shardCount += result.reward.shards ?? 0;
  scene.player.hp = Math.min(scene.player.maxHp, scene.player.hp + (result.reward.heal ?? 0));
  if (result.correct) sfx.correct(); else sfx.wrong();
  if (!result.correct && result.penalty.slowMs) scene.playerSlowUntil = scene.engine.now + result.penalty.slowMs;
  if (result.action === 'bossDefeated') scene.defeatBoss('quiz', result.bossId, scene.run.encounters.active?.tier === 'mini' ? 'mini' : 'major');
  scene.encounterPanel.show(scene.run.encounters.active);
}

export function continueEncounter(scene) {
  if (scene.phase !== 'encounter') return;
  const response = finishEncounter(scene.run.encounters);
  if (!response.ok) return;
  scene.encounterPanel.hide(); scene.input.keyboard.resetKeys();

  // 新手引导 · 答题反应在面板隐藏后才弹出，避免气泡与「继续前进」按钮的点击命中冲突。
  // QUIZ_FIRST_CORRECT / QUIZ_WRONG 均由 fireGuide 的 run.guideSeen 去重，整局各只出现一次。
  const correct = response.result.correct === true;
  fireGuide(scene, scene.run, correct ? 'QUIZ_FIRST_CORRECT' : 'QUIZ_WRONG', { act: scene.chapter, stage: scene.stage });

  // 标记事件点完成（小Boss门/NPC点），罗盘小地图不再显示
  const finishedId = response.result.encounterId;
  for (const point of scene.eventPoints) if (point.id === finishedId) point.done = true;
  scene.run.completedEvents[finishedId] = true;
  if (scene.bossDefeated) { scene.startBossClearTransition(); return; }
  if (response.result.action === 'bossBattle') {
    for (const enemy of scene.enemies) if (!enemy.isBoss) enemy.destroy();
    scene.enemies = scene.enemies.filter(enemy => enemy.isBoss);
    scene.releaseProjectiles();
    scene.playBossIntro(scene.run.encounters.history.at(-1)?.bossId);
    return;
  }
  scene.phase = 'play'; scene.paused = false; scene.engine.paused = false;
  scene.resumeFollow();
  scene.player.invulnUntil = scene.engine.now + 800;
  // 若浏览器在读题阶段失焦，关闭对话也不能悄悄恢复战斗。
  if (!document.hasFocus()) { scene.focusPaused = true; scene.openPause('focus'); }
}
