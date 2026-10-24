# -*- coding: utf-8 -*-
import numpy as np
from PIL import Image
ROOT = "D:/AgentPrograms/Sigilweave/docs/素材加工/同步"
def load(p): return np.array(Image.open(p).convert("RGB")).astype(np.float32)
def lum(a): return 0.299*a[:,:,0]+0.587*a[:,:,1]+0.114*a[:,:,2]
for tag in ["before", "after"]:
    a = load(f"{ROOT}/{tag}/2-战斗.png")
    L = lum(a)
    battle = L[100:1000, 40:1880]
    print(f"{tag}: 亮像素(>150)={int((battle>150).sum())}  中等(70~150)={int(((battle>70)&(battle<=150)).sum())}  暗(<70)={int((battle<70).sum())}")
# 罗盘四角铆钉（brass #c9a227）存在性
a = load(f"{ROOT}/after/3-罗盘.png")
def near(c, col, tol=26): return np.abs(c - np.array(col)).max(axis=-1) < tol
brass = near(a, [0xc9,0xa2,0x27])
print("罗盘图内 brass 铆钉像素数:", int(brass.sum()))
