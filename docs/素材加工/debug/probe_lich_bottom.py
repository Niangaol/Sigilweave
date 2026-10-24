# -*- coding: utf-8 -*-
import sys, numpy as np
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
import importlib.util
spec = importlib.util.spec_from_file_location('ba', r'D:\AgentPrograms\Sigilweave\scripts\build-assets.py')
ba = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ba)

a, wm = ba.lich_prepare()
fg, bgs = ba.common_mask(a, ba.LICH['tol'], wm, False, ba.LICH.get('bg'))
dil = ba.dilate(fg, ba.DILATE_ITERS)
lab, n = ba.label_components(dil)
comps = [c for c in ba.comp_stats(lab, n) if c['area'] >= 300]
main = max(comps, key=lambda c: c['area'])
x0, y0, x1, y1 = main['bbox']
m = ba.drop_stray(fg[y0:y1, x0:x1].copy(), ba.MIN_KEEP)
m = ba.fill_holes(m)
print('main bbox(ROI) =', main['bbox'], ' ROI 高 =', a.shape[0], '(源 y %d..%d)' % (278 + y0, 278 + y1))
H, W = m.shape
for yy in range(max(0, H - 64), H):
    cnt = int(m[yy].sum())
    if cnt:
        xs = np.flatnonzero(m[yy])
        print('ROI y=%3d 源y=%3d cnt=%3d x=[%d..%d]' % (yy, 278 + yy, cnt, xs.min(), xs.max()))
