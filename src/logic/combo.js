// 联组：严格时序判定。只有同一脉流连续成功踩中指定序列才成立。
import { toId, toRC, inBounds, manhattan } from './grid.js';
import { COMBO_WINDOW_FACTOR } from './constants.js';

// 形状按相对行列定义，顺序即必须依次踩中的顺序
export const COMBO_SHAPES = {
  duo: { id: 'duo', label: '对偶', rel: [[0, 0], [0, 1]], bonus: 0.20 },
  line3: { id: 'line3', label: '直线三连', rel: [[0, 0], [0, 1], [0, 2]], bonus: 0.40 },
  elbow3: { id: 'elbow3', label: '折线三连', rel: [[0, 0], [0, 1], [1, 1]], bonus: 0.45 },
  ring4: { id: 'ring4', label: '环封四格', rel: [[0, 0], [0, 1], [1, 1], [1, 0]], bonus: 0.80 },
};

// 二面体变换：旋转与镜像共 8 种
function transformPoint(r, c, k) {
  switch (k) {
    case 1: return [c, -r];
    case 2: return [-r, -c];
    case 3: return [-c, r];
    case 4: return [r, -c];
    case 5: return [-r, c];
    case 6: return [c, r];
    case 7: return [-c, -r];
    default: return [r, c];
  }
}

function normalize(pts) {
  const minR = Math.min(...pts.map((p) => p[0]));
  const minC = Math.min(...pts.map((p) => p[1]));
  return pts.map((p) => [p[0] - minR, p[1] - minC]);
}

function serialize(order) {
  return order.join('-');
}

// 生成某形状在 4x4 网格上的全部有序实例（含旋转、镜像、反向），并去重
export function concreteInstances(shape) {
  const seen = new Map();
  const orders = [];
  for (let k = 0; k < 8; k++) {
    const base = normalize(shape.rel.map(([r, c]) => transformPoint(r, c, k)));
    for (const seq of [base, [...base].reverse()]) {
      const maxR = Math.max(...seq.map((p) => p[0]));
      const maxC = Math.max(...seq.map((p) => p[1]));
      for (let or = 0; or + maxR < 4; or++) {
        for (let oc = 0; oc + maxC < 4; oc++) {
          const order = seq.map(([r, c]) => toId(r + or, c + oc));
          const key = serialize(order);
          if (seen.has(key)) continue;
          seen.set(key, true);
          orders.push({ defId: shape.id, order, bonus: shape.bonus });
        }
      }
    }
  }
  return orders;
}

export function buildComboCatalog(shapeIds = Object.keys(COMBO_SHAPES)) {
  const all = [];
  for (const id of shapeIds) all.push(...concreteInstances(COMBO_SHAPES[id]));
  return all;
}

// 计算窗口：序列各边预计旅行时间之和 × 1.4，在首格触发时快照
export function computeWindowMs(order, grid) {
  let total = 0;
  for (let i = 0; i + 1 < order.length; i++) {
    const from = order[i];
    const to = order[i + 1];
    total += manhattan(from, to) * grid.cells[from].effIntervalMs;
  }
  return total * COMBO_WINDOW_FACTOR;
}

// 联组运行时：每个脉流独立维护进度，互不拼接
export class ComboTracker {
  constructor(instances) {
    this.instances = instances;
    this.byFirst = new Map();   // 首格 -> 实例索引
    this.byCell = new Map();    // 任意格 -> 实例索引（用于快速断链判定）
    instances.forEach((inst, idx) => {
      const first = inst.order[0];
      if (!this.byFirst.has(first)) this.byFirst.set(first, []);
      this.byFirst.get(first).push(idx);
      for (const cellId of inst.order) {
        if (!this.byCell.has(cellId)) this.byCell.set(cellId, []);
        const arr = this.byCell.get(cellId);
        if (!arr.includes(idx)) arr.push(idx);
      }
    });
    this.state = new Map(); // signalId -> Map(instanceIdx -> {progress, windowEnd, startedAt})
  }

  statesOf(signalId) {
    let m = this.state.get(signalId);
    if (!m) {
      m = new Map();
      this.state.set(signalId, m);
    }
    return m;
  }

  breakAll(signalId) {
    const m = this.state.get(signalId);
    if (m && m.size > 0) {
      m.clear();
      return true;
    }
    return false;
  }

  breakSignal(signalId, reason) {
    return this.breakAll(signalId);
  }

  // 返回本次触发导致成立的联组列表
  onTrigger(signalId, cellId, now, grid) {
    const m = this.statesOf(signalId);
    const fired = [];

    // 1. 先处理进行中的实例：不是期望格就断链（含组外绕路与跳序）
    for (const [idx, st] of [...m.entries()]) {
      const inst = this.instances[idx];
      if (inst.order[st.progress] === cellId) {
        if (now > st.windowEnd) {
          m.delete(idx);
          continue;
        }
        st.progress += 1;
        if (st.progress >= inst.order.length) {
          fired.push({ defId: inst.defId, order: inst.order, bonus: inst.bonus, at: now });
          m.delete(idx);
        }
      } else {
        m.delete(idx);
      }
    }

    // 2. 再开启以该格为首的新实例
    const firsts = this.byFirst.get(cellId);
    if (firsts) {
      for (const idx of firsts) {
        if (m.has(idx)) continue;
        const inst = this.instances[idx];
        const windowMs = computeWindowMs(inst.order, grid);
        m.set(idx, { progress: 1, windowEnd: now + windowMs, startedAt: now });
      }
    }
    return fired;
  }
}
