# -*- coding: utf-8 -*-
import numpy as np
from PIL import Image

ROOT = "D:/AgentPrograms/Sigilweave/docs/素材加工/同步"

def load(p):
    return np.array(Image.open(p).convert("RGB")).astype(np.int16)

def lum(a):
    return (0.299 * a[:, :, 0] + 0.587 * a[:, :, 1] + 0.114 * a[:, :, 2])

for scene in ["2-战斗", "3-罗盘", "4-幕间工作台", "5-结算", "1-标题"]:
    b = load(f"{ROOT}/before/{scene}.png")
    a = load(f"{ROOT}/after/{scene}.png")
    if b.shape != a.shape:
        print(f"{scene}: 尺寸不同 {b.shape} vs {a.shape}"); continue
    d = np.abs(b - a).mean(axis=2)
    changed = float((d > 8).mean() * 100)
    print(f"{scene}: 改动像素 {changed:.1f}%  整体亮度 {lum(b).mean():.1f} -> {lum(a).mean():.1f}")

# 背景地砖区亮度（避开 HUD 与角色：取左侧中段）
b = load(f"{ROOT}/before/2-战斗.png"); a = load(f"{ROOT}/after/2-战斗.png")
region = (slice(260, 560), slice(60, 420))
print("\n地砖区亮度 before/after: %.1f / %.1f" % (lum(b)[region].mean(), lum(a)[region].mean()))

# 罗盘面板不透明度：面板内部方差（半透明会透出地砖纹理 -> 方差高）
b = load(f"{ROOT}/before/3-罗盘.png"); a = load(f"{ROOT}/after/3-罗盘.png")
panel = (slice(120, 320), slice(60, 540))
print("罗盘面板区标准差 before/after: %.2f / %.2f （越低越“实”）" % (lum(b)[panel].std(), lum(a)[panel].std()))
print("罗盘面板区亮度 before/after: %.1f / %.1f" % (lum(b)[panel].mean(), lum(a)[panel].mean()))

# HUD 对照组（我没改 Hud.js）：应当基本不变
hud = (slice(0, 120), slice(0, 1920))
b = load(f"{ROOT}/before/2-战斗.png"); a = load(f"{ROOT}/after/2-战斗.png")
print("HUD 对照区改动像素: %.2f%% （应接近 0）" % float((np.abs(b[hud]-a[hud]).mean(axis=2) > 8).mean()*100))
