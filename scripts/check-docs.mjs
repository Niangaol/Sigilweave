import { readFile, readdir, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

const roots = ["README.md", "THIRD_PARTY_NOTICES.md", ...(await readdir("docs")).filter(f => f.endsWith(".md")).map(f => join("docs", f))];
const missing = [];
for (const file of roots) {
  const text = await readFile(file, "utf8");
  for (const m of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    let target = m[1].trim();
    if (/^(https?:|mailto:|#)/.test(target)) continue;
    target = target.split("#")[0];
    if (!target) continue;
    const path = resolve(dirname(file), decodeURIComponent(target.replace(/^</, "").replace(/>$/, "")));
    try { const s = await stat(path); if (!s.isFile() && !s.isDirectory()) missing.push({ file, target }); }
    catch { missing.push({ file, target }); }
  }
}
console.log(JSON.stringify({ checked: roots.length, missing }, null, 2));
if (missing.length) process.exitCode = 1;
