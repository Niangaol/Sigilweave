// 拾取与弹丸：经验粒子、碎片、宝箱增益、玩家弹丸的生成/推进/回收。
// 从 BattleScene 迁出（2026-11-19 架构重构波 3 收尾）。场景方法保留同名一行委托。
import { C, HEX, pxRect, pxFrame } from '../ui/Palette.js';
import { grantExp, rollBuffWeighted, CHARACTER_BUFFS } from '../logic/progression.js';
import { visibleFilter } from '../logic/sector.js';
import { PLAYER } from '../data/roster.js';
import { metaLevel, applyPassiveToCharacter, metaPassiveLabel } from '../logic/meta.js';
import { appendPassive, countPassives } from '../ui/passive-summary.js';
import { sfx } from '../audio/Sfx.js';

export function fireProjectile(scene, x, y, tx, ty, def, target) {
  const projectile = scene.projectilePool.acquire(x, y, tx, ty, def, target);
  if (!projectile) return null;
  scene.projectiles.push(projectile);
  return projectile;
}


export function spawnShard(scene, x, y) {
  const shard = scene.shardPool.acquire(x, y);
  if (!shard) return null;
  scene.shards.push(shard);
  return shard;
}

// ---------- 经验粒子：击杀爆散 → 炸散 → 追玩家 → 碰到才入账 ----------

export function spawnExpMote(scene, x, y, value = 1, mul = 1) {
  const mote = scene.expMotePool.acquire(x, y, value, mul);
  if (!mote) {
    // 池满兜底：经验绝不凭空消失，直接入账
    const gained = grantExp(scene.run.progression, value, mul);
    if (!scene.stressRunning && gained.ok && gained.levelsGained > 0) scene.queueLevelPicks(gained.levelsGained);
    return null;
  }
  scene.expMotes.push(mote);
  return mote;
}


export function collectExpMote(scene, mote) {
  const gained = grantExp(scene.run.progression, mote.value, mote.mul);
  if (!scene.stressRunning && gained.ok && gained.levelsGained > 0) scene.queueLevelPicks(gained.levelsGained);
  scene.effects.expPop(mote.x, mote.y);
  sfx.exp();
}


export function updateExpMotes(scene, dt) {
  for (let i = scene.expMotes.length - 1; i >= 0; i--) {
    const mote = scene.expMotes[i];
    if (!mote.update(dt, scene.player)) continue;
    scene.collectExpMote(mote);
    mote.deactivate();
    scene.expMotePool.release(mote);
    scene.expMotes.splice(i, 1);
  }
}

// 通幕/收尾时把还在飞的粒子一次结算掉，避免经验在过场里蒸发

export function flushExpMotes(scene) {
  if (!scene.expMotes.length) return;
  for (const mote of scene.expMotes) {
    const gained = grantExp(scene.run.progression, mote.value, mote.mul);
    if (!scene.stressRunning && gained.ok && gained.levelsGained > 0) scene.queueLevelPicks(gained.levelsGained);
    mote.deactivate();
    scene.expMotePool.release(mote);
  }
  scene.expMotes.length = 0;
}


export function releaseProjectiles(scene) {
  for (const p of scene.projectiles) { p.deactivate(); scene.projectilePool.release(p); }
  scene.projectiles = [];
}


export function updateProjectiles(scene, dt) {
  const onScreen = visibleFilter(scene.viewRect());
  for (let i = scene.projectiles.length - 1; i >= 0; i--) {
    const p = scene.projectiles[i];
    // 目标走出屏幕就停止追踪：落点停在它最后所在的屏幕内位置，不在屏外结算命中
    if (p.targetEnemy && !onScreen(p.targetEnemy)) p.targetEnemy = null;
    const arrived = p.update(dt);
    if (arrived) {
      scene.resolveProjectile(p);
      p.deactivate();
      scene.projectilePool.release(p);
      scene.projectiles.splice(i, 1);
    }
  }
}

// 当前镜头能看到的世界矩形。这是「屏幕内」的唯一判定来源：
// worldView 已含 zoom、竖屏镜头偏移与跟随死区，比按玩家坐标硬算 480×270 更准。

export function spawnChest(scene, x, y) {
  scene.chests.push({ x, y, g: null, opened: false });
}

// 局内被动清单的合并逻辑在 ui/passive-summary.js 的 appendPassive 纯函数里：
// 同来源同 id 只留一行，stacks 记「这局拿到几次」（暂停菜单显示成 Lv），
// level 记局外残响等级（抽到时只增不减），desc 留着给以后的详情页用。


export function updateChests(scene, dt) {
  for (let i = scene.chests.length - 1; i >= 0; i--) {
    const chest = scene.chests[i];
    if (!chest.g) {
      chest.g = scene.add.graphics().setDepth(Math.floor(chest.y));
      pxRect(chest.g, chest.x - 4, chest.y - 3, 9, 7, C.brassDark, 1);
      pxFrame(chest.g, chest.x - 4, chest.y - 3, 9, 7, C.brass, 1, 1);
      pxRect(chest.g, chest.x - 1, chest.y - 1, 2, 2, C.brassLight, 1);
    }
    if (Math.hypot(scene.player.x - chest.x, scene.player.y - chest.y) < 16) {
      const buff = rollBuffWeighted(CHARACTER_BUFFS, () => scene.combatRng.next(), scene.run.kitAffinity);
      if (buff) {
        const adapter = {
          maxHp: scene.player.maxHp,
          hp: scene.player.hp,
          speed: PLAYER.speed * (scene.player.speedMult ?? 1),
          pickupRadius: 38 + (scene.player.pickupBonus ?? 0),
          iframeBonus: scene.player.iframesBonus ?? 0,
          shieldCap: scene.player.shieldCap ?? 40,
        };
        const level = metaLevel(scene.metaSave, buff.id);
        const desc = applyPassiveToCharacter(buff, adapter, level);
        scene.player.maxHpBonus = adapter.maxHp - PLAYER.hp;
        scene.player.maxHp = adapter.maxHp;
        scene.player.hp = Math.min(adapter.maxHp, adapter.hp);
        scene.player.speedMult = adapter.speed / PLAYER.speed;
        scene.player.pickupBonus = adapter.pickupRadius - 38;
        scene.player.iframesBonus = adapter.iframeBonus;
        scene.player.shieldCap = adapter.shieldCap;
        scene.run.characterStats = {
          maxHp: scene.player.maxHp, maxHpBonus: scene.player.maxHpBonus,
          speedMult: scene.player.speedMult, pickupBonus: scene.player.pickupBonus,
          iframesBonus: scene.player.iframesBonus, shieldCap: scene.player.shieldCap,
        };
        appendPassive(scene.run.passiveLog, 'chest', buff, level, desc);
        scene.passiveCounts = countPassives(scene.run.passiveLog);
        scene.effects.text(scene.player.x, scene.player.y - 14, '宝箱 · ' + buff.name + metaPassiveLabel(level) + '：' + desc, HEX.brassLight, true);
      }
      sfx.pick();
      chest.g.destroy();
      scene.chests.splice(i, 1);
    }
  }
}

// 本场大 Boss 解决后的去向：合并幕前半场原地换场，单场幕/合并幕末场通幕，第七场终局。
// 计时结束只开启前置问答，通幕永远由大 Boss 决定。
