import { it, expect } from 'vitest';
import { makePlayer } from './helpers/player-fixture.js';

it('同类控制 10 秒内递减 1 → 0.6 → 0.35', () => {
  const p = makePlayer();
  p.applyControl('root', 800, 0);     expect(p.rootUntil - 0).toBe(800);
  p.applyControl('root', 800, 1000);  expect(p.rootUntil - 1000).toBe(480);
  p.applyControl('root', 800, 2000);  expect(p.rootUntil - 2000).toBe(280);
  p.applyControl('root', 800, 3000);  expect(p.rootUntil - 3000).toBe(280);
});
it('下限 150ms', () => {
  const p = makePlayer();
  p.applyControl('slow', 200, 0);
  p.applyControl('slow', 200, 100);
  p.applyControl('slow', 200, 200);   // 200×0.35=70 → 抬到 150
  expect(p.slowUntil - 200).toBe(150);
});
it('超过 10 秒窗口后重新计满', () => {
  const p = makePlayer();
  p.applyControl('root', 800, 0);
  p.applyControl('root', 800, 12000);
  expect(p.rootUntil - 12000).toBe(800);
});
it('不同 kind 独立计数', () => {
  const p = makePlayer();
  p.applyControl('root', 800, 0);
  p.applyControl('stun', 700, 0);     // 仍是满额
  expect(p.stunUntil - 0).toBe(700);
});
it('knockStun 不进递减表', () => {
  const p = makePlayer();
  p.applyKnockStun(240, 0);
  p.applyControl('stun', 700, 100);
  expect(p.stunUntil - 100).toBe(700);
});
