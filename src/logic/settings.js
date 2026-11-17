// 玩家设置：音效 / 屏幕震动 / 新手引导。存 localStorage，坏档静默回落默认值。
// 纯逻辑、可注入 storage，窗口不存在时用内存桩，方便单测。
export const SETTINGS_KEY = 'sigilweave:settings:v1';

const DEFAULTS = Object.freeze({ sfx: true, shake: true, guide: true });

// 无 window（测试 / SSR）时的兜底：同一进程内共享，保证读到自己刚写的档。
const memoryStore = (() => {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, String(value)); },
    removeItem: (key) => { map.delete(key); },
  };
})();

function resolveStorage(storage) {
  if (storage && typeof storage.getItem === 'function') return storage;
  try {
    if (typeof window !== 'undefined' && window.localStorage
      && typeof window.localStorage.getItem === 'function') return window.localStorage;
  } catch {
    // 隐私模式 / 禁用存储：落到内存桩。
  }
  return memoryStore;
}

export function defaultSettings() {
  return { ...DEFAULTS };
}

// 坏档一律回落默认：设置坏了不能导致游戏进不去。
export function sanitizeSettings(raw) {
  let data = raw;
  if (typeof data === 'string') {
    try { data = JSON.parse(data); } catch { return defaultSettings(); }
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return defaultSettings();
  const out = defaultSettings();
  for (const key of Object.keys(DEFAULTS)) {
    if (typeof data[key] === 'boolean') out[key] = data[key];
  }
  return out;
}

export function loadSettings(storage) {
  try {
    return sanitizeSettings(resolveStorage(storage).getItem(SETTINGS_KEY));
  } catch {
    return defaultSettings();
  }
}

export function saveSettings(settings, storage) {
  const clean = sanitizeSettings(settings);
  try {
    resolveStorage(storage).setItem(SETTINGS_KEY, JSON.stringify(clean));
  } catch {
    // 写入失败（配额 / 隐私模式）也不影响本局内存里的设置。
  }
  return clean;
}

// 翻转一项设置并落盘的唯一入口：面板只需调它，不用自己拼对象。
export function toggleSetting(settings, key, storage) {
  if (!(key in DEFAULTS)) return sanitizeSettings(settings);
  const next = { ...sanitizeSettings(settings), [key]: !sanitizeSettings(settings)[key] };
  return saveSettings(next, storage);
}

// 设置项的中文标签与开关文案，UI 与文档共用一份，避免两处各写一遍。
export const SETTING_ROWS = Object.freeze([
  Object.freeze({ key: 'sfx', label: '音效', on: '开', off: '关', hint: '合成音，无外部音频文件' }),
  Object.freeze({ key: 'shake', label: '屏幕震动', on: '开', off: '关', hint: '关掉后挨打与 Boss 事件都不抖' }),
  Object.freeze({ key: 'guide', label: '新手引导', on: '开', off: '关', hint: '灵宠墨宝的机制提示' }),
]);

// 设置模块内的当前值缓存：场景内的开关读到的是最新的，不必每次回读 localStorage。
let current = null;

export function currentSettings() {
  if (!current) current = loadSettings();
  return current;
}

export function applySettings(settings, storage) {
  current = saveSettings(settings, storage);
  return current;
}

// 启动时把读到的档灌进缓存：之后各处 settingValue() 读到的是同一份，不必各自回读。
export function primeSettings(settings) {
  current = sanitizeSettings(settings);
  return current;
}

export function resetSettingsCache() {
  current = null;
}

export function settingValue(key) {
  return currentSettings()[key] !== false;
}
