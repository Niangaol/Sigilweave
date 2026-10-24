// 发布核对：首页200、生产JS文件名匹配本地构建、同一JS资源200。
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const base = process.env.PAGES_URL ?? 'https://niangaol.github.io/Sigilweave/';
const local = await readFile('dist/index.html', 'utf8');
const expected = local.match(/src="([^"]+[.]js)"/)?.[1];
assert(expected, '本地构建必须有JS入口');
const page = await fetch(base + '?verify=' + Date.now());
assert.equal(page.status, 200, 'Pages首页HTTP200');
const html = await page.text();
const actual = html.match(/src="([^"]+[.]js)"/)?.[1];
assert.equal(actual, expected, 'Pages必须部署本次构建而非旧包');
const assetUrl = new URL(actual, base).href;
const asset = await fetch(assetUrl);
assert.equal(asset.status, 200, 'PagesJS资源HTTP200');
await asset.arrayBuffer();
console.log(JSON.stringify({ page: base, pageStatus: page.status, assetUrl, assetStatus: asset.status, expectedBundle: expected, deployedBundle: actual }));
