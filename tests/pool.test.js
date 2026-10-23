import { describe, it, expect } from 'vitest';
import { Pool } from '../src/logic/pool.js';

const make = (capacity = 2) => new Pool({
  create: (x) => ({ value: x, dead: false }),
  revive: (obj, x) => { obj.value = x; obj.dead = false; },
  capacity,
  name: 'test',
});

describe('对象池', () => {
  it('容量内新建，释放后复用同一对象', () => {
    const pool = make(2);
    const a = pool.acquire(1);
    const b = pool.acquire(2);
    expect(pool.created).toBe(2);
    pool.release(a);
    const c = pool.acquire(3);
    expect(c).toBe(a);
    expect(c.value).toBe(3);
    expect(pool.reused).toBe(1);
    expect(pool.created).toBe(2);
    expect(pool.active).toBe(2);
  });

  it('饱和时返回 null，绝不占用活动对象', () => {
    const pool = make(1);
    const a = pool.acquire(1);
    expect(pool.acquire(2)).toBe(null);
    expect(pool.saturated).toBe(1);
    expect(pool.active).toBe(1);
    expect(a.value).toBe(1);
  });

  it('释放后饱和恢复可取，峰值只记录最高并发', () => {
    const pool = make(2);
    const a = pool.acquire(1); const b = pool.acquire(2);
    expect(pool.peak).toBe(2);
    pool.release(a); pool.release(b);
    expect(pool.active).toBe(0);
    expect(pool.peak).toBe(2);
    expect(pool.acquire(9).value).toBe(9);
    expect(pool.peak).toBe(2); // 峰值是历史最高并发，不随释放回落
  });

  it('释放 null 不改变计数，重复释放不会变成负数', () => {
    const pool = make(2);
    const a = pool.acquire(1);
    expect(pool.release(null)).toBe(false);
    pool.release(a); pool.release(a);
    expect(pool.active).toBe(0);
    expect(pool.stats().free).toBe(2);
  });

  it('非法工厂与容量立即报错', () => {
    expect(() => new Pool({})).toThrow(TypeError);
    expect(() => new Pool({ create: () => ({}), capacity: 0 })).toThrow(RangeError);
    expect(() => new Pool({ create: () => ({}), capacity: 1.5 })).toThrow(RangeError);
  });

  it('stats 返回快照，不被后续改动影响', () => {
    const pool = make(2);
    pool.acquire(1);
    const snap = pool.stats();
    pool.acquire(2);
    expect(snap.active).toBe(1);
    expect(pool.stats().active).toBe(2);
    expect(pool.stats().capacity).toBe(2);
  });
});
