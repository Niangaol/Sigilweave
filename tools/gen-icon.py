import sys
from PIL import Image, ImageDraw
src = r"public/assets/ui/title_wall.png"
im = Image.open(src).convert("RGBA")
print("src", im.size)
# 生成 256 方形图标：居中裁切 + 深色底
s = min(im.size)
im = im.crop(((im.width-s)//2, (im.height-s)//2, (im.width+s)//2, (im.height+s)//2)).resize((256,256), Image.LANCZOS)
sizes = [(256,256),(128,128),(64,64),(48,48),(32,32),(16,16)]
im.save("tools/webhost/sigilweave.ico", format="ICO", sizes=sizes)
print("ok ico")
