#!/usr/bin/env python3
"""あなた(ずんだもん)の表情 4×4 の絵(tools/zunda_sheet.jpg)を、16枚に切って img/zunda/01〜16.webp にする。
赤い枠のすぐ内側で切り、正方形にそろえる。使い方: python3 tools/cut_zunda.py   (Pillow が必要)
番号(左上から右へ・下へ): 1 にっこり 2 大喜び 3 考え中 4 やる気 5 牌を見せる 6 びっくり 7 余裕 8 くすくす
                           9 集中 10 ほっ 11 むすっ 12 ? 13 WIN 14 負け 15 ドキドキ 16 ドヤ"""
import os
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.join(HERE, '..')
XS = [(13, 241), (266, 500), (526, 760), (785, 1011)]   # 赤い枠の内側(左右)
YS = [(13, 248), (273, 508), (533, 770), (796, 1015)]   # 赤い枠の内側(上下)
im = Image.open(os.path.join(HERE, 'zunda_sheet.jpg')).convert('RGB')
out = os.path.join(ROOT, 'img', 'zunda'); os.makedirs(out, exist_ok=True)
for j, (y0, y1) in enumerate(YS):
    for i, (x0, x1) in enumerate(XS):
        c = im.crop((x0, y0, x1, y1)); s = min(c.size); cx, cy = (c.size[0] - s) // 2, (c.size[1] - s) // 2
        c = c.crop((cx, cy, cx + s, cy + s)).resize((256, 256), Image.LANCZOS)
        c.save(os.path.join(out, '%02d.webp' % (j * 4 + i + 1)), 'WEBP', quality=88, method=6)
print('16枚 →', os.path.relpath(out, ROOT))
