// 沙箱专用构建预加载：vite 的 optimizeSafeRealPathSync 会 exec("net use") 探测映射网络驱动器，
// 而本机沙箱禁止 node 起子进程（spawn EPERM），构建会在加载 vite.config.js 时直接失败。
// 这里只把针对 "net use" 的 exec 换成空输出回调（本机无映射驱动器，空输出等价于"无映射"），
// 其它命令原样透传。用法：$env:NODE_OPTIONS='--require ./scripts/sandbox-netuse.cjs'; npm run build
const cp = require('node:child_process');
const realExec = cp.exec;
cp.exec = function patchedExec(cmd, opts, cb) {
  if (typeof cmd === 'string' && cmd.trim() === 'net use') {
    const done = typeof opts === 'function' ? opts : cb;
    if (typeof done === 'function') process.nextTick(() => done(null, '', ''));
    return { on() {}, once() {}, kill() {} };
  }
  return realExec.apply(this, arguments);
};
