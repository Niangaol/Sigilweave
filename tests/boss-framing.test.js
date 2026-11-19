// Boss 战取景：抬头量必须夹在玩家安全线以内，Boss 也不能整只留在画面外。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  DEFAULT_VIEW_H, DEFAULT_DEADZONE_H, PLAYER_SAFE_MARGIN,
  followOffsetLimit, clampFollowOffset, bossFrameOffset, playerVisible, leashIntoView,
} from '../src/ui/boss-framing.js';

const root = resolve(import.meta.dirname, '..');

describe('Boss 取景偏移', () => {
  it('安全线：横屏 270 高、40 死区下最多 89px，玩家中心就不会掉出画面', () => {
    expect(followOffsetLimit(270, 40)).toBe(270 / 2 - 20 - PLAYER_SAFE_MARGIN);  // 89
    // 玩家屏幕 y = viewH/2 + offset，必须 ≤ viewH - 死区半高 - 留边
    const offset = followOffsetLimit();
    const screenY = 270 / 2 + offset + DEFAULT_DEADZONE_H / 2;
    expect(screenY).toBeLessThanOrEqual(270 - PLAYER_SAFE_MARGIN + 0.001);
  });

  it('clampFollowOffset：旧值 50+80=130 必须被夹到 89', () => {
    expect(clampFollowOffset(130)).toBe(89);
    expect(clampFollowOffset(-500)).toBe(-89);
    expect(clampFollowOffset(0)).toBe(0);
    expect(clampFollowOffset(NaN)).toBe(0);
  });

  it('bossFrameOffset：普通取景取基准值，Boss 在上面时抬起但不越线', () => {
    // Boss 就在玩家脚下：不需要额外抬头，取基准 50
    expect(bossFrameOffset({ baseOffset: 50, playerY: 200, bossTop: 200 }).offset).toBe(50);
    // Boss 头顶 193px 在玩家上方：算出来会被夹线，且 limited 为真
    const far = bossFrameOffset({ baseOffset: 50, playerY: 200, bossTop: 7 });
    expect(far.offset).toBe(89);
    expect(far.limited).toBe(true);
    // 刚好装得下时不再 limited
    const fits = bossFrameOffset({ baseOffset: 50, playerY: 200, bossTop: 7 + 30 });
    expect(fits.offset).toBeLessThanOrEqual(89);
    expect(fits.limited).toBe(false);
  });

  it('playerVisible：画面内为真，画面外为假，缺数据时默认可见', () => {
    const view = { x: 0, y: 0, w: 480, h: 270 };
    expect(playerVisible({ x: 240, y: 135 }, view)).toBe(true);
    expect(playerVisible({ x: 240, y: 300 }, view)).toBe(false);
    expect(playerVisible({ x: 240, y: 135 }, null)).toBe(true);
    expect(playerVisible(null, view)).toBe(true);
  });

  it('leashIntoView：跑出画面的 Boss 被夹回边缘，画面内不动', () => {
    const view = { x: 0, y: 0, w: 480, h: 270 };
    const far = { x: 900, y: -80 };
    expect(leashIntoView(far, view)).toBe(true);
    expect(far).toEqual({ x: 480 - 22, y: 18 });
    const inside = { x: 200, y: 120 };
    expect(leashIntoView(inside, view)).toBe(false);
    expect(inside).toEqual({ x: 200, y: 120 });
  });

  it('场景里确实用上了：resumeFollow 夹线、每帧取景、Boss 拴绳', () => {
    // 波 1 起取景实现迁到 ui/battle-camera.js：检查面合并两个文件（只扩大、不放松）。
    const src = readFileSync(resolve(root, 'src/scenes/BattleScene.js'), 'utf8')
      + readFileSync(resolve(root, 'src/ui/battle-camera.js'), 'utf8');
    expect(src).toContain('clampFollowOffset(base + offsetY, view.h, DEFAULT_DEADZONE_H)');
    expect(src).toContain('this.updateBossCamera();');
    expect(src).toContain('leashIntoView(this.boss, feetView)');
    expect(src).toContain('playerVisible(scene.player, view, 6)');
    // 旧的 110 间距会让 104px 立绘顶进 HUD
    expect(src).not.toContain('this.player.y - 110');
  });
});
