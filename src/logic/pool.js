// 通用对象池：饱和时拒绝新建而不是抢占活动对象，并记录统计供压测观察。
export class Pool {
  constructor({ create, revive = null, capacity = Infinity, name = 'pool' } = {}) {
    if (typeof create !== 'function') throw new TypeError('Pool 需要 create 工厂函数');
    if (!Number.isInteger(capacity) || capacity < 1) throw new RangeError('capacity 必须是正整数');
    this.create = create;
    this.revive = revive;
    this.capacity = capacity;
    this.name = name;
    this.free = [];
    this.active = 0;
    this.created = 0;
    this.reused = 0;
    this.saturated = 0;
    this.peak = 0;
  }

  // 取一个对象；池已满且无空闲时返回 null，调用方必须处理“本次没有对象”的情况
  acquire(...args) {
    let obj = this.free.pop();
    if (obj) {
      this.reused++;
      if (this.revive) this.revive(obj, ...args);
    } else if (this.created < this.capacity) {
      obj = this.create(...args);
      this.created++;
    } else {
      this.saturated++;
      return null;
    }
    this.active++;
    if (this.active > this.peak) this.peak = this.active;
    return obj;
  }

  release(obj) {
    if (!obj) return false;
    this.active = Math.max(0, this.active - 1);
    this.free.push(obj);
    return true;
  }

  stats() {
    return {
      name: this.name,
      active: this.active,
      free: this.free.length,
      created: this.created,
      reused: this.reused,
      saturated: this.saturated,
      peak: this.peak,
      capacity: this.capacity,
    };
  }

  resetStats() { this.reused = 0; this.saturated = 0; }
}
