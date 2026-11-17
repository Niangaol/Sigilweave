"""用《共振法阵》Palette.js 的真实色板，程序化绘制像素风灵宠「墨宝」。

纯标准库实现（zlib + struct 写 PNG），无第三方依赖。
输出 32x34 的 RGBA 像素精灵，硬边、无抗锯齿，可直接作为游戏 sprite 或 UI 头像。
运行：python generate_pet_sprite.py [输出路径]
"""

import struct
import sys
import zlib

# —— 取自 src/ui/Palette.js 的真实色值 ——
P = {
    "outline": (0x1C, 0x12, 0x26),  # outline   近黑暗紫描边
    "void":    (0x0D, 0x0A, 0x17),
    "night":   (0x24, 0x1C, 0x3A),  # night     身体主色
    "deep":    (0x1A, 0x14, 0x2B),  # nightDeep 身体暗部
    "stone":   (0x3B, 0x31, 0x57),  # stone     身体中间调
    "groove":  (0x6B, 0x5B, 0x8E),  # groove    毛尖高光
    "mute":    (0x8A, 0x7A, 0xA8),
    "teal":    (0x5E, 0xD0, 0xC8),  # teal      眼睛 / 符印
    "cold":    (0x9F, 0xE8, 0xFF),  # coldFlame 符印核心 / 眼高光
    "white":   (0xFF, 0xF6, 0xE0),  # white     眼睛亮点
    "brass":   (0xC9, 0xA2, 0x27),  # brass     额纹点缀
    "bone":    (0xE4, 0xDC, 0xC4),  # bone      鼻
    "rot":     (0x5D, 0x7A, 0x46),  # rot       叶片暗
    "sage":    (0x84, 0x9C, 0x6C),  # sage      叶片亮
}

W, H = 32, 34
grid = [[None] * W for _ in range(H)]
body_mask = set()


def in_bounds(x, y):
    return 0 <= x < W and 0 <= y < H


def put(x, y, color, body=False):
    if in_bounds(x, y):
        grid[y][x] = color
        if body:
            body_mask.add((x, y))


def ellipse(cx, cy, rx, ry, color, body=True):
    for y in range(H):
        for x in range(W):
            if ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1.0:
                put(x, y, color, body)


def point_in_tri(px, py, a, b, c):
    def sign(p1, p2, p3):
        return (p1[0] - p3[0]) * (p2[1] - p3[1]) - (p2[0] - p3[0]) * (p1[1] - p3[1])
    d1, d2, d3 = sign((px, py), a, b), sign((px, py), b, c), sign((px, py), c, a)
    has_neg = (d1 < 0) or (d2 < 0) or (d3 < 0)
    has_pos = (d1 > 0) or (d2 > 0) or (d3 > 0)
    return not (has_neg and has_pos)


def triangle(a, b, c, color):
    for y in range(H):
        for x in range(W):
            if point_in_tri(x, y, a, b, c):
                put(x, y, color, True)


def disc(cx, cy, r, color):
    for y in range(H):
        for x in range(W):
            if (x - cx) ** 2 + (y - cy) ** 2 <= r * r:
                put(x, y, color, True)


# —— 1. 剪影：耳朵 / 头 / 身体 / 尾巴 / 爪子（先填身体色，后面统一描边）——
triangle((6, 10), (9, 0), (14, 7), P["night"])      # 左耳
triangle((26, 10), (23, 0), (18, 7), P["night"])    # 右耳
ellipse(16, 12, 9, 8, P["night"])                   # 头
ellipse(16, 26, 6, 8, P["night"])                   # 身体
for cx, cy in [(22, 30), (26, 29), (29, 26), (30, 22), (29, 18)]:
    disc(cx, cy, 2, P["night"])                      # 卷起的尾巴
ellipse(12, 32, 3, 2, P["night"])                    # 左前爪
ellipse(20, 32, 3, 2, P["night"])                    # 右前爪

# 耳内暗色
triangle((8, 8), (9, 2), (12, 7), P["deep"])
triangle((24, 8), (23, 2), (20, 7), P["deep"])

# 身体暗部与高光（低饱和中间调，硬边色块）
for x, y in [(8, 12), (9, 16), (8, 18), (23, 12), (22, 16), (23, 18)]:
    if (x, y) in body_mask:
        put(x, y, P["stone"])
for x, y in [(10, 9), (21, 9), (13, 24), (18, 24), (15, 29)]:
    if (x, y) in body_mask:
        put(x, y, P["groove"])
for x, y in [(11, 11), (20, 11)]:
    put(x, y, P["mute"])

# —— 2. 统一 1px 描边 ——
for y in range(H):
    for x in range(W):
        if (x, y) in body_mask:
            continue
        if any((x + dx, y + dy) in body_mask for dx, dy in [(-1, 0), (1, 0), (0, -1), (0, 1)]):
            grid[y][x] = P["outline"]

# —— 3. 五官 ——
def eye(cx, cy):
    ellipse(cx, cy, 3, 4, P["outline"], body=False)   # 眼描边
    ellipse(cx, cy, 2, 3, P["teal"], body=False)      # 青绿眼
    for dx in range(-1, 2):
        put(cx + dx, cy, P["deep"], body=False)       # 竖瞳
    put(cx - 1, cy - 2, P["white"], body=False)       # 高光
    put(cx + 1, cy - 1, P["cold"], body=False)

eye(12, 13)
eye(20, 13)

# 额头青焰符印（菱形 + 核心）
for y in range(4, 10):
    for x in range(13, 20):
        d = abs(x - 16) + abs(y - 7)
        if d <= 3 and (x, y) in body_mask:
            put(x, y, P["teal"], body=False)
        if d <= 2 and (x, y) in body_mask:
            put(x, y, P["cold"], body=False)
put(16, 7, P["white"], body=False)
put(16, 5, P["brass"], body=False)

# 鼻与嘴
put(15, 18, P["bone"], body=False)
put(16, 18, P["bone"], body=False)
put(14, 19, P["outline"], body=False)
put(17, 19, P["outline"], body=False)
put(15, 20, P["outline"], body=False)
put(16, 20, P["outline"], body=False)

# 胡须
for x, y in [(7, 17), (8, 18), (24, 17), (23, 18)]:
    put(x, y, P["groove"], body=False)

# 爪边青光
for x, y in [(11, 33), (12, 33), (19, 33), (20, 33), (28, 20)]:
    if in_bounds(x, y) and grid[y][x] is None:
        grid[y][x] = P["teal"]

# 漂浮叶片（左下 / 右上）
for x, y in [(3, 22), (4, 21), (4, 23), (5, 22), (27, 9), (28, 8), (28, 10), (29, 9)]:
    if in_bounds(x, y) and grid[y][x] is None:
        grid[y][x] = P["rot"]
for x, y in [(4, 22), (28, 9)]:
    grid[y][x] = P["sage"]

# —— 4. 写 PNG ——
def chunk(tag, data):
    c = tag + data
    return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c) & 0xFFFFFFFF)


raw = bytearray()
for y in range(H):
    raw.append(0)  # filter type 0
    for x in range(W):
        color = grid[y][x]
        if color is None:
            raw.extend((0, 0, 0, 0))
        else:
            raw.extend((color[0], color[1], color[2], 255))

png = b"\x89PNG\r\n\x1a\n"
png += chunk(b"IHDR", struct.pack(">IIBBBBB", W, H, 8, 6, 0, 0, 0))
png += chunk(b"IDAT", zlib.compress(bytes(raw), 9))
png += chunk(b"IEND", b"")

out = sys.argv[1] if len(sys.argv) > 1 else "lingchong-mobao-pixel.png"
with open(out, "wb") as f:
    f.write(png)
print("wrote", out, W, "x", H)
