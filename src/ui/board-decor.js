// 方阵格的区位分类与装饰计划（纯几何，不引用 Phaser，便于单测）。
// 16 格按位置分三种：角落 4 格、边 8 格、中心 4 格，装饰各不相同：
//   角落：黄铜护角（两条外边各一段直角包边）+ 一颗铆钉 + 略暗的石面，读作“承重的基座”
//   边上：单条黄铜栏（只在外侧一边）+ 两端小钉，读作“围栏/门槛”
//   中心：符文淡染 + 两侧刻点，读作“祭坛核心”，不压符印

import { toRC } from '../logic/grid.js';

export const ZONE = Object.freeze({ CORNER: 'corner', EDGE: 'edge', CENTER: 'center' });

// 非法 id 返回 null，调用方据此跳过装饰而不是猜一个默认值。
export function cellZone(id) {
  if (!Number.isInteger(id) || id < 0 || id > 15) return null;
  const { r, c } = toRC(id);
  const edgeRow = r === 0 || r === 3;
  const edgeCol = c === 0 || c === 3;
  if (edgeRow && edgeCol) return ZONE.CORNER;
  if (edgeRow || edgeCol) return ZONE.EDGE;
  return ZONE.CENTER;
}

// 哪几条边朝向盘面外侧；中心格四条边全在里面，所以都是 false。
export function outerSides(id) {
  const zone = cellZone(id);
  if (!zone) return null;
  const { r, c } = toRC(id);
  return {
    top: r === 0,
    bottom: r === 3,
    left: c === 0,
    right: c === 3,
    any: r === 0 || r === 3 || c === 0 || c === 3,
  };
}

// 把四边形各边向内收进 inset 像素，得到贴着内壁的刻线路径。
export function insetEdges(quad, inset = 1) {
  const [tl, tr, br, bl] = quad;
  return {
    top: [{ x: tl.x + inset, y: tl.y + inset }, { x: tr.x - inset, y: tr.y + inset }],
    bottom: [{ x: bl.x + inset, y: bl.y - inset }, { x: br.x - inset, y: br.y - inset }],
    left: [{ x: tl.x + inset, y: tl.y + inset }, { x: bl.x + inset, y: bl.y - inset }],
    right: [{ x: tr.x - inset, y: tr.y + inset }, { x: br.x - inset, y: br.y - inset }],
  };
}

const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

// 生成该格的装饰计划：只描述“画什么”，由调用方用像素 API 落地。
// opts.inset / arm / stud 可让大盘面（幕间）用更大刻度复用同一份规则。
export function decoratePlan(id, quad, opts = {}) {
  const zone = cellZone(id);
  if (!zone || !Array.isArray(quad) || quad.length !== 4) return null;
  const inset = opts.inset ?? 1;
  const arm = opts.arm ?? 3;
  const sides = outerSides(id);
  const edges = insetEdges(quad, inset);
  const lines = [];
  const dots = [];

  if (zone === ZONE.CENTER) {
    // 中心：不碰外缘（那是角落/边上的语言），改用内嵌的淡符文方框 + 两侧刻点，读作“祭坛核心”
    const [tl, tr, br, bl] = quad;
    // 大盘面文字紧贴格顶，用 centerInset 让符文框让开文字行
    const inner = insetEdges(quad, opts.centerInset ?? (inset + 1));
    for (const name of ['top', 'bottom', 'left', 'right']) {
      lines.push({ a: inner[name][0], b: inner[name][1], color: 'arcane', alpha: 0.55, width: 1 });
    }
    return {
      zone,
      wash: { quad, color: 'arcane', alpha: 0.12 },
      lines,
      dots: [
        { ...lerp(tl, bl, 0.5), color: 'arcane', alpha: 0.85 },
        { ...lerp(tr, br, 0.5), color: 'arcane', alpha: 0.85 },
      ],
    };
  }

  // 角落/边：只刻外侧的边；两条外侧边相交处各让出 arm 像素，形成护角而不是整圈边框
  const trim = (edgeName, a, b) => {
    const horizontal = edgeName === 'top' || edgeName === 'bottom';
    const atStart = horizontal ? (edgeName === 'top' ? sides.left : sides.left) : (edgeName === 'left' ? sides.top : sides.top);
    const atEnd = horizontal ? sides.right : sides.bottom;
    return [
      atStart ? lerp(a, b, arm / Math.max(1, Math.hypot(b.x - a.x, b.y - a.y))) : a,
      atEnd ? lerp(b, a, arm / Math.max(1, Math.hypot(b.x - a.x, b.y - a.y))) : b,
    ];
  };

  for (const name of ['top', 'bottom', 'left', 'right']) {
    if (!sides[name]) continue;
    const [a, b] = trim(name, edges[name][0], edges[name][1]);
    lines.push({ a, b, color: 'brass', alpha: 0.9, width: 1 });
    // 角落格再压一条内线，做成两像素厚的承重护角
    if (zone === ZONE.CORNER) {
      const innerEdge = insetEdges(quad, inset + 1)[name];
      const [ia, ib] = trim(name, innerEdge[0], innerEdge[1]);
      lines.push({ a: ia, b: ib, color: 'brassDark', alpha: 0.85, width: 1 });
    }
  }

  if (zone === ZONE.CORNER) {
    // 护角铆钉压在最外侧那个角上（2×2，比边上的小钉更重）
    const [tl, tr, br, bl] = quad;
    const corner = sides.top ? (sides.left ? tl : tr) : (sides.left ? bl : br);
    dots.push({
      x: corner.x + (sides.left ? 1 : -2), y: corner.y + (sides.top ? 1 : -2),
      color: 'brassLight', alpha: 1, size: 2,
    });
    return { zone, wash: { quad, color: 'nightDeep', alpha: 0.26 }, lines, dots };
  }

  // 边上：栏的两端各一颗小钉
  for (const name of ['top', 'bottom', 'left', 'right']) {
    if (!sides[name]) continue;
    const [a, b] = edges[name];
    dots.push({ ...a, color: 'brassDark', alpha: 0.85, size: 1 });
    dots.push({ ...b, color: 'brassDark', alpha: 0.85, size: 1 });
  }
  return { zone, wash: null, lines, dots };
}
