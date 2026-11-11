// 命中重量表：把「法术有多重」变成可测的数据，而不是散落在场景里的魔法数。
// 三个量：
//   ms / amp —— Phaser 相机震屏时长与强度（amp 是相对视口比例，0.002 = 约 1~2px）
//   stopMs   —— 命中顿帧（冻结战斗推进）。只给重击，割草节奏不能被拖慢
//   gapMs    —— 同一法术两次重击的最小间隔，防止齐射 3 发在同帧叠出 3 次震屏

export const SPELL_PUNCH = {
  // 轻：单手快法术，只给一点点“打到了”的反馈
  frost_arrow: { ms: 70, amp: 0.0022, stopMs: 0, gapMs: 90 },
  arcane_bolt: { ms: 80, amp: 0.0026, stopMs: 0, gapMs: 90 },
  chain_lightning: { ms: 80, amp: 0.0028, stopMs: 0, gapMs: 70 },
  echo_sigil: { ms: 90, amp: 0.003, stopMs: 0, gapMs: 90 },
  mana_siphon: { ms: 80, amp: 0.0026, stopMs: 0, gapMs: 90 },
  // 中：范围/持续伤害，震一下但不顿帧
  flame_burst: { ms: 110, amp: 0.0038, stopMs: 0, gapMs: 110 },
  ember_fan: { ms: 100, amp: 0.0034, stopMs: 0, gapMs: 110 },
  thorn_vine: { ms: 110, amp: 0.0036, stopMs: 0, gapMs: 110 },
  soul_lance: { ms: 110, amp: 0.0038, stopMs: 0, gapMs: 110 },
  holy_ward: { ms: 90, amp: 0.0026, stopMs: 0, gapMs: 200 },
  aegis_ring: { ms: 90, amp: 0.0026, stopMs: 0, gapMs: 200 },
  // 重：贯穿/坠落这类“砸下去”的，震屏更大 + 短顿帧
  pierce_lance: { ms: 120, amp: 0.0042, stopMs: 35, gapMs: 140 },
  starfall: { ms: 150, amp: 0.005, stopMs: 40, gapMs: 170 },
  judgment_hammer: { ms: 190, amp: 0.007, stopMs: 55, gapMs: 220 },
  quake_maw: { ms: 230, amp: 0.008, stopMs: 65, gapMs: 240 },
  meteor_judgment: { ms: 280, amp: 0.009, stopMs: 75, gapMs: 260 },
};

export const DEFAULT_PUNCH = { ms: 90, amp: 0.003, stopMs: 0, gapMs: 120 };

// 「演出级」法术：陨星裁决与地裂之颚在命中时会额外交给 strike 层做多段演出，
// 震屏与顿帧也比普通重击高一档（这是全场唯一允许震到 0.012 的两个）。
export const STRIKE_PUNCH = {
  meteor_judgment: { ms: 340, amp: 0.012, stopMs: 110, gapMs: 320 },
  quake_maw: { ms: 280, amp: 0.01, stopMs: 90, gapMs: 300 },
};

export function strikePunchFor(defId) {
  return STRIKE_PUNCH[defId] ?? null;
}

export function punchFor(defId) {
  return SPELL_PUNCH[defId] ?? DEFAULT_PUNCH;
}

// 纯函数：这次命中该不该真的震（同法术 gapMs 内只吃一次）
export function shouldPunch(defId, now, lastAt) {
  const spec = punchFor(defId);
  if (!Number.isFinite(now) || !Number.isFinite(lastAt)) return false;
  return now - lastAt >= spec.gapMs;
}
