// 玩家设置：音效 / 震屏 / 引导的存取与生效（含首页「设置」面板的开关语义）。
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  SETTINGS_KEY, SETTING_ROWS, defaultSettings, sanitizeSettings, loadSettings, saveSettings,
  toggleSetting, primeSettings, currentSettings, resetSettingsCache, settingValue,
} from '../src/logic/settings.js';
import { shakeCamera, createShakeGate } from '../src/ui/camera-shake.js';

const root = resolve(import.meta.dirname, '..');

function fakeStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

afterEach(() => resetSettingsCache());

describe('设置存取', () => {
  it('默认三项全开', () => {
    expect(defaultSettings()).toEqual({ sfx: true, shake: true, guide: true });
  });

  it('坏档一律回落默认，不抛错', () => {
    for (const bad of [null, undefined, 42, '[]', '{', [], { sfx: 'no' }]) {
      const clean = sanitizeSettings(bad);
      expect(clean.sfx).toBe(true);
      expect(clean.shake).toBe(true);
      expect(clean.guide).toBe(true);
    }
  });

  it('只认布尔值，其余键忽略', () => {
    expect(sanitizeSettings({ sfx: false, shake: 0, guide: 'x', extra: 1 })).toEqual({
      sfx: false, shake: true, guide: true,
    });
  });

  it('存进 storage 再读回来一致', () => {
    const store = fakeStorage();
    saveSettings({ sfx: false, shake: false, guide: true }, store);
    expect(store.map.has(SETTINGS_KEY)).toBe(true);
    expect(loadSettings(store)).toEqual({ sfx: false, shake: false, guide: true });
  });

  it('读不到档时是默认值', () => {
    expect(loadSettings(fakeStorage())).toEqual(defaultSettings());
  });

  it('toggleSetting 只翻一项，未知键原样返回', () => {
    const store = fakeStorage();
    let s = loadSettings(store);
    s = toggleSetting(s, 'shake', store);
    expect(s).toEqual({ sfx: true, shake: false, guide: true });
    expect(loadSettings(store).shake).toBe(false);
    expect(toggleSetting(s, 'nope', store)).toEqual(s);
  });

  it('面板行与设置键一一对应，文案给全', () => {
    expect(SETTING_ROWS.map((r) => r.key)).toEqual(['sfx', 'shake', 'guide']);
    for (const row of SETTING_ROWS) {
      expect(row.label.length).toBeGreaterThan(0);
      expect(row.on).toBe('开');
      expect(row.off).toBe('关');
      expect(row.hint.length).toBeGreaterThan(0);
    }
  });

  it('primeSettings 之后 settingValue 读的是这份缓存', () => {
    resetSettingsCache();
    expect(settingValue('shake')).toBe(true);
    primeSettings({ sfx: true, shake: false, guide: false });
    expect(settingValue('shake')).toBe(false);
    expect(settingValue('guide')).toBe(false);
    expect(currentSettings().sfx).toBe(true);
  });
});

describe('设置生效', () => {
  const scene = () => {
    const calls = [];
    return {
      calls,
      cameras: { main: { shake: (ms, amp) => calls.push([ms, amp]) } },
      engine: { now: 1000 },
      shakeGate: createShakeGate(),
    };
  };

  it('关掉震屏后 shakeCamera 不再碰相机', () => {
    primeSettings({ sfx: true, shake: false, guide: true });
    const s = scene();
    expect(shakeCamera(s, 'major', 120, 0.005)).toBe(false);
    expect(s.calls).toEqual([]);
  });

  it('开着时照常震一次', () => {
    primeSettings({ sfx: true, shake: true, guide: true });
    const s = scene();
    expect(shakeCamera(s, 'major', 120, 0.005)).toBe(true);
    expect(s.calls).toEqual([[120, 0.005]]);
  });

  it('BootScene 启动时把设置灌进音效与缓存', () => {
    const src = readFileSync(resolve(root, 'src/scenes/BootScene.js'), 'utf8');
    expect(src).toContain('primeSettings(settings)');
    expect(src).toContain('setSoundEnabled(settings.sfx)');
  });

  it('引导开关也读设置（关掉后 guideEnabled 为假）', async () => {
    const { guideEnabled } = await import('../src/logic/guide.js');
    primeSettings({ sfx: true, shake: true, guide: false });
    expect(guideEnabled(new URLSearchParams(''))).toBe(false);
    primeSettings({ sfx: true, shake: true, guide: true });
    expect(guideEnabled(new URLSearchParams(''))).toBe(true);
    expect(guideEnabled(new URLSearchParams('guide=0'))).toBe(false);
  });
});
