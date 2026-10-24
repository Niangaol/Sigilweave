# -*- coding: utf-8 -*-
import sys, numpy as np
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
import importlib.util
spec = importlib.util.spec_from_file_location('ba', r'D:\AgentPrograms\Sigilweave\scripts\build-assets.py')
ba = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ba)

src = ba.load_rgb(ba.os.path.join(ba.SRC, 'lich.png'))
pts = {'pillar(250,400)': (250, 400), 'pillar(300,500)': (300, 500), 'pillar(280,350)': (280, 350),
       'pillarHi(260,300)': (260, 300), 'bg(210,400)': (210, 400), 'bg(210,900)': (210, 900),
       'bg(600,120)': (600, 120), 'bg(180,180)': (180, 180)}
for k, (x, y) in pts.items():
    print('src', k, '=', src[y, x].tolist())

a, wm = ba.lich_prepare()
print('cfg erase_all =', ba.LICH['erase_all'])
print('cfg erase_gray =', ba.LICH['erase_gray'])
reg = a[0:482, 5:155]
uq = np.unique(reg.reshape(-1, 3), axis=0)
print('after erase_all, region[0:482,5:155] unique colors =', uq[:6].tolist(), 'n=', len(uq))

fg, bgs = ba.common_mask(a, ba.LICH['tol'], wm, False)
print('bgs =', [c.tolist() for c in bgs])
cols = fg[:, :170].sum(0)
print('fg count col 0..169 =', cols.tolist())
lab, n = ba.label_components(ba.dilate(fg, ba.DILATE_ITERS))
comps = sorted([c for c in ba.comp_stats(lab, n) if c['area'] >= 300], key=lambda c: -c['area'])
for c in comps[:6]:
    print('comp bbox=%s area=%d' % (c['bbox'], c['area']))
