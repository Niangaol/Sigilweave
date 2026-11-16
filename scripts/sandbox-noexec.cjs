// 沙箱救急：DSH 工作区沙箱禁止子进程管道，vite 在 Windows 上会 exec('net use')，
// 一旦 spawn 被拒（EPERM）就整场测试起不来。这里把 exec 换成同步回调的空实现，
// 让 vite 走 fs.realpathSync 的普通分支。仅在本地受控环境用于跑测试。
const cp = require('node:child_process');
const disabled = (cmd, opts, cb) => {
  const done = typeof opts === 'function' ? opts : cb;
  if (typeof done === 'function') done(new Error('sandbox: child_process disabled'), '', '');
  return { on() {}, once() {}, kill() {}, unref() {}, stdout: null, stderr: null };
};
cp.exec = disabled;
cp.execSync = () => '';
