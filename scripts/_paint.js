  // 布局：横屏维持原坐标（workshop-smoke 依赖），竖屏重排为大触控版式
  layout() {
    if (!isPortrait()) {
      return {
        canvasH: 270,
        cell: (id) => ({ x: 14 + (id % 4) * 54, y: 76 + Math.floor(id / 4) * 29, w: 51, h: 26 }),
        gridPanel: { x: 10, y: 72, w: 224, h: 124 },
        rewardPanel: { x: 10, y: 26, w: 460, h: 34 },
        rewardCard: (i) => ({ x: 14 + i * 152, y: 28, w: 144, h: 22 }),
        rewardHintY: 50,
        infoY: 63,
        statsPanel: { x: 10, y: 196, w: 224, h: 62 },
        statsY: [200, 212],
        oathLabelY: 233,
        oathBtn: (i) => ({ x: 44 + i * 52, y: 231, w: 48, h: 14 }),
        oathCurrentY: 249,
        handPanel: { x: 240, y: 72, w: 230, h: 190 },
        handRow: (row) => ({ x: 244, y: 82 + row * 16, w: 216, h: 14 }),
        runeBtn: (i) => ({ x: (i % 2 ? 355 : 244), y: 192 + Math.floor(i / 2) * 17, w: 105, h: 15 }),
        runeSlot: (i) => ({ x: 244 + i * 111, y: 226, w: 105, h: 15 }),
        noteY: 240,
        depart: { x: 244, y: 250, w: 216, h: 12 },
        exitPanel: { x: 10, y: 196, w: 224, h: 70 },
        exitTitleY: 199,
        exitBtn: (i) => ({ x: 16 + (i % 2) * 102, y: 214 + Math.floor(i / 2) * 20, w: 102, h: 18 }),
        exitDone: { x: 16, y: 254, w: 204, h: 12 },
        exitNoteY: 240,
        exitLabelY: 199,
      };
    }
    return {
      canvasH: CANVAS_H_PORTRAIT,
      cell: (id) => ({ x: 22 + (id % 4) * 112, y: 138 + Math.floor(id / 4) * 60, w: 104, h: 54 }),
      gridPanel: { x: 10, y: 124, w: 460, h: 268 },
      rewardPanel: { x: 10, y: 32, w: 460, h: 76 },
      rewardCard: (i) => ({ x: 14 + i * 152, y: 42, w: 144, h: 46 }),
      rewardHintY: 92,
      infoY: 116,
      statsPanel: { x: 10, y: 400, w: 460, h: 46 },
      statsY: [404, 416],
      oathLabelY: 456,
      oathBtn: (i) => ({ x: 60 + i * 104, y: 450, w: 96, h: 24 }),
      oathCurrentY: 478,
      handPanel: { x: 10, y: 484, w: 460, h: 116 },
      handRow: (row) => ({ x: 16 + (row % 2) * 228, y: 506 + Math.floor(row / 2) * 30, w: 216, h: 26 }),
      runeBtn: (i) => ({ x: 16 + i * 116, y: 608, w: 108, h: 30 }),
      runeSlot: (i) => ({ x: 16 + i * 232, y: 646, w: 220, h: 26 }),
      noteY: 680,
      depart: { x: 140, y: 704, w: 200, h: 40 },
      exitPanel: { x: 10, y: 400, w: 460, h: 180 },
      exitTitleY: 406,
      exitBtn: (i) => ({ x: 20 + (i % 2) * 220, y: 440 + Math.floor(i / 2) * 52, w: 200, h: 44 }),
      exitDone: { x: 16, y: 600, w: 448, h: 40 },
      exitNoteY: 406,
      exitLabelY: 406,
    };
  }

  paint() {
    this.view.removeAll(true);
    this.clearHover();
    const w = this.workshop;
    const g = this.add.graphics(); this.view.add(g);
    const L = this.layout();

    // 背景：硬边竖纹 + 四角硬边压暗 + 双层外框（全程无平滑渐变）
    pxRect(g, 0, 0, 480, L.canvasH, C.void);
    for (let x = 0; x < 480; x += 24) pxRect(g, x, 0, 12, L.canvasH, C.ink, 0.22);
    for (let i = 0; i < 3; i++) {
      const a = 0.1 - i * 0.03;
      pxRect(g, 0, i * 8, 480, 8, C.void, a);
      pxRect(g, 0, L.canvasH - (i + 1) * 8, 480, 8, C.void, a);
      pxRect(g, i * 8, 0, 8, L.canvasH, C.void, a);
      pxRect(g, 480 - (i + 1) * 8, 0, 8, L.canvasH, C.void, a);
    }
    pxFrame(g, 6, 6, 468, L.canvasH - 12, C.brassDark);
    pxFrame(g, 8, 8, 464, L.canvasH - 16, C.brass, 1, 0.18);

    // 标题栏：菱形纹章 + 幕数 + 碎片计数
    pxRect(g, 10, 10, 460, 14, C.ink, 0.95);
    pxRect(g, 10, 23, 460, 1, C.brassDark, 0.9);
    pxDiamond(g, 14, 17, 3, C.brass, 0.95, false);
    this.text(21, 11, '幕间构筑', 12, HEX.brassLight);
    this.text(97, 13, '第 ' + w.draft.act + ' 幕准备', 8, HEX.mute);
    pxRect(g, 396, 11, 70, 12, C.nightDeep, 1);
    pxFrame(g, 396, 11, 70, 12, C.brassDark);
    pxDiamond(g, 403, 17, 3, C.teal, 0.95, true);
    this.text(409, 13, '碎片', 8, HEX.mute);
    this.text(462, 13, String(w.shards), 9, HEX.teal).setOrigin(1, 0);

    // 奖励区
    this.panel(g, L.rewardPanel.x, L.rewardPanel.y, L.rewardPanel.w, L.rewardPanel.h, { fill: C.ink, alpha: 0.88 });
    const offer = w.offer;
    if (offer) {
      offer.cards.forEach((card, i) => {
        const r = L.rewardCard(i);
        this.iconButton(r.x, r.y, r.w, r.h, card.defId,
          names[card.defId].name + '  领取', () => this.choose(i),
          card.kind === 'auxiliary' ? HEX.teal : HEX.arcaneLight, card.kind);
        this.text(r.x + 3, L.rewardHintY, hints[card.defId] ?? '', 7, HEX.mute);
      });
    } else {
      this.text(20, 42, '三轮奖励已领取 · 选右侧手牌，再点左侧符位放置', 8, HEX.teal);
    }

    // 信息行
    pxRect(g, 14, L.infoY - 1, 222, 1, C.brassDark, 0.45);
    pxDiamond(g, 16, L.infoY + 3, 2, C.brass, 0.8, false);
    this.text(22, L.infoY, '奖励剩余 ' + w.roundsRemaining + ' 轮', 8, HEX.brass);
    pxDiamond(g, 104, L.infoY + 3, 2, C.brass, 0.8, false);
    this.text(110, L.infoY, '已解封 ' + w.draft.unlocked.length + ' / 16 格', 8, HEX.mute);

    // 法阵区
    this.panel(g, L.gridPanel.x, L.gridPanel.y, L.gridPanel.w, L.gridPanel.h, { fill: C.nightDeep, alpha: 0.82 });
    const grid = createGrid();
    applyDraft(grid, w.draft, { phase: 'intermission' });
    const glyphScale = isPortrait() ? 2 : 1;
    for (let id = 0; id < 16; id++) {
      const c = L.cell(id);
      const x = c.x, y = c.y, cw = c.w, ch = c.h;
      const unlocked = w.draft.unlocked.includes(id), slot = w.draft.slots[id];
      const selected = id === this.focusCell || id === this.auxPending;
      pxRect(g, x, y, cw, ch, unlocked ? C.stone : C.night);
      if (unlocked) {
        pxRect(g, x + 1, y + 1, cw - 2, 1, C.groove, 0.3);
        pxRect(g, x + 1, y + ch - 2, cw - 2, 1, C.nightDeep, 0.45);
      }
      pxFrame(g, x, y, cw, ch, selected ? C.arcane : C.stoneLight, selected ? 2 : 1);
      // 角落 / 边上 / 中心三种区位装饰，与战斗罗盘同一份规则
      const plan = decoratePlan(id, [{ x, y }, { x: x + cw, y }, { x: x + cw, y: y + ch }, { x, y: y + ch }], { inset: 1, arm: 8, centerInset: 1 });
      if (plan) {
        const dim = unlocked ? 1 : 0.7;
        if (plan.wash) pxPoly(g, plan.wash.quad, C[plan.wash.color], plan.wash.alpha * dim);
        for (const line of plan.lines) pxLine(g, line.a.x, line.a.y, line.b.x, line.b.y, C[line.color], line.alpha * dim, line.width ?? 1);
        for (const dot of plan.dots) {
          const size = dot.size ?? 1;
          pxRect(g, Math.round(dot.x), Math.round(dot.y), size, size, C[dot.color], dot.alpha * dim);
        }
      }
      if (!unlocked) {
        pxDiamond(g, x + cw / 2, y + ch / 2, 4, C.stoneDark, 0.9, false);
        this.text(x + 3, y + 2, '封印', 8, HEX.mute);
      } else if (slot) {
        const visual = cardVisual(slot);
        if (visual.glyph) drawGlyph(g, x + 4, y + 4, visual.glyph, visual.color ?? C.arcaneLight, { scale: glyphScale, alpha: 0.95 });
        this.text(x + 5 + 9 * glyphScale, y + 2, names[slot.defId]?.name ?? '?', 8, slot.kind === 'auxiliary' ? HEX.teal : HEX.parchment);
      } else {
        this.text(x + 3, y + 2, '空符位', 8, HEX.mute);
      }
      const runeCount = (w.draft.runes[id] ?? []).filter(Boolean).length;
      const target = w.draft.auxTargets[id];
      this.text(x + 3, y + ch - 12, (id + 1) + ' · 铭' + runeCount + ' 出' + this.currentExits(id).length + (target !== undefined ? (' →' + (target + 1)) : ''), 7, HEX.mute);
      this.zone(x, y, cw, ch, () => this.clickCell(id), C.arcaneLight);
    }

    const cell = grid.cells[this.focusCell];
    if (this.exitMode) {
      // 出口编辑面板：临时覆盖统计区，不改动法阵本身
      this.panel(g, L.exitPanel.x, L.exitPanel.y, L.exitPanel.w, L.exitPanel.h, { fill: C.ink, alpha: 0.97, frame: C.brass });
      this.text(16, L.exitTitleY, '出口编辑 · ' + (this.focusCell + 1) + ' 号（' + (w.draft.slots[this.focusCell] ? names[w.draft.slots[this.focusCell].defId] : '空符位') + '）', 8, HEX.brassLight);
      const cur = this.currentExits(this.focusCell);
      const dirs = [['up', '上'], ['down', '下'], ['left', '左'], ['right', '右']];
      dirs.forEach(([d, label], i) => {
        const r = L.exitBtn(i);
        this.button(r.x, r.y, r.w, r.h, label + ' ' + (cur.includes(d) ? '开' : '关'), () => this.toggleExit(d),
          cur.includes(d) ? HEX.teal : HEX.mute, { fill: cur.includes(d) ? C.stone : C.nightDeep });
      });
      const d = L.exitDone;
      this.button(d.x, d.y, d.w, d.h, '完成出口编辑', () => { this.exitMode = false; this.paint(); }, HEX.brassLight);
      this.text(244, L.exitNoteY, w.note ?? this.note, 7, HEX.arcaneLight, { wordWrap: { width: 216 } });
      const ex = this.currentExits(this.focusCell);
      const label = { up: '上', down: '下', left: '左', right: '右' };
      this.text(228, L.exitLabelY, ex.map(dd => label[dd]).join('') || '无', 8, HEX.teal).setOrigin(1, 0);
      return;
    }

    // 统计区
    this.panel(g, L.statsPanel.x, L.statsPanel.y, L.statsPanel.w, L.statsPanel.h, { fill: C.ink, alpha: 0.9 });
    const outputs = Object.entries(w.draft.slots).filter(([id, s]) => s?.kind === 'sigil' && !w.draft.runes[id]?.includes('relay')).length;
    const auxes = Object.values(w.draft.slots).filter(s => s?.kind === 'auxiliary').length;
    const empties = w.draft.unlocked.filter(id => !w.draft.slots[id]).length;
    this.text(16, L.statsY[0], '输出 ' + outputs + ' / 辅助 ' + auxes + ' / 空位 ' + empties, 8, HEX.teal);
    this.text(16, L.statsY[1], '选中 ' + (this.focusCell + 1) + ' 号  间隔 ' + (cell.effIntervalMs / 1000).toFixed(2) + 's / 冷却 ' + (cell.effCooldownMs / 1000).toFixed(2) + 's'
      + '　上幕：触发 ' + (this.report.triggers ?? 0) + ' 受阻 ' + (this.report.blocked ?? 0) + ' 击杀 ' + (this.report.kills ?? 0), 8, HEX.mute);

    // 誓约
    this.text(16, L.oathLabelY, '誓约', 8, HEX.brass);
    OATH_LIST.forEach(([id, label], i) => {
      const r = L.oathBtn(i);
      this.button(r.x, r.y, r.w, r.h, label, () => this.setOath(w.draft.oath === id ? null : id),
        w.draft.oath === id ? HEX.teal : HEX.mute, { fill: w.draft.oath === id ? C.stone : C.nightDeep });
    });
    this.text(16, L.oathCurrentY, w.draft.oath ? ('当前：' + OATH_DEFS[w.draft.oath].name) : '未立誓（全局生效，最多一个）', 7, HEX.mute);

    // 手牌与操作
    const handTypes = Object.values(w.hand).filter(Boolean).length;
    const handTotal = Object.values(w.hand).reduce((a, b) => a + b, 0);
    this.panel(g, L.handPanel.x, L.handPanel.y, L.handPanel.w, L.handPanel.h, { fill: C.ink, alpha: 0.9 });
    this.text(16, L.handPanel.y + 4, '手牌 ' + handTypes + ' 种 / ' + handTotal + ' 张', 8, HEX.brass);
    let row = 0;
    const maxRows = isPortrait() ? 6 : 5;
    for (const [key, count] of Object.entries(w.hand)) {
      if (!count || row >= maxRows) continue;
      const defId = key.split(':')[1];
      const r = L.handRow(row);
      this.handRow(r.x, r.y, r.w, r.h, defId, names[defId]?.name + ' ×' + count, hints[defId] ?? '',
        this.selectedCard === key, () => {
          this.selectedCard = this.selectedCard === key ? null : key;
          this.auxPending = null;
          this.note = this.selectedCard ? (hints[defId] + '；点击符位安装') : '已取消选择';
          this.paint();
        });
      row++;
    }
    if (!row) this.text(20, L.handPanel.y + 24, '暂时没有手牌，请先领取上方奖励。', 8, HEX.mute);
    if (this.auxPending !== null) this.text(16, L.noteY - 12, '等待目标：点击 ' + (this.auxPending + 1) + ' 号相邻输出符印', 8, HEX.blood);
    else if (w.draft.auxTargets && Object.keys(w.draft.auxTargets).length) this.text(16, L.noteY - 12, '指向：' + Object.entries(w.draft.auxTargets).map(([a, b]) => (a + 1) + '→' + (b + 1)).join(' '), 7, HEX.mute);

    // 铭文购买与槽位
    const runeIds = ['forge', 'relay', 'sever', 'silence'];
    runeIds.forEach((rid, i) => {
      const r = L.runeBtn(i);
      const cost = (w.runeCosts && w.runeCosts[rid]) ? w.runeCosts[rid] : 8;
      this.iconButton(r.x, r.y, r.w, r.h, rid, RUNE_DEFS[rid].name + ' ' + cost + '碎', () => this.addRune(rid), HEX.parchment);
    });
    for (let i = 0; i < 2; i++) {
      const rune = w.draft.runes[this.focusCell] ? w.draft.runes[this.focusCell][i] : null;
      const r = L.runeSlot(i);
      this.button(r.x, r.y, r.w, r.h, rune ? ('拆 ' + names[rune].name) : ('铭文槽 ' + (i + 1) + ' 空'),
        () => this.act(removeRune(w, this.focusCell, i)), rune ? HEX.brassLight : HEX.mute,
        { fill: rune ? C.stoneDark : C.nightDeep });
    }
    this.text(16, L.noteY, this.note, 7, HEX.arcaneLight, { wordWrap: { width: isPortrait() ? 440 : 216 } });
    const ready = canDepart(w);
    const dp = L.depart;
    this.button(dp.x, dp.y, dp.w, dp.h, '确认构筑 · 出发', () => this.depart(), ready.ok ? HEX.teal : HEX.mute,
      { fill: ready.ok ? C.stoneDark : C.nightDeep, frame: ready.ok ? C.teal : C.brassDark, size: isPortrait() ? 11 : 9 });
  }
}
