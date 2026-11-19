// 玩家测试夹具：不接真实渲染器也能跑 Player 的全部纯逻辑方法。
// 照 tests/player-kits.test.js 的既有写法扩展：add.graphics() 给可链式调用的假 Graphics，
// textures.exists() 恒 false 让人物走程序化回退分支，add.sprite 干脆不提供。
// 选「假场景 + 真构造函数」而不是 Object.create(Player.prototype) 手搓字段：
// 构造路径本身（含 kitStyle、invulnUntil 等初值）也是被测行为的一部分，
// 且 Player 后续加字段时夹具不用跟着改，漏测风险更小。
import Player from '../../src/entities/Player.js';

function fakeGraphics() {
  return {
    rects: [],
    color: null,
    alpha: 1,
    fillStyle(color, alpha = 1) { this.color = color; this.alpha = alpha; },
    fillRect(x, y, w, h) { this.rects.push({ x, y, w, h, color: this.color, alpha: this.alpha }); },
    clear() { this.rects.length = 0; },
    setDepth() { return this; },
    setAlpha() { return this; },
    destroy() {},
  };
}

export function FakeScene(kitId) {
  const g = fakeGraphics();
  return {
    g,
    run: kitId === undefined ? {} : { kitId },
    engine: { now: 0 },
    add: { graphics: () => g },
    textures: { exists: () => false },
    addHostileShot() {},
  };
}

export function makePlayer(x = 240, y = 135) {
  return new Player(FakeScene(), x, y);
}
