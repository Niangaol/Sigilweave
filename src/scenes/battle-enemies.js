// 敌人推进：编队光环、分离、接触伤害、Boss 死亡汇流、击杀奖励、连斩、碎片、近战命中。
// 从 BattleScene 迁出（2026-11-19 架构重构波 3）。场景方法保留同名一行委托。
import { C, HEX } from '../ui/Palette.js';
import { shakeCamera } from '../ui/camera-shake.js';
import { FORMATIONS, formationAuraOf } from '../data/formations.js';
import { separateEnemiesBucketed } from '../logic/spawn.js';
import { meleeHits } from '../logic/hostile.js';
import { sfx } from '../audio/Sfx.js';

// 击杀经验折算：1 杀 1 点。保留成可调项——实机觉得升级太频繁就调到 2/3 整体降速。
const KILL_EXP_PER_POINT = 1;
const FORMATION_BY_ID = new Map(FORMATIONS.map((f) => [f.id, f]));

export function refreshFormationAuras(scene) {
  // 第一遍按「这一批」分桶：收「活着的编队成员」，Boss 不收。
  // 键用 formationUid 而不是 formationId：同模板可以连着刷两批，两批是两支独立的队。
  // 按模板分组时，A 队前排已死、B 队前排还活着 → A 队后排仍带光环，
  // 「打掉前排光环就散」在正常节奏下（约每 10s 一批、走过来要 4~7s）不成立。
  // 精英留在桶里是刻意的——它是合格的前排，只是自己不吃加成（下一段判收方时剔除）。
  const groups = new Map();
  for (const e of scene.enemies) {
    if (!e?.alive || !e.formationId || e.isBoss) continue;
    const key = e.formationUid ?? e.formationId;
    const arr = groups.get(key);
    if (arr) arr.push(e); else groups.set(key, [e]);
  }

  // 第二遍逐只定字段。遍历的是「场上所有敌人」而不是仅分组成员：
  // Boss/精英/刚死亡的成员也要走到这里被删一次，否则它们上一帧残留的字段
  // 会一直留到对象被销毁为止（对象池复用时会白拿一次加成）。
  for (const e of scene.enemies) {
    const inFormation = !!e && e.alive === true && !e.isBoss && !!e.formationId;
    const members = inFormation ? groups.get(e.formationUid ?? e.formationId) : null;
    // 模板缺失（存档里的旧 id / 拼错的 id）时按「无光环」处理：
    // 宁可这队没有加成，也不要凭 id 猜一组数值。
    const aura = members ? formationAuraOf(FORMATION_BY_ID.get(e.formationId)) : null;
    // 前排判定只看「带 vanguard 路径的成员还活着没有」：路径在刷怪时随成员落库，
    // 不由 defId 反查模板——同一个 defId 在不同编队可能站不同位置，反查会串队。
    const hasVanguard = aura != null && members.some((m) => m.alive && m.formationPath === 'vanguard');
    // 收方剔除两类：精英（spec §5.3）与上前排的那只自己（spec 说的是「其余成员」）。
    const receives = hasVanguard && !e.def?.elite && e.formationPath !== 'vanguard';
    if (!receives) {
      // delete 而不是置 null：'formationAura' in e 是测试与调试都想读的「有没有」语义，
      // 留一个 null 会让 applyDamage 的 ?. 与后续排查都变成两套判断。
      delete e.formationAura;
    } else {
      // 每帧新对象、不共享引用：某只怪被单独改字段时不能污染全队。
      e.formationAura = { armorBonus: aura.armorBonus, speedMul: aura.speedMul };
    }
  }
}


export function updateEnemies(scene, dt) {
  // 光环必须先于逐只结算：同一帧里前排刚死、后排这一帧算速度时就必须已经没加成。
  scene.refreshFormationAuras();
  // 逐帧轻量分离：同屏已经到 60~90，旧版「>48 只就跳过」会直接叠成一坨；
  // 改用空间分桶 O(n·k) 版本，压测灌到 150 只也不会退化成 O(n²)。
  if (scene.enemies.length > 1) {
    separateEnemiesBucketed(scene.enemies, { gap: 20, player: scene.player, contactDist: 26 });
  }
  for (let i = scene.enemies.length - 1; i >= 0; i--) {
    const e = scene.enemies[i];
    // 多管血：打空一管不销毁，回满并进入下一阶段（横幅 + 两段色 burst）。
    // 清杂兵弹幕与 G18 引导由 BattleScene.update 的 lastBossPhase 边沿统一处理，
    // 这里只做「离事件最近」的演出，避免同一事件两处各演一遍。
    if (e.pendingBarShift) {
      e.pendingBarShift = false;
      const style = e.enterNextBar?.();
      if (style) {
        scene.effects.text(240, 92, '第二阶段 · ' + style.name, 12, HEX.brassLight, true);
        scene.effects.text(240, 114, '它的打法变了', 9, HEX.blood, true);
        scene.effects.burst(e.x, e.y, C.brassLight, 24);
        scene.effects.burst(e.x, e.y, style.color, 16);
        scene.cameras?.main?.flash?.(160, 255, 246, 224);
        shakeCamera(scene, 'phase', 320, 0.006);
        continue;
      }
    }
    if (!e.alive) {
      // 死掉的成员不带走光环字段：对象本身会被销毁，但对象池/复用路径上
      // 残留的 formationAura 会让「复活的同一只」白拿一次加成。
      delete e.formationAura;
      // 任何来源造成的Boss死亡都必须汇到统一通幕结算，不能直接跳过
      if (e.isBoss && !scene.bossDefeated) scene.defeatBoss('combat', e.definition.bossId, e.definition.tier === 'mini' ? 'mini' : 'major');
      if (!scene.enemies.includes(e)) continue; // defeatBoss 已将其移出并销毁
      e.destroy();
      scene.enemies.splice(i, 1);
      continue;
    }
    e.update(dt, scene.engine.now);
    // 罗盘属于 HUD，不是地图地形；怪物可穿过旧分界线。
    // 大地图：杂兵离玩家过远即回收（Boss 不受此限），不再按屏幕边界退场
    if (!e.isBoss && Math.hypot(e.x - scene.player.x, e.y - scene.player.y) > 560) e.alive = false;
    if (!e.alive) {
      delete e.formationAura;
      e.destroy();
      scene.enemies.splice(i, 1);
      continue;
    }
    if (scene.player.alive) {
      const d = Math.hypot(e.x - scene.player.x, e.y - scene.player.y);
      if (d < e.radius + scene.player.radius) {
        // 接触不再是「撞一下自毁」：改击退 + 接触冷却，怪留下来反复施压。
        if (scene.engine.now >= (e.contactCdUntil ?? 0)) {
          e.contactCdUntil = scene.engine.now + 600;
          const hit = scene.player.takeDamage(e.damage, scene.engine.now);
          if (hit) {
            scene.effects.hurt();
            scene.effects.impact(e.x, e.y, C.blood, true);
            shakeCamera(scene, 'hurt', 90, 0.004);
          }
          if (scene.player.alive) scene.applyEnemyControl?.(e, 'contact', scene.engine.now);
          if (!e.isBoss && d > 0.001) {
            // 撞完把怪顶开一点，避免整只怪陷在玩家身体里
            e.x += ((e.x - scene.player.x) / d) * 18;
            e.y += ((e.y - scene.player.y) / d) * 18;
          }
        }
      }
    }
  }
}

// 池化生成：池满返回 null，调用方不需要处理“被抢占”的对象

export function onEnemyKilled(scene, e) {
  if (e.rewarded) return;
  if (e.isBoss) {
    e.rewarded = true;
    scene.defeatBoss('combat', e.definition.bossId, e.definition.tier === 'mini' ? 'mini' : 'major');
    return;
  }
  e.rewarded = true;
  scene.kills++;
  scene.bumpKillStreak(e);
  // 经验：普通 1 点、精英 6 点。击杀不再直接入账，而是从爆散中心飞出青色经验粒子，
  // 粒子追到玩家身上才结算 —— 玩家看到的是「打碎它 → 碎片和经验一起炸出来 → 吸进身体」。
  const expMul = scene.run.compassBuffs.expMul * (scene.quickMode ? 4 : 1);
  scene.expKillAccum += e.def?.elite ? 6 : 1;
  const expPoints = Math.floor(scene.expKillAccum / KILL_EXP_PER_POINT);
  if (expPoints > 0) {
    scene.expKillAccum -= expPoints * KILL_EXP_PER_POINT;
    for (let i = 0; i < expPoints; i++) {
      // 环绕错开出生点，精英 6 颗不会叠在同一像素上
      const a = (i / expPoints) * Math.PI * 2;
      scene.spawnExpMote(e.x + Math.cos(a) * 4, e.y - 6 + Math.sin(a) * 3, 1, expMul);
    }
  }
  // 宝箱：击杀量涨了约 10 倍，掉率同步压到 0.8%、同屏最多 4 个，否则增益会糊满地图
  if (scene.combatRng.next() < 0.008 && scene.chests.length < 4) scene.spawnChest(e.x, e.y);
  // 击杀爆散：小怪碎成骨屑与身体碎片飞出去（精英更大一圈），经验粒子就在这团里飞出
  scene.effects.deathScatter(e.x, e.y, e.def?.color ?? C.bone, { elite: !!e.def?.elite });
  // 碎片：密度 ×10 后按概率掉（精英必掉 4 颗，变体再按 shardsAdd 加量），避免工作台经济被瞬间刷爆
  if (e.def?.elite || scene.combatRng.next() < 0.45) {
    const drop = (e.def?.elite ? 4 : 1) + (e.def?.variant?.shardsAdd ?? 0);
    for (let i = 0; i < drop; i++) scene.spawnShard(e.x + (i - (drop - 1) / 2) * 4, e.y - (i % 2) * 3);
  }
  e.alive = false;
  e.destroy();
  const idx = scene.enemies.indexOf(e);
  if (idx >= 0) scene.enemies.splice(idx, 1);
}

// 连斩：1.5 秒内连续击杀累计，超过就断。每 12 连斩回 1 点血，
// 20/40/60 连斩给一次极轻震屏 —— 割草的手感反馈，不改变任何结算数值。

export function bumpKillStreak(scene, e) {
  const now = scene.engine.now;
  if (now - scene.lastKillAt > 1500) scene.killStreak = 0;
  scene.lastKillAt = now;
  scene.killStreak++;
  if (scene.killStreak > scene.streakBest) scene.streakBest = scene.killStreak;
  scene.effects.killStreak(scene.killStreak);
  sfx.kill(scene.killStreak);
  if (scene.killStreak % 12 === 0 && scene.player.alive && scene.player.hp < scene.player.maxHp) {
    scene.player.hp = Math.min(scene.player.maxHp, scene.player.hp + 1);
    scene.effects.text(scene.player.x, scene.player.y - 16, '连斩回复 +1', HEX.teal);
  }
  // 连斩 20/40/60 只走文字与音效，不再震屏
}


export function updateShards(scene, dt) {
  // 碎片共鸣：扩大吸取半径，不直接拾取
  const magnet = scene.grid.cells.some(c => c.unlocked && c.slot?.defId === 'shard_resonance');
  const opts = magnet ? { pullRadius: 96, pullSpeed: 92 } : undefined;
  for (let i = scene.shards.length - 1; i >= 0; i--) {
    const s = scene.shards[i];
    const picked = s.update(dt, scene.player, scene.engine.now, opts);
    if (picked) {
      scene.shardCount++;
      sfx.pick();
      scene.effects.text(s.x, s.y - 6, '+1', HEX.teal);
      s.deactivate();
      scene.shardPool.release(s);
      scene.shards.splice(i, 1);
    }
  }
}


export function onEnemyMelee(scene, enemy, melee) {
  if (!melee || scene.phase !== 'play' || !scene.player?.alive) return false;
  const x = Number.isFinite(melee.x) ? melee.x : (enemy?.x ?? scene.player.x);
  const y = Number.isFinite(melee.y) ? melee.y : (enemy?.y ?? scene.player.y);
  const angle = Number.isFinite(melee.angle) ? melee.angle : 0;
  const range = Number.isFinite(melee.range) && melee.range > 0 ? melee.range : 24;
  const arc = Number.isFinite(melee.arc) && melee.arc > 0 ? melee.arc : Math.PI / 2;
  scene.effects?.slash?.(x, y, angle, range, arc, enemy?.def?.color ?? C.blood);
  sfx.meleeSwing();
  if (!meleeHits(melee, scene.player)) return false;
  if (typeof scene.player.takeDamage !== 'function') return false;
  const damage = Number.isFinite(melee.damage) ? melee.damage : (enemy?.damage ?? 8);
  const dealt = scene.player.takeDamage(damage, scene.engine?.now ?? 0);
  if (dealt) {
    scene.effects?.hurt?.();
    scene.effects?.impact?.(scene.player.x, scene.player.y, C.blood, true);
    sfx.hurt();
    shakeCamera(scene, 'hurt', 120, 0.004);
    scene.applyEnemyControl?.(enemy, 'melee', scene.engine?.now ?? 0);
  }
  return !!dealt;
}

