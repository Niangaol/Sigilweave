// 敌人行为纯逻辑层入口（barrel）：对外导出面与重构前完全一致。
// 实现拆分（2026-11-19 架构重构波 4）：
//   logic/enemy/rng.js       确定性伪随机
//   logic/enemy/motion.js    移动工具（取整/夹紧/接近/环带）
//   logic/enemy/attack.js    攻击工具（预警/抬手/弹幕/召唤/近战）
//   logic/enemy/behaviors.js 26 个行为状态机 + 分派表
//   logic/enemy/index.js     createBrain / stepBrain
export * from '../data/enemy-tables.js';
export * from './enemy/index.js';
export * from './enemy/behaviors.js';
