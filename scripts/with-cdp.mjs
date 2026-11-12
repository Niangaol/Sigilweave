// 用 CDP 端口起 Edge 再跑截图脚本：沙箱禁止命名管道，Playwright 直接 launch 会 EPERM。
// 用法：node scripts/with-cdp.mjs scripts/cutscene-shot.mjs
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const PORT = Number(process.env.PW_CDP_PORT ?? 9333);
const EDGE = process.env.PW_EDGE ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const TMP = path.resolve('.tmp/pw-cdp');
fs.mkdirSync(TMP, { recursive: true });

const target = process.argv[2];
if (!target) {
  console.error('用法: node scripts/with-cdp.mjs <script.mjs>');
  process.exit(1);
}

const edge = spawn(EDGE, [
  '--headless=new',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${path.join(TMP, 'profile')}`,
  '--no-first-run', '--no-default-browser-check', '--hide-scrollbars',
  '--mute-audio', '--no-sandbox', 'about:blank',
], { stdio: 'ignore', windowsHide: true });

async function waitForCdp() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (res.ok) return (await res.json()).webSocketDebuggerUrl;
    } catch { /* 还没起来 */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('Edge CDP 端口没起来');
}

let code = 0;
try {
  const ws = await waitForCdp();
  process.env.PW_CDP_URL = ws;
  process.env.PW_SCRIPT_ARGS = JSON.stringify(process.argv.slice(3));
  await import(pathToFileURL(path.resolve(target)).href);
} catch (err) {
  console.error(err);
  code = 1;
} finally {
  try { edge.kill(); } catch { /* 忽略 */ }
  setTimeout(() => process.exit(code), 300);
}
