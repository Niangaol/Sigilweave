# -*- coding: utf-8 -*-
"""共振法阵 · 像素素材加工管线 v1.0
AI 原图 -> 游戏 PNG（RGBA/透明底/定尺寸/<=32色/无水印）。
输出: public/assets/sprites/*, public/assets/effects/*
调试: docs/素材加工/debug/*, docs/素材加工/contact-sheet.png
仅依赖 Pillow + numpy（连通域用行程编码+并查集实现）。
"""
import os, sys, traceback
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from collections import Counter

sys.stdout.reconfigure(encoding='utf-8', errors='replace')

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'gongzhen', 'gongzhen', 'runtime', 'assets', 'sprites')
OUT_SPR = os.path.join(ROOT, 'public', 'assets', 'sprites')
OUT_FX = os.path.join(ROOT, 'public', 'assets', 'effects')
DOCS = os.path.join(ROOT, 'docs', '素材加工')
DBG = os.path.join(DOCS, 'debug')

# ---------------- 可调参数 ----------------
WM_SHEET = (1520, 970)      # 表类水印区: x> 且 y>
WM_SINGLE = (830, 960)      # 单图水印区
DILATE_ITERS = 15           # 找连通域前的膨胀量（保住速度线/血滴/爪子）
CLUSTER_GAP = 40            # 碎片归属: 与核心 x 间隙小于该值并入
CORE_AREA = 6000            # 膨胀后连通域达到该面积才算"帧核心"
FRAG_DIST = 90              # 碎片允许偏离核心中心的 x 距离
ROW_GAP = 100               # 行间 y 中心最小间隔
MIN_NOISE = 14              # 噪点连通域面积阈值
MIN_KEEP = 40               # 非主体小块: 面积低于此且不贴主体则丢弃
MIN_FRAME_H = 150           # 帧最小源像素高（水印残字过滤）
ASPECT_WIDE = 1.15          # 宽高比超过则按宽缩放
QUANT = 32                  # 全表调色板上限

SHEETS = [
    dict(src='player_spritesheet_pixelated.png', out='player_sheet.png', cell=(32, 32), tol=28),
    dict(src='skeleton_sheet.png', out='skeleton_sheet.png', cell=(28, 28), tol=20),
    dict(src='corpse_sheet.png', out='corpse_sheet.png', cell=(30, 30), tol=26),
]
SINGLES = [
    dict(src='gargoyle.png',      out='gargoyle.png',      h=32, tol=26, fill=True),
    dict(src='ghoul.png',         out='ghoul.png',         h=26, tol=26, fill=True),
    dict(src='lesser_demon.png',  out='lesser_demon.png',  h=30, tol=26, fill=True),
    dict(src='cultist.png',       out='cultist.png',       h=30, tol=36, fill=True, shadow=True),
    dict(src='death_knight.png',  out='death_knight.png',  h=34, tol=30, fill=True, shadow=True),
]
# lich: 只要本体+长杖。erase_all=矩形内全部抹成背景; erase_gray=矩形内只抹石灰色(中性灰)。
LICH = dict(
    src='lich.png', out='lich.png', h=36, tol=24, fill=True,
    bg=[((100, 99, 99), 24), ((30, 24, 40), 16)],   # 亮灰/暗紫两簇; 暗簇收窄防蚀袍
    roi=(200, 278, 880, 972),           # y0=278 切王冠; y1=972 避开底边噪点带
    erase_all=[(290, 278, 398, 618),    # 王座彩窗魔法阵(袍子左侧)
               (205, 278, 355, 760)],   # 左石柱+拱框整体抹除(披风最低 y≈780, 不受影响)
    erase_gray=[(352, 278, 420, 620),   # 彩窗与兜帽之间的石框
                (205, 760, 360, 865),   # 左基座残留(仅抹石灰色, 保住深色披风)
                (572, 495, 662, 838)],  # 右侧石柱残条
    gray_lum=(60.0, 230.0), gray_chroma=40,
)

# ---------------- 基础工具 ----------------
def load_rgb(p):
    return np.asarray(Image.open(p).convert('RGB'))

def _shifts(m):
    a = np.roll(m, 1, 0); b = np.roll(m, -1, 0)
    c = np.roll(m, 1, 1); d = np.roll(m, -1, 1)
    return a, b, c, d

def dilate(m, it=1):
    for _ in range(it):
        a, b, c, d = _shifts(m)
        m = (m | a | b | c | d |
             np.roll(a, 1, 1) | np.roll(a, -1, 1) |
             np.roll(b, 1, 1) | np.roll(b, -1, 1))
    return m

def erode(m, it=1):
    for _ in range(it):
        a, b, c, d = _shifts(m)
        m = (m & a & b & c & d &
             np.roll(a, 1, 1) & np.roll(a, -1, 1) &
             np.roll(b, 1, 1) & np.roll(b, -1, 1))
    return m

def dilate_xy(m, xit=10, yit=6):
    """矩形结构元膨胀: x 方向 xit px, y 方向 yit px。保横向速度线、避开 24px 行距。"""
    for _ in range(xit):
        m = m | np.roll(m, 1, 1) | np.roll(m, -1, 1)
    for _ in range(yit):
        m = m | np.roll(m, 1, 0) | np.roll(m, -1, 0)
    return m

def label_components(mask):
    """行程编码 + 并查集, 8 连通。返回 (labels 1..n, n), 0 为背景。"""
    h, w = mask.shape
    labels = np.zeros((h, w), np.int32)
    parent = [0]
    def find(x):
        r = x
        while parent[r] != r:
            r = parent[r]
        while parent[x] != r:
            parent[x], x = r, x
        return r
    def union(a, b):
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[max(ra, rb)] = min(ra, rb)
    prev = []
    for y in range(h):
        row = mask[y]
        if not row.any():
            prev = []
            continue
        d = np.diff(row.astype(np.int8))
        starts = np.flatnonzero(d == 1) + 1
        ends = np.flatnonzero(d == -1) + 1
        if row[0]:
            starts = np.r_[0, starts]
        if row[-1]:
            ends = np.r_[ends, w]
        runs = []
        for s, e in zip(starts.tolist(), ends.tolist()):
            lb = len(parent)
            parent.append(lb)
            labels[y, s:e] = lb
            runs.append((s, e - 1, lb))
        for s, e, lb in runs:
            for ps, pe, pl in prev:
                if ps <= e + 1 and s <= pe + 1:
                    union(lb, pl)
        prev = runs
    roots = np.array([find(i) for i in range(len(parent))], np.int32)
    uniq, inv = np.unique(roots[labels.ravel()], return_inverse=True)
    return inv.reshape(h, w).astype(np.int32), len(uniq) - 1

def comp_stats(lab, n):
    if n == 0:
        return []
    ys, xs = np.nonzero(lab)
    lb = lab[ys, xs]
    order = np.argsort(lb, kind='stable')
    ys, xs, lb = ys[order], xs[order], lb[order]
    cut = np.searchsorted(lb, np.arange(1, n + 2))
    out = []
    for i in range(1, n + 1):
        s, e = int(cut[i - 1]), int(cut[i])
        if e <= s:
            continue
        x0, x1 = int(xs[s:e].min()), int(xs[s:e].max()) + 1
        y0, y1 = int(ys[s:e].min()), int(ys[s:e].max()) + 1
        out.append(dict(id=i, area=int(e - s), bbox=(x0, y0, x1, y1),
                        cx=(x0 + x1) / 2.0, cy=(y0 + y1) / 2.0))
    return out

def bbox_of(m):
    ys, xs = np.nonzero(m)
    if len(ys) == 0:
        return None
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1

def fill_holes(m):
    inv = ~m
    lab, n = label_components(inv)
    if n == 0:
        return m
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]])).tolist())
    holes = [i for i in range(1, n + 1) if i not in border]
    if not holes:
        return m
    return m | np.isin(lab, holes)

def drop_stray(m, min_keep=MIN_KEEP):
    lab, n = label_components(m)
    if n <= 1:
        return m
    counts = np.bincount(lab.ravel(), minlength=n + 1)
    main = int(np.argmax(counts[1:]) + 1)
    near = dilate(lab == main, 3)
    keep_ids = [main]
    for i in range(1, n + 1):
        if i == main:
            continue
        if counts[i] >= min_keep or bool(np.logical_and(lab == i, near).any()):
            keep_ids.append(i)
    return np.isin(lab, keep_ids)

# ---------------- 背景键控 ----------------
def sample_bg_colors(a, wm=None, band=6, cover=0.995, max_clusters=5):
    h, w, _ = a.shape
    ys, xs = np.mgrid[0:h, 0:w]
    b = (ys < band) | (ys >= h - band) | (xs < band) | (xs >= w - band)
    bx, by = xs[b], ys[b]
    if wm is not None:
        keep = ~((bx > wm[0] - 30) & (by > wm[1] - 30))
        bx, by = bx[keep], by[keep]
    col = a[by, bx].astype(np.float64)
    q = (col.astype(np.int32) >> 4)
    key = (q[:, 0] << 8) | (q[:, 1] << 4) | q[:, 2]
    cnt = Counter(key.tolist())
    total = len(key)
    used, clusters, acc = set(), [], 0
    for k, _c in cnt.most_common():
        if acc / total >= cover or len(clusters) >= max_clusters:
            break
        if k in used:
            continue
        kr, kg, kb = k >> 8, (k >> 4) & 15, k & 15
        gcnt, gsum = 0, np.zeros(3)
        for dr in (-1, 0, 1):
            for dg in (-1, 0, 1):
                for db in (-1, 0, 1):
                    kk = ((kr + dr) << 8) | ((kg + dg) << 4) | (kb + db)
                    if kk in used:
                        continue
                    cc = cnt.get(kk)
                    if cc:
                        used.add(kk)
                        gcnt += cc
                        gsum += cc * np.array([((kr + dr) << 4) + 8,
                                               ((kg + dg) << 4) + 8,
                                               ((kb + db) << 4) + 8])
        clusters.append((gsum / max(gcnt, 1)).astype(np.uint8))
        acc += gcnt
    if not clusters:
        clusters = [np.array([255, 255, 255], np.uint8)]
    return clusters

def key_fg(a, bgs):
    """前景 = 对每簇背景色(各自容差)及两簇连线(容差随位置渐变)都足够远。
    bgs: [(color uint8(3), tol)]"""
    a32 = a.astype(np.int32)
    fg = None

    def andd(cond):
        nonlocal fg
        fg = cond if fg is None else (fg & cond)

    cols = [np.asarray(c, np.int64) for c, _t in bgs]
    tols = [float(t) for _c, t in bgs]
    for c, t in zip(cols, tols):
        andd(((a32 - c[None, None, :]) ** 2).sum(-1) > t * t)
    for i in range(len(cols)):
        for j in range(i + 1, len(cols)):
            v = cols[j] - cols[i]
            vv = int((v * v).sum())
            if vv <= 0:
                continue
            tpos = ((a32 - cols[i][None, None, :]) @ v) / float(vv)
            tc = np.clip(tpos, 0.0, 1.0)
            proj = (cols[i][None, None, :] + tc[..., None] * v[None, None, :]).astype(np.int32)
            tol_seg = tols[i] + (tols[j] - tols[i]) * tc
            andd(((a32 - proj) ** 2).sum(-1) > tol_seg ** 2)
    return fg

def key_shadow(fg, a, bgc, kmin=0.45, kmax=0.97, max_chroma=22):
    mx = a.max(-1).astype(np.int16)
    mn = a.min(-1).astype(np.int16)
    neutral = (mx - mn) <= max_chroma
    lum = a.astype(np.float32) @ np.array([0.299, 0.587, 0.114], np.float32)
    bl = float(np.array([0.299, 0.587, 0.114], np.float32) @ bgc.astype(np.float32))
    ratio = lum / max(bl, 1.0)
    return fg & ~(neutral & (ratio > kmin) & (ratio < kmax))

def clean_mask(fg, wm):
    if wm is not None:
        fg[int(wm[1]):, int(wm[0]):] = False
    lab, n = label_components(fg)
    if n:
        counts = np.bincount(lab.ravel(), minlength=n + 1)
        small = np.flatnonzero(counts < MIN_NOISE)
        small = small[small > 0]
        if len(small):
            fg = fg & ~np.isin(lab, small)
    fg = erode(dilate(fg, 2), 2)   # 闭运算填针孔
    fg = erode(fg, 1)              # 去 1px 背景光晕
    return fg

# ---------------- 切帧 ----------------
def split_valley_x(fg, lab, comp):
    """在连通域 x 范围内找像素低谷(两帧粘连处)作为切分 x。无明显低谷返回 None。"""
    x0, y0, x1, y1 = comp['bbox']
    sub = np.logical_and(fg[y0:y1, x0:x1], lab[y0:y1, x0:x1] == comp['id'])
    cnt = sub.sum(0).astype(np.float64)
    n = len(cnt)
    lo, hi = int(n * 0.3), int(n * 0.7)
    if hi - lo < 4:
        return None
    seg = cnt[lo:hi]
    if seg.min() > cnt.max() * 0.25:
        return None
    return x0 + lo + int(np.argmin(seg))

def slice_frames(fg):
    dil = dilate_xy(fg, 10, 6)
    lab, n = label_components(dil)
    comps = [c for c in comp_stats(lab, n) if c['area'] >= 300]
    for c in comps:
        print('    comp cy=%.0f cx=%.0f area=%d bbox=%s' % (c['cy'], c['cx'], c['area'], c['bbox']))
    info = dict(ncomp=len(comps), rows=None, fallback=None)
    if not comps:
        return grid_fallback(fg), dict(info, fallback='empty')
    comps_sorted = sorted(comps, key=lambda c: c['cy'])
    gaps = [(comps_sorted[i + 1]['cy'] - comps_sorted[i]['cy'], i) for i in range(len(comps_sorted) - 1)]
    gaps.sort(reverse=True)
    if len(gaps) < 2 or gaps[0][0] < ROW_GAP or gaps[1][0] < ROW_GAP:
        return grid_fallback(fg), dict(info, fallback='rows')
    cuts = sorted([gaps[0][1], gaps[1][1]])
    rows = [comps_sorted[:cuts[0] + 1], comps_sorted[cuts[0] + 1:cuts[1] + 1], comps_sorted[cuts[1] + 1:]]
    info['rows'] = [len(r) for r in rows]
    frames = []
    cellw = fg.shape[1] / 4.0
    centers = [cellw * (i + 0.5) for i in range(4)]
    for row in rows:
        cores = [c for c in row if c['area'] >= CORE_AREA]
        cores.sort(key=lambda c: c['cx'])
        # 按最近单元格中心归类; 一格多核(如 AI 重复帧)只保留距中心最近者
        bycell = {}
        def regroup():
            bycell.clear()
            for c in cores:
                ci = int(np.argmin([abs(c['cx'] - ct) for ct in centers]))
                bycell.setdefault(ci, []).append(c)
        regroup()
        widths = [c['bbox'][2] - c['bbox'][0] for c in cores]
        med_w = float(np.median(widths)) if widths else 0.0
        tries = 0
        while len(bycell) < 4 and tries < 3:
            wide = max(cores, key=lambda c: c['bbox'][2] - c['bbox'][0])
            if wide['bbox'][2] - wide['bbox'][0] < med_w * 1.5:
                break
            vx = split_valley_x(fg, lab, wide)
            if vx is None:
                break
            b0 = wide['bbox']
            cores.remove(wide)
            cores.append(dict(id=wide['id'], area=0, bbox=(b0[0], b0[1], vx, b0[3]),
                              cx=(b0[0] + vx) / 2.0, cy=wide['cy']))
            cores.append(dict(id=wide['id'], area=0, bbox=(vx, b0[1], b0[2], b0[3]),
                              cx=(vx + b0[2]) / 2.0, cy=wide['cy']))
            regroup()
            tries += 1
        picked = []
        for ci in range(4):
            cand = bycell.get(ci, [])
            if not cand:
                picked = None
                break
            picked.append(min(cand, key=lambda c: abs(c['cx'] - centers[ci])))
        if picked is None:
            return grid_fallback(fg), dict(info, fallback='cores%s' % len(cores))
        cores = picked
        cores.sort(key=lambda c: c['cx'])
        frags = [c for c in row if c['area'] < CORE_AREA]
        groups = [dict(ids=[c['id']], x0=c['bbox'][0], x1=c['bbox'][2]) for c in cores]
        for f in frags:
            best, bd = None, 1e9
            for gi, g in enumerate(groups):
                edge = max(0, g['x0'] - f['bbox'][2], f['bbox'][0] - g['x1'])
                dist = abs(f['cx'] - (g['x0'] + g['x1']) / 2.0)
                if edge <= CLUSTER_GAP and dist < bd:
                    best, bd = gi, dist
            if best is not None and bd <= FRAG_DIST:
                g = groups[best]
                g['ids'].append(f['id'])
                g['x0'] = min(g['x0'], f['bbox'][0])
                g['x1'] = max(g['x1'], f['bbox'][2])
        if len(groups) != 4:
            return grid_fallback(fg), dict(info, fallback='groups%s' % len(groups))
        X = np.arange(fg.shape[1], dtype=np.int32)[None, :]
        for g in groups:
            m = fg & np.isin(lab, g['ids']) & (X >= g['x0']) & (X < g['x1'])
            bb = bbox_of(m)
            if bb is None or bb[3] - bb[1] < MIN_FRAME_H:
                return grid_fallback(fg), dict(info, fallback='minh')
            frames.append((bb, m))
    if len(frames) != 12:
        return grid_fallback(fg), dict(info, fallback='count%s' % len(frames))
    return frames, info

def grid_fallback(fg):
    h, w = fg.shape
    frames = []
    for j in range(3):
        for i in range(4):
            x0, x1 = int(round(i * w / 4)), int(round((i + 1) * w / 4))
            y0, y1 = int(round(j * h / 3)), int(round((j + 1) * h / 3))
            sub = fg[y0:y1, x0:x1]
            bb = bbox_of(sub)
            if bb is None or bb[3] - bb[1] < MIN_FRAME_H:
                frames.append(((x0, y0, x1, y1), np.zeros((y1 - y0, x1 - x0), bool)))
            else:
                fullm = np.zeros_like(fg)
                fullm[y0 + bb[1]:y0 + bb[3], x0 + bb[0]:x0 + bb[2]] = sub[bb[1]:bb[3], bb[0]:bb[2]]
                frames.append(((bb[0] + x0, bb[1] + y0, bb[2] + x0, bb[3] + y0), fullm))
    return frames

def crop_rgba(a, m, bb):
    x0, y0, x1, y1 = bb
    rgb = a[y0:y1, x0:x1]
    al = (m[y0:y1, x0:x1].astype(np.uint8) * 255)
    return np.dstack([rgb, al])

# ---------------- 归一化/量化 ----------------
def normalize_frame(rgba, cw, ch, clamp=True):
    h, w = rgba.shape[:2]
    aspect = w / max(h, 1)
    mode = 'H'
    if aspect > ASPECT_WIDE:
        tw, th = cw, max(1, round(h * cw / w)); mode = 'W'
    else:
        th, tw = ch, max(1, round(w * ch / h))
    if clamp and tw > cw:
        tw, th = cw, max(1, round(h * cw / w)); mode = 'W*'
    if clamp and th > ch:
        th, tw = ch, max(1, round(w * ch / h)); mode = 'H*'
    im = Image.fromarray(rgba)
    im = im.resize((tw * 2, th * 2), Image.LANCZOS).resize((tw, th), Image.NEAREST)
    arr = np.asarray(im).copy()
    arr[..., 3] = np.where(arr[..., 3] >= 128, 255, 0)   # 1 级 alpha 硬化
    return arr, mode

def median_cut(pixels, weights, k):
    boxes = [(pixels, weights)]
    while len(boxes) < k:
        best, score = None, -1.0
        for i, (px, wt) in enumerate(boxes):
            if len(px) < 2:
                continue
            sc = float((px.max(0) - px.min(0)).max()) * float(wt.sum())
            if sc > score:
                best, score = i, sc
        if best is None:
            break
        px, wt = boxes.pop(best)
        ch_ = int(np.argmax(px.max(0) - px.min(0)))
        order = np.argsort(px[:, ch_], kind='stable')
        px, wt = px[order], wt[order]
        cum = np.cumsum(wt)
        mid = int(np.searchsorted(cum, cum[-1] / 2))
        mid = min(max(mid, 1), len(px) - 1)
        boxes.append((px[:mid], wt[:mid]))
        boxes.append((px[mid:], wt[mid:]))
    pal = []
    for px, wt in boxes:
        if len(px) == 0:
            continue
        pal.append(np.round((px * wt[:, None]).sum(0) / wt.sum()).astype(np.uint8))
    return np.array(pal)

def remap(arr, pal):
    rgb = arr[..., :3].astype(np.int32)
    d = ((rgb[:, :, None, :] - pal[None, None, :, :].astype(np.int32)) ** 2).sum(-1)
    arr[..., :3] = pal[d.argmin(-1)].astype(np.uint8)

def quantize_frames(frames, n=QUANT):
    for arr in frames:
        op = arr[arr[..., 3] > 0][:, :3]
        if len(op) == 0:
            continue
        colors, counts = np.unique(op, axis=0, return_counts=True)
        if len(colors) > n:
            remap(arr, median_cut(colors.astype(np.float32), counts.astype(np.float32), n))
    opaq = [(f[..., 3] > 0) for f in frames]
    if any(o.any() for o in opaq):
        allpx = np.concatenate([f[o][:, :3] for f, o in zip(frames, opaq) if o.any()])
        colors, counts = np.unique(allpx, axis=0, return_counts=True)
        if len(colors) > n:
            pal = median_cut(colors.astype(np.float32), counts.astype(np.float32), n)
            for arr in frames:
                remap(arr, pal)

def compose_sheet(frames, cw, ch):
    sheet = np.zeros((ch, cw * len(frames), 4), np.uint8)
    for i, arr in enumerate(frames):
        h2, w2 = arr.shape[:2]
        x = i * cw + (cw - w2) // 2
        y = ch - h2
        sheet[y:y + h2, x:x + w2] = arr
    return sheet

# ---------------- 调试输出 ----------------
def get_font(sz=16):
    try:
        return ImageFont.load_default(sz)
    except TypeError:
        return ImageFont.load_default()

def dbg_overlay(name, a, fg, boxes=None, scale=1.0):
    vis = (a.astype(np.float32) * 0.45).astype(np.uint8)
    vis[fg & ~erode(fg, 1)] = (0, 255, 120)
    im = Image.fromarray(vis)
    dr = ImageDraw.Draw(im)
    if boxes:
        for i, bb in enumerate(boxes):
            dr.rectangle([bb[0], bb[1], bb[2] - 1, bb[3] - 1], outline=(255, 60, 60), width=3)
            dr.text((bb[0] + 4, bb[1] + 4), str(i), fill=(255, 220, 60), font=get_font(22))
    if scale != 1.0:
        im = im.resize((max(1, int(im.width * scale)), max(1, int(im.height * scale))), Image.NEAREST)
    im.save(os.path.join(DBG, name))

def dbg_grid(name, a, step=50):
    im = Image.fromarray(a)
    dr = ImageDraw.Draw(im)
    f = get_font(14)
    for x in range(0, im.width, step):
        dr.line([(x, 0), (x, im.height)], fill=(0, 220, 120), width=1)
        if x % 100 == 0:
            dr.text((x + 2, 2), str(x), fill=(255, 255, 0), font=f)
    for y in range(0, im.height, step):
        dr.line([(0, y), (im.width, y)], fill=(0, 220, 120), width=1)
        if y % 100 == 0:
            dr.text((2, y + 2), str(y), fill=(255, 255, 0), font=f)
    im.save(os.path.join(DBG, name))

# ---------------- 处理流程 ----------------
def common_mask(a, tol, wm, shadow=False, bg_override=None):
    if bg_override:
        bgs = [(np.array(c, np.uint8), t) for c, t in bg_override]
    else:
        bgs = [(c, tol) for c in sample_bg_colors(a, wm)]
    fg = key_fg(a, bgs)
    if shadow:
        bg_main = max(bgs, key=lambda ct: float(
            np.array([0.299, 0.587, 0.114], np.float32) @ ct[0].astype(np.float32)))[0]
        fg = key_shadow(fg, a, bg_main)
    fg = clean_mask(fg, wm)
    return fg, bgs

def process_sheet(cfg):
    print('\n=== sheet %s -> %s' % (cfg['src'], cfg['out']))
    a = load_rgb(os.path.join(SRC, cfg['src']))
    fg, bgs = common_mask(a, cfg['tol'], WM_SHEET, cfg.get('shadow', False))
    print('  bg=%s tol=%s' % ([(c.tolist(), t) for c, t in bgs], cfg['tol']))
    frames, info = slice_frames(fg)
    print('  slice:', info)
    dbg_overlay('sheet_%s' % cfg['out'], a, fg, [bb for bb, _ in frames], scale=0.5)
    cw, ch = cfg['cell']
    norm, modes = [], []
    for i, (bb, m) in enumerate(frames):
        if not m.any():
            print('  !! frame %d 空(切帧失败)' % i)
            norm.append(np.zeros((ch, cw, 4), np.uint8)); modes.append('-')
            continue
        arr, mode = normalize_frame(crop_rgba(a, m, bb), cw, ch)
        norm.append(arr); modes.append(mode)
        print('  f%02d bbox=%s src=%dx%d -> %dx%d[%s]' % (
            i, bb, bb[2] - bb[0], bb[3] - bb[1], arr.shape[1], arr.shape[0], mode))
    quantize_frames(norm)
    sheet = compose_sheet(norm, cw, ch)
    out = os.path.join(OUT_SPR, cfg['out'])
    Image.fromarray(sheet, 'RGBA').save(out)
    return dict(out=cfg['out'], path=out, cell=(cw, ch), how=info.get('fallback') or 'cc')

def process_single(cfg, a=None, wm=None):
    print('\n=== single %s -> %s' % (cfg['src'], cfg['out']))
    if a is None:
        a = load_rgb(os.path.join(SRC, cfg['src']))
    if wm is None:
        wm = WM_SINGLE
    fg, bgs = common_mask(a, cfg['tol'], wm, cfg.get('shadow', False), cfg.get('bg'))
    print('  bg=%s tol=%s' % ([(c.tolist(), t) for c, t in bgs], cfg['tol']))
    dil = dilate(fg, DILATE_ITERS)
    lab, n = label_components(dil)
    comps = [c for c in comp_stats(lab, n) if c['area'] >= 300]
    if not comps:
        raise RuntimeError('未找到主体连通域: ' + cfg['src'])
    main = max(comps, key=lambda c: c['area'])
    bb = main['bbox']
    x0, y0, x1, y1 = bb
    m = drop_stray(fg[y0:y1, x0:x1].copy(), MIN_KEEP)
    if cfg.get('fill', False):
        m = fill_holes(m)
    bb2 = bbox_of(m)
    if bb2 is None:
        raise RuntimeError('mask 为空: ' + cfg['src'])
    rgba = crop_rgba(a[y0:y1, x0:x1], m, bb2)
    th = cfg['h']
    arr, mode = normalize_frame(rgba, th, th, clamp=False)
    quantize_frames([arr])
    op = arr[..., 3] > 0
    rws = np.flatnonzero(op.any(1))
    if len(rws):
        sh = (arr.shape[0] - 1) - int(rws[-1])
        if sh > 0:
            arr = np.roll(arr, sh, axis=0)
            arr[:sh] = 0
    W = max(th, arr.shape[1])
    canvas = np.zeros((th, W, 4), np.uint8)
    xx = (W - arr.shape[1]) // 2
    yy = th - arr.shape[0]
    canvas[yy:yy + arr.shape[0], xx:xx + arr.shape[1]] = arr
    out = os.path.join(OUT_SPR, cfg['out'])
    Image.fromarray(canvas, 'RGBA').save(out)
    print('  main bbox=%s -> %dx%d[%s] canvas=%dx%d' % (bb, arr.shape[1], arr.shape[0], mode, W, th))
    dbg_overlay('single_%s' % cfg['out'], a, fg, [bb], scale=0.5)
    return dict(out=cfg['out'], path=out, size=(W, th))

def lich_prepare():
    cfg = LICH
    a = load_rgb(os.path.join(SRC, cfg['src']))
    rx0, ry0, rx1, ry1 = cfg['roi']
    a = a[ry0:ry1, rx0:rx1].copy()
    border = np.concatenate([a[:6].reshape(-1, 3), a[-6:].reshape(-1, 3),
                             a[:, :6].reshape(-1, 3), a[:, -6:].reshape(-1, 3)]).astype(np.float64)
    bgfill = np.median(border, axis=0).astype(np.uint8)
    lum_w = np.array([0.299, 0.587, 0.114], np.float32)
    lo, hi = cfg['gray_lum']
    for (x0, y0, x1, y1) in cfg['erase_all']:
        a[max(0, y0 - ry0):y1 - ry0, max(0, x0 - rx0):x1 - rx0] = bgfill
    for (x0, y0, x1, y1) in cfg['erase_gray']:
        yy0, yy1 = max(0, y0 - ry0), y1 - ry0
        xx0, xx1 = max(0, x0 - rx0), x1 - rx0
        sub = a[yy0:yy1, xx0:xx1]
        f = sub.astype(np.float32)
        lum = f @ lum_w
        chroma = sub.max(-1).astype(np.int16) - sub.min(-1).astype(np.int16)
        stone = (lum >= lo) & (lum <= hi) & (chroma <= cfg['gray_chroma'])
        sub[stone] = bgfill
    a[:3] = bgfill; a[-3:] = bgfill; a[:, :3] = bgfill; a[:, -3:] = bgfill
    dbg_grid('lich_roi_grid.png', a)
    wm = (WM_SINGLE[0] - rx0, WM_SINGLE[1] - ry0)
    return a, wm

# ---------------- 手绘小件 ----------------
def draw_from_map(rows, palette):
    h, w = len(rows), len(rows[0])
    assert all(len(r) == w for r in rows), '地图行宽不一致'
    arr = np.zeros((h, w, 4), np.uint8)
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch in palette:
                arr[y, x] = palette[ch]
    return arr

def build_drawn():
    print('\n=== 手绘小件')
    bat_rows = [
        "....................",
        "..o..............o..",
        ".oPo............oPo.",
        ".oPPo...o..o...oPPo.",
        ".oPPPo.oowwoo.oPPPo.",
        ".oPPPPoowwwwooPPPPo.",
        ".oPPPPoorwwrooPPPPo.",
        ".oPPPPoowwwwooPPPPo.",
        ".op..poowwwwoop..po.",
        ".......owwwwo.......",
        ".......opPPpo.......",
        ".......opPPpo.......",
        "........oppo........",
        "........oppo........",
        ".........oo.........",
        "........o..o........",
    ]
    bat_pal = {'o': (36, 21, 51, 255), 'w': (232, 226, 208, 255), 'P': (90, 59, 122, 255),
               'p': (70, 45, 97, 255), 'r': (212, 58, 74, 255)}
    Image.fromarray(draw_from_map(bat_rows, bat_pal), 'RGBA').save(
        os.path.join(OUT_SPR, 'undead_bat.png'))

    shard_rows = [
        "....oo....",
        "...ocgo...",
        "..occggo..",
        ".occghggo.",
        "occghhhggo",
        "occghhhggo",
        ".occghggo.",
        "..occggo..",
        "...ocgo...",
        "....oo....",
    ]
    shard_pal = {'o': (18, 52, 64, 255), 'c': (63, 214, 232, 255),
                 'g': (242, 182, 50, 255), 'h': (255, 233, 168, 255)}
    Image.fromarray(draw_from_map(shard_rows, shard_pal), 'RGBA').save(
        os.path.join(OUT_FX, 'rune_shard.png'))

    D, B = (138, 31, 45, 255), (255, 77, 94, 255)
    warn = np.zeros((6, 32, 4), np.uint8)
    warn[0] = D; warn[5] = D
    warn[1:5, 0] = D; warn[1:5, 31] = D
    warn[1:5, 1:31] = B
    warn[0, 0] = 0; warn[0, 31] = 0; warn[5, 0] = 0; warn[5, 31] = 0
    Image.fromarray(warn, 'RGBA').save(os.path.join(OUT_FX, 'attack_warning.png'))
    print('  undead_bat / rune_shard / attack_warning 完成')

# ---------------- 校验/拼图 ----------------
EXPECT = [
    ('sprites/player_sheet.png', 'exact', 384, 32),
    ('sprites/skeleton_sheet.png', 'exact', 336, 28),
    ('sprites/corpse_sheet.png', 'exact', 360, 30),
    ('sprites/undead_bat.png', 'exact', 20, 16),
    ('sprites/gargoyle.png', 'h', 32, 0),
    ('sprites/cultist.png', 'h', 30, 0),
    ('sprites/ghoul.png', 'h', 26, 0),
    ('sprites/death_knight.png', 'h', 34, 0),
    ('sprites/lesser_demon.png', 'h', 30, 0),
    ('sprites/lich.png', 'h', 36, 0),
    ('effects/rune_shard.png', 'exact', 10, 10),
    ('effects/attack_warning.png', 'exact', 32, 6),
]

def validate():
    print('\n=== 程序化校验 ===')
    rows, fails = [], 0
    base = os.path.join(ROOT, 'public', 'assets')
    for rel, kind, v1, v2 in EXPECT:
        p = os.path.join(base, rel)
        if not os.path.exists(p):
            rows.append(('FAIL', rel, '缺失')); fails += 1; continue
        im = Image.open(p)
        arr = np.asarray(im)
        w, h = im.size
        ok = im.mode == 'RGBA'
        if kind == 'exact':
            ok = ok and (w, h) == (v1, v2)
        else:
            ok = ok and h == v1 and w >= v1
        alpha = arr[..., 3]
        has_trans = bool((alpha == 0).any())
        has_op = bool((alpha == 255).any())
        colors = int(len(np.unique(arr[alpha > 0][:, :3], axis=0))) if has_op else 0
        ok = ok and has_trans and has_op and colors <= QUANT
        if not ok:
            fails += 1
        rows.append(('PASS' if ok else 'FAIL', rel,
                     '%dx%d mode=%s 透明=%s 色=%d' % (w, h, im.mode, has_trans, colors)))
    for st, rel, msg in rows:
        print('  [%s] %-32s %s' % (st, rel, msg))
    for rel, cw, ch in [('sprites/player_sheet.png', 32, 32),
                        ('sprites/skeleton_sheet.png', 28, 28),
                        ('sprites/corpse_sheet.png', 30, 30)]:
        arr = np.asarray(Image.open(os.path.join(base, rel)))
        stat = []
        for i in range(12):
            cell = arr[:, i * cw:(i + 1) * cw, 3]
            stat.append('%d:%d/%s' % (i, int((cell > 0).sum()), '底OK' if (cell[-1] > 0).any() else '底空!'))
        print('  [%s] 逐帧: %s' % (rel, ' '.join(stat)))
    for rel, hh in [('sprites/gargoyle.png', 32), ('sprites/cultist.png', 30),
                    ('sprites/ghoul.png', 26), ('sprites/death_knight.png', 34),
                    ('sprites/lesser_demon.png', 30), ('sprites/lich.png', 36)]:
        arr = np.asarray(Image.open(os.path.join(base, rel)))
        rws = np.flatnonzero((arr[..., 3] > 0).any(1))
        bot = int(rws[-1]) if len(rws) else -1
        print('  [%s] 单图内容底行=%d (期望 %d)%s' % (
            rel, bot, hh - 1, '' if bot == hh - 1 else ' <- 未贴底!'))
    print('校验结果: %s' % ('全部通过' if fails == 0 else '%d 项失败' % fails))
    return fails

def contact_sheet():
    keys = [('player_sheet.png', 'sprites'), ('skeleton_sheet.png', 'sprites'),
            ('corpse_sheet.png', 'sprites'), ('undead_bat.png', 'sprites'),
            ('gargoyle.png', 'sprites'), ('cultist.png', 'sprites'),
            ('ghoul.png', 'sprites'), ('death_knight.png', 'sprites'),
            ('lesser_demon.png', 'sprites'), ('lich.png', 'sprites'),
            ('rune_shard.png', 'effects'), ('attack_warning.png', 'effects')]
    base = os.path.join(ROOT, 'public', 'assets')
    Z = 4
    tiles = []
    for name, sub in keys:
        im = Image.open(os.path.join(base, sub, name)).convert('RGBA')
        tiles.append((name, im.resize((im.width * Z, im.height * Z), Image.NEAREST)))
    pad, lbl_h = 28, 30
    W = max(t.width for _, t in tiles) + pad * 2
    H = sum(t.height + lbl_h + pad for _, t in tiles) + pad
    canvas = Image.new('RGBA', (W, H), (26, 22, 38, 255))
    dr = ImageDraw.Draw(canvas)
    font = get_font(18)
    y = pad
    for name, t in tiles:
        dr.text((pad, y), '%s  %dx%d' % (name, t.width // Z, t.height // Z),
                fill=(232, 228, 240, 255), font=font)
        canvas.alpha_composite(t, (pad, y + lbl_h))
        dr.line([(pad, y + lbl_h + t.height + pad // 2), (W - pad, y + lbl_h + t.height + pad // 2)],
                fill=(60, 52, 84, 255), width=1)
        y += lbl_h + t.height + pad
    out = os.path.join(DOCS, 'contact-sheet.png')
    canvas.convert('RGB').save(out)
    print('\ncontact-sheet ->', out, canvas.size)

def main():
    os.makedirs(OUT_SPR, exist_ok=True)
    os.makedirs(OUT_FX, exist_ok=True)
    os.makedirs(DBG, exist_ok=True)
    results = []
    for cfg in SHEETS:
        results.append(process_sheet(cfg))
    for cfg in SINGLES:
        results.append(process_single(cfg))
    a, wm = lich_prepare()
    results.append(process_single(dict(LICH), a=a, wm=wm))
    build_drawn()
    fails = validate()
    contact_sheet()
    lines = ['# 素材加工报告', '', '| 输出 | 规格 | 切帧方式 |', '| --- | --- | --- |']
    for r in results:
        if 'cell' in r:
            lines.append('| %s | %dx%d/帧 | %s |' % (r['out'], r['cell'][0], r['cell'][1], r['how']))
        else:
            lines.append('| %s | %dx%d | - |' % (r['out'], r['size'][0], r['size'][1]))
    lines += ['', '校验失败项: %d' % fails, '',
              '参数: 膨胀%dpx/核心面积%d/聚类间隙%d/最小帧高%d/量化%d色' % (
                  DILATE_ITERS, CORE_AREA, CLUSTER_GAP, MIN_FRAME_H, QUANT)]
    with open(os.path.join(DOCS, 'build-report.md'), 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines))
    if fails:
        sys.exit(2)

if __name__ == '__main__':
    try:
        main()
    except SystemExit:
        raise
    except Exception:
        traceback.print_exc()
        sys.exit(1)
