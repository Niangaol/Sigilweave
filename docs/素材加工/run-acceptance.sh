# 《共振法阵》素材接入验收批处理（2026-10-24 实测通过）
# 注意：sprites-shot.mjs 的动态 import 需要 dev server（/src 路径只在 dev 下有效）；
#       battle-shot.mjs 等既有脚本用 dist + static-server 即可。
set -e
cd "$(dirname "$0")"

echo "== 1/5 构建 =="
npm run build

echo "== 2/5 dev server（供素材脚本）=="
npx vite --port 5180 &
DEV=$!
sleep 3

echo "== 3/5 素材实机验收 =="
BASE_URL=http://localhost:5180 node scripts/sprites-shot.mjs

echo "== 4/5 静态服 + 既有战斗回归 =="
node scripts/static-server.mjs dist 4174 &
SRV=$!
sleep 1
BASE_URL=http://localhost:4174 node scripts/battle-shot.mjs

kill $DEV $SRV 2>/dev/null || true
echo "ALL DONE"
# 已知既有失败（与本次素材接入无关，HEAD 上同样复现）：
#   variants-smoke.mjs 断言 plain.starts===1，但 constants.js 提交值 act1 starts=2（测试/配置漂移）
