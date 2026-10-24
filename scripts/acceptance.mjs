// 构建完成、静态服务器启动后执行；一项失败即非零退出，不吞掉子进程错误。
import { spawnSync } from 'node:child_process';
const scripts = ['layout-smoke', 'workshop-smoke', 'encounter-smoke', 'three-act-smoke', 'progression-smoke', 'loadout-smoke', 'help-smoke', 'pause-edit-smoke', 'rewards-smoke', 'targeting-smoke', 'balance-acceptance', 'stress'];
for (const script of scripts) {
  console.log('\n=== ACCEPTANCE ' + script + ' ===');
  const result = spawnSync(process.execPath, ['scripts/' + script + '.mjs'], { stdio: 'inherit', env: { ...process.env, BASE_URL: process.env.BASE_URL ?? 'http://127.0.0.1:4173', LONG: '1' } });
  if (result.error) { console.error(result.error); process.exit(1); }
  if (result.status !== 0) { console.error('ACCEPTANCE_FAILED', script, result.status); process.exit(result.status ?? 1); }
  console.log('ACCEPTANCE_PASS', script);
}
console.log('ACCEPTANCE_ALL_PASS', scripts.length);
