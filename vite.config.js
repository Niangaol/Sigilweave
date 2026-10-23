// 共振法阵 · Vite 配置（P1 战斗纵切）
// 约束：开发端口固定，构建产物相对路径，便于直接双击 dist/index.html 之外的静态托管。
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    // 原子编辑产生的短命临时目录不是源码，Windows下监听它们会报EBUSY。
    watch: { ignored: ['**/*.tmpdir', '**/*.tmpdir/**', '**/*.tmp'] },
  },
  build: {
    target: 'es2020',
    // Phaser 单包体积较大，这是预期值，不让它把构建日志刷成失败提示
    chunkSizeWarningLimit: 1800,
  },
});
