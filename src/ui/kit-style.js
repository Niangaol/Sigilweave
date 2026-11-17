// 三套起手职业的「人物小配件」样式：只做颜色与形状，不新增美术图。
// 玩家立绘仍是同一张 player_sheet.png，这里只决定披风/胸章/法杖尖端的配色，
// 让同一个人物在三个职业下轮廓一致、气质可辨。
import { C } from './Palette.js';

export const KIT_STYLES = Object.freeze({
  // 疾风：青蓝披风 + 翼形胸章，法杖尖端冷青
  bolt: Object.freeze({
    accent: C.teal,
    accentLight: C.runeCold,
    cape: 0x2f6f6c,
    capeDark: 0x1f4a48,
    emblem: 'wing',
  }),
  // 烈焰：橙金披风 + 余烬胸章，法杖尖端暖橙
  flame: Object.freeze({
    accent: C.arcane,
    accentLight: C.arcaneLight,
    cape: 0x8a2f28,
    capeDark: 0x5a1f1c,
    emblem: 'ember',
  }),
  // 壁垒：黄铜披风 + 盾形胸章，法杖尖端骨金
  ward: Object.freeze({
    accent: C.brassLight,
    accentLight: C.parchment,
    cape: 0x7a621f,
    capeDark: 0x4f3f12,
    emblem: 'ward',
  }),
});

// 未知 kit（老存档、调试参数）返回 null，人物保持原样。
export function kitStyle(kitId) {
  return Object.hasOwn(KIT_STYLES, kitId) ? KIT_STYLES[kitId] : null;
}
