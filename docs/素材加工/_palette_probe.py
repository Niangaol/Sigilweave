# -*- coding: utf-8 -*-
import os
import numpy as np
from PIL import Image
from collections import Counter

ROOT = "D:/AgentPrograms/Sigilweave"
FILES = [
    "public/assets/sprites/player_sheet.png", "public/assets/sprites/skeleton_sheet.png",
    "public/assets/sprites/corpse_sheet.png", "public/assets/sprites/undead_bat.png",
    "public/assets/sprites/gargoyle.png", "public/assets/sprites/cultist.png",
    "public/assets/sprites/ghoul.png", "public/assets/sprites/death_knight.png",
    "public/assets/sprites/lesser_demon.png", "public/assets/sprites/lich.png",
]
def hexc(rgb):
    return "#%02x%02x%02x" % rgb

allc = Counter()
per = {}
for f in FILES:
    im = Image.open(f"{ROOT}/{f}").convert("RGBA")
    a = np.array(im)
    mask = a[:, :, 3] > 200
    px = a[mask][:, :3]
    # 量化到 16 级近似，统计主色
    q = (px // 24) * 24 + 12
    cnt = Counter(map(tuple, q))
    per[os.path.basename(f)] = cnt.most_common(6)
    allc.update(cnt)

print("=== 全素材主色 TOP 20（量化 RGB → 十六进制）===")
for rgb, n in allc.most_common(20):
    print(f"{hexc(rgb)}  x{n}")
print()
print("=== 各文件 TOP 4 ===")
for f, tops in per.items():
    print(f"{f}: " + "  ".join(f"{hexc(rgb)}x{n}" for rgb, n in tops[:4]))
