// 开局法术套装冒烟：标题 → 选包 → 战斗；核对三张卡、按键高亮、run 与所选 kit 一致。
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { STARTING_KITS } from '../src/logic/run.js';
import { SIGIL_DEFS } from '../src/data/cards.js';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5173';
const KIT_NAMES = STARTING_KITS.map(kit => kit.name);
const KIT_SPELLS = new Set(STARTING_KITS.flatMap(kit => Object.values(kit.slots).map(slot => SIGIL_DEFS[slot.defId].name)));

const browser = await chromium.launch({ channel: 'msedge' });
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE + '/?seed=loadout-smoke');
  await page.waitForFunction(() => window.__SIGILWEAVE__?.scene.isActive('TitleScene'));

  // 标题 Enter → 选包场景；句柄必须立刻可读
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__SIGILWEAVE__?.scene.isActive('LoadoutScene'));
  await page.waitForFunction(() => window.__SIGILWEAVE_LOADOUT__?.started === false);
  // 等镜头淡入结束再截图，否则会拍到半黑的过渡帧
  await page.waitForFunction(() => {
    const scene = window.__SIGILWEAVE__?.scene.getScene('LoadoutScene');
    return scene && !scene.cameras.main.fadeEffect.isRunning;
  });

  const cards = await page.evaluate(({ names, kitSpells }) => {
    const scene = window.__SIGILWEAVE__.scene.getScene('LoadoutScene');
    const texts = [];
    const walk = list => {
      for (const o of list) {
        if (o.type === 'Text') texts.push(o.text);
        else if (o.type === 'Container') walk(o.list);
      }
    };
    walk(scene.children.list);
    return {
      title: texts.includes('选择初始法术套装'),
      kitNames: names.filter(name => texts.includes(name)),
      spellRows: texts.filter(text => kitSpells.includes(text)).length,
      sectors: texts.filter(text => /^(上|下)(左|右)(近|远)$/.test(text)).length,
      handle: { ...window.__SIGILWEAVE_LOADOUT__ },
    };
  }, { names: KIT_NAMES, kitSpells: [...KIT_SPELLS] });
  assert.equal(cards.title, true, '应显示标题「选择初始法术套装」');
  assert.deepEqual(cards.kitNames, KIT_NAMES, '应并排展示三张套装卡');
  assert.equal(cards.spellRows, 12, '三张卡各四张法术名');
  assert.equal(cards.sectors, 12, '每张法术都要标出方位');
  assert.deepEqual(cards.handle, { kitId: 'bolt', started: false });

  // 鼠标点击第三张卡（容器内 zone）也要能选中
  await page.mouse.click(396 * 2, 130 * 2, { delay: 40 });
  await page.waitForFunction(() => window.__SIGILWEAVE_LOADOUT__?.kitId === 'ward');

  // 数字键 2 选第二套：句柄与名称高亮都要变化
  await page.keyboard.press('Digit2');
  await page.waitForFunction(() => window.__SIGILWEAVE_LOADOUT__?.kitId === 'flame');
  const highlight = await page.evaluate(() => {
    const scene = window.__SIGILWEAVE__.scene.getScene('LoadoutScene');
    const texts = [];
    const walk = list => {
      for (const o of list) {
        if (o.type === 'Text') texts.push(o);
        else if (o.type === 'Container') walk(o.list);
      }
    };
    walk(scene.children.list);
    const byName = name => texts.find(t => t.text === name);
    return {
      selected: byName('烈焰')?.style.color,
      unselected: ['疾风', '壁垒'].map(name => byName(name)?.style.color),
      badge: texts.some(t => t.text.includes('已选')),
      handle: { ...window.__SIGILWEAVE_LOADOUT__ },
    };
  });
  assert.deepEqual(highlight.handle, { kitId: 'flame', started: false });
  assert.equal(highlight.selected, '#ffd79a', '选中的卡名应高亮为暖金色');
  assert(highlight.unselected.every(color => color && color !== '#ffd79a'), '未选中的卡不应高亮');
  assert.equal(highlight.badge, true, '选中卡应出现「已选」提示');
  await page.screenshot({ path: 'docs/p6-开局套装.png' });

  // Enter 进入战斗：run 必须与「烈焰」套装槽位完全一致
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__SIGILWEAVE_LOADOUT__?.started === true);
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.run, null, { timeout: 15000 });
  const battle = await page.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    return {
      seed: s.run.seed,
      act: s.run.act,
      unlocked: structuredClone(s.run.draft.unlocked),
      slots: structuredClone(s.run.draft.slots),
      cells: s.grid.unlockedIds().length,
    };
  });
  const flame = STARTING_KITS.find(kit => kit.id === 'flame');
  assert.deepEqual(battle.slots, JSON.parse(JSON.stringify(flame.slots)), '战斗 run 的槽位应与所选套装一致');
  assert.equal(battle.seed, 'loadout-smoke', 'URL ?seed= 应带进战斗 run');
  assert.equal(battle.act, 1);
  assert.equal(battle.unlocked.length, 6);
  assert.deepEqual(battle.unlocked, [4, 5, 6, 7, 9, 10]);
  assert.equal(battle.cells, 6);
  assert.equal(errors.length, 0, errors.join('; '));

  // ?scene=battle 调试直达仍要绕开选包，直接用第一套（bolt）开局
  const direct = await browser.newPage({ viewport: { width: 960, height: 540 } });
  await direct.goto(BASE + '/?scene=battle&seed=direct');
  await direct.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.run);
  const jumped = await direct.evaluate(() => ({
    loadout: !!window.__SIGILWEAVE_LOADOUT__,
    seed: window.__SIGILWEAVE_BATTLE__.run.seed,
    slots: structuredClone(window.__SIGILWEAVE_BATTLE__.run.draft.slots),
  }));
  await direct.close();
  assert.equal(jumped.loadout, false, '?scene=battle 不应经过选包场景');
  assert.equal(jumped.seed, 'direct');
  assert.deepEqual(jumped.slots, JSON.parse(JSON.stringify(STARTING_KITS[0].slots)));

  console.log(JSON.stringify({
    kitNames: cards.kitNames,
    selected: highlight.handle.kitId,
    battle: { seed: battle.seed, act: battle.act, unlocked: battle.unlocked, slots: battle.slots },
    directBattle: { loadoutSkipped: !jumped.loadout, seed: jumped.seed },
    errors,
  }));
} finally {
  await browser.close();
}
