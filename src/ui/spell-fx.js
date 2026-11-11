// v2（2026-11-09）实现已拆分到 src/ui/spell-fx/ 下：
//   kit.js          —— 粗笔画 / 实心体积 / 时间包络 / 锥形丝带拖尾
//   spells/cold.js   寒霜箭 奥术飞弹 回声符印 秘能汲取
//   spells/hot.js    烈焰喷涌 余烬扇 星陨 陨星裁决
//   spells/storm.js  连锁闪电 贯穿长枪 裁决之锤 地裂之颚
//   spells/wild.js   荆棘藤蔓 噬魂之矛 圣光壁垒 圣盾之环
//   index.js        —— 合并 + 分派（对外 6 个函数签名与 v1 完全一致）
// 本文件只做转发，任何接线处继续 import './spell-fx.js' 即可。
export * from './spell-fx/index.js';
