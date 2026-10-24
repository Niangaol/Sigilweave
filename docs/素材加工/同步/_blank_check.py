# -*- coding: utf-8 -*-
import os
import numpy as np
from PIL import Image
D = "D:/AgentPrograms/Sigilweave/docs/素材加工/同步/after"
for f in sorted(os.listdir(D)):
    if not f.endswith(".png"): continue
    a = np.array(Image.open(f"{D}/{f}").convert("RGB")).astype(np.float32)
    print(f"{f:18s} {a.shape[1]}x{a.shape[0]} 亮度={a.mean():6.1f} 标准差={a.std():6.1f} 唯一色数≈{len(np.unique(a.reshape(-1,3), axis=0)) // 1000}k")
