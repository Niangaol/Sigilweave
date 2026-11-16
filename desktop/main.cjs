// Sigilweave 桌面壳：内置本地静态服务 + 全屏游戏窗口
// 打包后双击 Sigilweave.exe 即可游玩，无需 Node / 浏览器 / 网络
const electron = require('electron');
const http = require('node:http');

// 兼容「被当作 Node 进程启动」的场景（例如从设置了 ELECTRON_RUN_AS_NODE=1 的终端里运行）：
// 此时拿不到 app 对象，改为用干净环境重新拉起自己。
if (!electron || !electron.app) {
  const os = require('node:os');
  const report = (msg) => {
    try {
      require('node:fs').appendFileSync(require('node:path').join(os.tmpdir(), 'sigilweave-relaunch.log'), '[' + new Date().toISOString() + '] ' + msg + '\n');
    } catch {}
  };
  try {
    const { spawn } = require('node:child_process');
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    const child = spawn(process.execPath, ['--no-sandbox'], { detached: true, stdio: 'ignore', env, cwd: process.cwd() });
    child.on('error', (e) => report('spawn error ' + e.message));
    child.on('exit', (code) => report('child exit ' + code));
    child.unref();
    report('spawned pid=' + child.pid + ' exec=' + process.execPath);
  } catch (e) {
    report('throw ' + e.message);
  }
  setTimeout(() => process.exit(0), 300);
}

const { app, BrowserWindow, Menu, powerSaveBlocker } = electron;
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, 'dist');
const DEBUG_LOG = process.env.SIGILWEAVE_DEBUG ? path.join(process.env.TEMP || __dirname, 'sigilweave-main.log') : null;
function log(...parts) {
  if (!DEBUG_LOG) return;
  try {
    fs.appendFileSync(DEBUG_LOG, '[' + new Date().toISOString() + '] ' + parts.join(' ') + '\n', 'utf8');
  } catch {}
}

const PORT_START = 47821;
const PORT_MAX = 47860;
const WINDOW_FILE = () => path.join(app.getPath('userData'), 'window-state.json');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.map': 'application/json; charset=utf-8',
};

let mainWindow = null;
let httpServer = null;
let sleepBlocker = 0;

function serve(req, res) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
  } catch {
    res.writeHead(400).end('bad request');
    return;
  }
  if (pathname === '/' || pathname === '') pathname = '/index.html';
  const filePath = path.join(ROOT, pathname);
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403).end('forbidden');
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'Content-Length': data.length,
    });
    res.end(data);
  });
}

function listenOn(port) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(serve);
    server.once('error', (err) => {
      server.close();
      if (err.code === 'EADDRINUSE' && port < PORT_MAX) resolve(listenOn(port + 1));
      else reject(err);
    });
    server.listen(port, '127.0.0.1', () => resolve({ server, port }));
  });
}

function loadWindowState() {
  const fallback = { width: 1280, height: 760 };
  try {
    const raw = JSON.parse(fs.readFileSync(WINDOW_FILE(), 'utf8'));
    if (Number.isFinite(raw.width) && Number.isFinite(raw.height)) {
      return { width: Math.max(960, raw.width), height: Math.max(600, raw.height), x: raw.x, y: raw.y, maximized: !!raw.maximized };
    }
  } catch {}
  return fallback;
}

function saveWindowState(win) {
  if (!win || win.isDestroyed()) return;
  const bounds = win.getNormalBounds ? win.getNormalBounds() : win.getBounds();
  try {
    fs.writeFileSync(WINDOW_FILE(), JSON.stringify({ ...bounds, maximized: win.isMaximized() }), 'utf8');
  } catch {}
}

function createWindow(port) {
  const state = loadWindowState();
  mainWindow = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#0d0a17',
    title: '共振法阵 Sigilweave',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      backgroundThrottling: false,
      webgl: true,
      zoomFactor: 1.0,
    },
  });

  mainWindow.setMenuBarVisibility(false);
  if (state.maximized) mainWindow.maximize();

  mainWindow.webContents.setVisualZoomLevelLimits(1, 1).catch(() => {});
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  // F11 / Alt+Enter 全屏切换，Esc 退出全屏
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const key = (input.key || '').toLowerCase();
    if (key === 'f11' || (input.alt && key === 'enter')) {
      mainWindow.setFullScreen(!mainWindow.isFullScreen());
      event.preventDefault();
    } else if (key === 'escape' && mainWindow.isFullScreen()) {
      mainWindow.setFullScreen(false);
      event.preventDefault();
    }
  });

  mainWindow.on('focus', () => {
    if (!sleepBlocker) sleepBlocker = powerSaveBlocker.start('prevent-display-sleep');
  });
  mainWindow.on('blur', () => {
    if (sleepBlocker) {
      powerSaveBlocker.stop(sleepBlocker);
      sleepBlocker = 0;
    }
  });

  mainWindow.on('close', () => saveWindowState(mainWindow));
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.loadURL('http://127.0.0.1:' + port + '/index.html');
  return mainWindow;
}

log('boot pid=' + process.pid + ' argv=' + process.argv.join(' '));
process.on('uncaughtException', (err) => log('uncaughtException ' + (err && err.stack ? err.stack : err)));
process.on('unhandledRejection', (err) => log('unhandledRejection ' + (err && err.stack ? err.stack : err)));
app.on('will-quit', () => log('will-quit'));
app.on('quit', () => log('quit'));

// 存档/窗口状态放到 LocalAppData，避免 Roaming 权限问题时启动失败
try {
  const base = process.env.LOCALAPPDATA || app.getPath('appData');
  const userDataDir = path.join(base, 'Sigilweave');
  // 必须先把目录建出来，否则 Chromium 的 disk cache / IndexedDB 会报 0x3 并放弃写入存档
  fs.mkdirSync(userDataDir, { recursive: true });
  app.setPath('userData', userDataDir);
  app.setPath('sessionData', userDataDir);
  log('userData=' + userDataDir);
} catch (e) {
  log('userData-setup-failed ' + e.message);
}

// 单实例锁只作为「已开一个就聚焦它」的优化，锁失败不影响启动；
// 真正的重复启动判定以本地端口是否全部占用为准（见 listenOn 的兜底）。
const gotLock = app.requestSingleInstanceLock();
log('singleInstanceLock=' + gotLock);
if (!gotLock) log('lock-false-but-continue');
{
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });

  app.whenReady().then(async () => {
    log('whenReady');
    app.setAppUserModelId('com.niangaol.sigilweave');
    Menu.setApplicationMenu(null);
    if (!fs.existsSync(path.join(ROOT, 'index.html'))) {
      const { dialog } = require('electron');
      dialog.showErrorBox('资源缺失', '找不到游戏资源目录 dist\\index.html。\n请解压完整压缩包后再运行。');
      app.quit();
      return;
    }
    try {
      const { server, port } = await listenOn(PORT_START);
      httpServer = server;
      log('listening port=' + port);
      createWindow(port);
      log('window created');
    } catch (err) {
      const { dialog } = require('electron');
      dialog.showErrorBox('启动失败', '无法启动本地服务：' + (err && err.message ? err.message : String(err)));
      app.quit();
    }
  });

  app.on('window-all-closed', () => {
    if (httpServer) httpServer.close();
    app.quit();
  });
}
