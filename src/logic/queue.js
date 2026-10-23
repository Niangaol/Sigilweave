// 稳定优先队列：按 (time, seq) 排序，time 相同则先入先出
export class EventQueue {
  constructor() {
    this.items = [];
    this.seq = 0;
  }

  get size() {
    return this.items.length;
  }

  get isEmpty() {
    return this.items.length === 0;
  }

  push(time, type, payload) {
    const ev = { time, seq: this.seq++, type, payload };
    this.items.push(ev);
    this.#up(this.items.length - 1);
    return ev;
  }

  peek() {
    return this.items[0] || null;
  }

  pop() {
    if (this.items.length === 0) return null;
    const top = this.items[0];
    const last = this.items.pop();
    if (this.items.length > 0) {
      this.items[0] = last;
      this.#down(0);
    }
    return top;
  }

  clear() {
    this.items.length = 0;
  }

  // 按任意判定删除，返回删除数量
  removeIf(pred) {
    const kept = [];
    let removed = 0;
    for (const it of this.items) {
      if (pred(it)) removed++;
      else kept.push(it);
    }
    this.items = kept;
    for (let i = (this.items.length >> 1) - 1; i >= 0; i--) this.#down(i);
    return removed;
  }

  #less(a, b) {
    if (a.time !== b.time) return a.time < b.time;
    return a.seq < b.seq;
  }

  #up(i) {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.#less(this.items[i], this.items[parent])) {
        [this.items[i], this.items[parent]] = [this.items[parent], this.items[i]];
        i = parent;
      } else break;
    }
  }

  #down(i) {
    const n = this.items.length;
    for (;;) {
      const l = i * 2 + 1;
      const r = l + 1;
      let smallest = i;
      if (l < n && this.#less(this.items[l], this.items[smallest])) smallest = l;
      if (r < n && this.#less(this.items[r], this.items[smallest])) smallest = r;
      if (smallest === i) break;
      [this.items[i], this.items[smallest]] = [this.items[smallest], this.items[i]];
      i = smallest;
    }
  }
}
