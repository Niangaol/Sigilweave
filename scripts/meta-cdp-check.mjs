// 残响祭坛验收（原生 CDP 版）：连到 --remote-debugging-port 启动的 Edge，不依赖 Playwright spawn。
// 用法：先 Start-Process msedge --headless=new --remote-debugging-port=9333 ... 再 node scripts/meta-cdp-check.mjs
import { writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4174';
const CDP = process.env.CDP_URL ?? 'http://127.0.0.1:9333';
const version = await (await fetch(CDP + '/json/version')).json();
const ws = new WebSocket(version.webSocketDebuggerUrl);
const pending = new Map();
let nextId = 0;
const once = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  const waiters = once.get(m.method);
  if (waiters?.length) { const fn = waiters.shift(); fn(m.params); }
};
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
const send = (method, params = {}, sessionId) => new Promise((res, rej) => {
  const id = ++nextId;
  pending.set(id, (m) => (m.error ? rej(new Error(method + ': ' + JSON.stringify(m.error))) : res(m.result)));
  ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  setTimeout(() => { if (pending.delete(id)) rej(new Error('timeout ' + method)); }, 15000);
});
const waitEvent = (method, ms = 15000) => new Promise((res, rej) => {
  const arr = once.get(method) ?? [];
  arr.push(res); once.set(method, arr);
  setTimeout(() => rej(new Error('event timeout ' + method)), ms);
});

const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
const S = (method, params) => send(method, params, sessionId);
await S('Page.enable');
await S('Runtime.enable');
// 逻辑画布 480×270，按 2 倍截图（960×540）方便肉眼验收
await S('Emulation.setDeviceMetricsOverride', { width: 960, height: 540, deviceScaleFactor: 1, mobile: false });
await S('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {}); // headless 下 canvas 可能被降频，强制前台焦点
await S('Page.bringToFront').catch(() => {});

const evaluate = async (expression) => {
  const out = await S('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (out.exceptionDetails) throw new Error('JS 异常: ' + (out.exceptionDetails.exception?.description ?? out.exceptionDetails.text));
  return out.result.value;
};
const waitFor = async (expression, label, ms = 15000) => {
  const t0 = Date.now();
  for (;;) {
    try { if (await evaluate(expression)) return; } catch { /* 页面还没 ready，继续等 */ }
    if (Date.now() - t0 > ms) throw new Error('等待超时: ' + label + ' → ' + expression);
    await new Promise((r) => setTimeout(r, 120));
  }
};
const goto = async (url) => {
  const loaded = waitEvent('Page.loadEventFired');
  await S('Page.navigate', { url });
  await loaded.catch(() => {});
};
const KEY = { Enter: 13, Tab: 9, Escape: 27, ArrowUp: 38, ArrowDown: 40, KeyB: 66 };
const press = async (name) => {
  const code = KEY[name] ?? name;
  const key = name === 'KeyB' ? 'b' : name;
  await S('Input.dispatchKeyEvent', { type: 'keyDown', key, code: name, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code });
  await S('Input.dispatchKeyEvent', { type: 'keyUp', key, code: name, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code });
  await new Promise((r) => setTimeout(r, 90)); // 模拟真人按键间隔，避免和 70ms 导航去抖打架
};
const shot = async (name) => {
  // 开场过场还盖着的话先等它揭开，再强制重绘一帧，否则截到的是祭坛过场或上一页
  await waitFor("!window.__SIGILWEAVE__?.scene?.isActive('CutsceneScene')", '过场结束', 8000).catch(() => {});
  await evaluate("(() => { const g = window.__SIGILWEAVE__; if (!g) return 0; const live = g.scene.getScenes(true); for (const sc of live) if (typeof sc.redraw === 'function') sc.redraw(); return live.length; })()");
  await S('Page.captureScreenshot', { format: 'png' });
  await evaluate('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 120))))');
  const { data } = await S('Page.captureScreenshot', { format: 'png' });
  writeFileSync('docs/' + name, Buffer.from(data, 'base64'));
  return name;
};

try {
  // 0) 清档：本地存档会跨验收残留
  await goto(BASE + '/');
  await evaluate('localStorage.clear(); true');

  // 1) 直达祭坛 + ?resonance=999
  await goto(BASE + '/?scene=meta&resonance=999');
  await waitFor('window.__SIGILWEAVE_META__?.save', '祭坛载入');
  const first = await evaluate('({ page: window.__SIGILWEAVE_META__.page, resonance: window.__SIGILWEAVE_META__.save.resonance, selected: window.__SIGILWEAVE_META__.selected, leveled: Object.values(window.__SIGILWEAVE_META__.save.levels).filter((n) => n > 0).length })');
  assert.equal(first.page, 0, '默认停在被动升级页');
  assert.equal(first.resonance, 999, '?resonance=999 应灌满残响');
  assert.equal(first.leveled, 0, '新档 11 条被动全 0 级');
  assert.equal(typeof first.selected, 'string', 'selected 应是被动 id');
  await shot('p7-残响祭坛-被动页.png');

  // 2) Enter 升一级：等级 +1，残响 -10
  await press('Enter');
  await new Promise((r) => setTimeout(r, 120));
  const afterOne = await evaluate('({ lv: window.__SIGILWEAVE_META__.save.levels[window.__SIGILWEAVE_META__.selected], resonance: window.__SIGILWEAVE_META__.save.resonance, msg: window.__SIGILWEAVE_META__.lastMessage })');
  assert.equal(afterOne.lv, 1, 'Enter 应升到 Lv1');
  assert.equal(afterOne.resonance, 989, '升级应扣 10 残响');
  await shot('p7-残响祭坛-升级后.png');

  // 3) 再按两次：到默认上限 2 后被拦，给出「需先首杀」
  await press('Enter');
  await new Promise((r) => setTimeout(r, 120));
  await press('Enter');
  await new Promise((r) => setTimeout(r, 120));
  const capped = await evaluate('({ lv: window.__SIGILWEAVE_META__.save.levels[window.__SIGILWEAVE_META__.selected], resonance: window.__SIGILWEAVE_META__.save.resonance, msg: window.__SIGILWEAVE_META__.lastMessage })');
  assert.equal(capped.lv, 2, '默认上限 2 级');
  assert.equal(capped.resonance, 965, '第二次升级扣 24，第三次被拦不再扣');
  assert.match(String(capped.msg), /上限|首杀/, '到上限应提示');
  await shot('p7-残响祭坛-上限提示.png');

  // 4) 方向键换到罗盘列
  for (let i = 0; i < 4; i++) await press('ArrowDown');
  const moved = await evaluate('window.__SIGILWEAVE_META__.selected');
  assert.equal(moved, 'aegis', '人物列第 5 条应是 aegis');
  await press('ArrowDown');
  const crossed = await evaluate('window.__SIGILWEAVE_META__.selected');
  assert.equal(crossed, 'might', '列尾再按 ↓ 应翻到罗盘列第一条');
  await shot('p7-残响祭坛-罗盘列.png');

  // 5) Tab 切契约图鉴
  await press('Tab');
  await waitFor('window.__SIGILWEAVE_META__.page === 1', '切到图鉴页');
  const codex = await evaluate('({ unlocked: window.__SIGILWEAVE_META__.save.milestones.length })');
  assert.equal(codex.unlocked, 0, '新档无契约节点');
  await shot('p7-残响祭坛-契约图鉴.png');
  await press('Tab');
  await waitFor('window.__SIGILWEAVE_META__.page === 0', '切回祭坛页');

  // 6) Esc 回标题，再按 B 进祭坛
  await press('Escape');
  await waitFor("window.__SIGILWEAVE__?.scene?.isActive('TitleScene')", '回到标题');
  await press('KeyB');
  await waitFor("window.__SIGILWEAVE__?.scene?.isActive('MetaScene')", 'B 键进入祭坛');

  // 7) 结算：死亡一次拿到残响，存档累加
  await goto(BASE + '/?scene=gameover');
  await waitFor('window.__SIGILWEAVE_META__?.lastSettle !== undefined', '结算页写入钩子');
  const settled = await evaluate('({ gained: window.__SIGILWEAVE_META__.lastSettle.gained, total: window.__SIGILWEAVE_META__.save.resonance })');
  assert.equal(settled.gained, 0, '?scene=gameover 排版调试页不结算');
  assert.ok(settled.total > 0, '调试页仍显示档案残响');
  await shot('p7-结算页-残响行.png');

  console.log('META_CDP_OK', JSON.stringify({ first, afterOne, capped, codex, settled }));
} finally {
  await send('Target.closeTarget', { targetId }).catch(() => {});
  ws.close();
}
