import { createGrid, rebuildDerived } from '../src/logic/grid.js';
import { SigilEngine } from '../src/logic/engine.js';
import { buildComboCatalog } from '../src/logic/combo.js';

const ACT1 = [4, 5, 6, 7, 9, 10];
const g = createGrid();
for (const id of ACT1) {
  g.cells[id].unlocked = true;
  g.cells[id].slot = { kind: "sigil", defId: "arcane_bolt" };
}
rebuildDerived(g, 2000);

const catalog = buildComboCatalog(["duo", "line3", "elbow3", "ring4"]);
console.log("实例总数", catalog.length, "按形状", JSON.stringify(catalog.reduce((a, c) => { a[c.defId] = (a[c.defId] || 0) + 1; return a; }, {})));

const e = new SigilEngine({ seed: "sigil-1", grid: g, startCells: [5], combos: catalog });
e.onEvent = (type, d) => {
  if (type === "signal:trigger") console.log("trigger", d.cellId, "t=", Math.round(d.t));
  if (type === "combo:fire") console.log("  COMBO", d.defId, d.order.join("-"), "t=", Math.round(d.at));
};
e.start();
e.advanceTo(20000);
console.log("总结", JSON.stringify(e.summary(20000)));
