#!/usr/bin/env python3
# 地図の画面(img/map): 日本地図(832x468)と、ずんだもんの歩きの絵(4コマ・背景を透明に)を作る。 使い方: python3 tools/make_map_assets.py
import os
import numpy as np
from PIL import Image
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'); SRC = os.path.join(ROOT, 'tools', 'map_src'); OUT = os.path.join(ROOT, 'img', 'map'); os.makedirs(OUT, exist_ok=True)
Image.open(os.path.join(SRC, 'map.jpg')).convert('RGB').resize((832, 468), Image.LANCZOS).save(os.path.join(OUT, 'map.webp'), 'WEBP', quality=88, method=6)
sp = Image.open(os.path.join(SRC, 'zunda_walk.jpg')).convert('RGB'); a = np.array(sp).astype(int)
bg = np.median(a[:40, :40].reshape(-1, 3), axis=0)
dist = np.abs(a - bg).sum(axis=2); fg = dist > 38
cols = np.where(fg.any(axis=0))[0]
# 4つの かたまり(左右の すきまで 分ける)
groups = []; start = cols[0]; prev = cols[0]
for c in cols[1:]:
    if c - prev > 30: groups.append((start, prev)); start = c
    prev = c
groups.append((start, prev)); print('frames', groups)
H = 44  # ゲーム画面での高さ
boxes = []
for gi, (x0, x1) in enumerate(groups[:4]):
    sub = fg[:, x0:x1 + 1]; rows = np.where(sub.any(axis=1))[0]; y0, y1 = rows[0], rows[-1]; boxes.append((x0, y0, x1, y1))
Y0 = min(b[1] for b in boxes); Y1 = max(b[3] for b in boxes); WMAX = max(b[2] - b[0] + 1 for b in boxes)
sc = H / (Y1 - Y0 + 1)
for gi, (x0, y0, x1, y1) in enumerate(boxes):
    fr = Image.new('RGBA', (WMAX, Y1 - Y0 + 1), (0, 0, 0, 0)); rgba = np.dstack([a, np.where(fg, 255, 0)]).astype(np.uint8)
    # ふちの なめらかさ: 背景との 距離を 透明度に
    alpha = np.clip((dist - 20) / 40, 0, 1) * 255; rgba[..., 3] = alpha.astype(np.uint8)
    crop = Image.fromarray(rgba[Y0:Y1 + 1, x0:x1 + 1], 'RGBA'); fr.paste(crop, ((WMAX - crop.width) // 2, 0))
    fr = fr.resize((max(1, int(round(WMAX * sc))), H), Image.LANCZOS); fr.save(os.path.join(OUT, 'w%d.webp' % gi), 'WEBP', quality=92, method=6)
print('ok')
# ずんだもんの「影」(シルエット): 足もとから右のほうへ のびる、地面に落ちた影。 出力: img/map/ws0..3.webp (縦に つぶして ななめに のばした黒い絵)
from PIL import ImageFilter
for gi in range(4):
    fr = Image.open(os.path.join(OUT, 'w%d.webp' % gi)).convert('RGBA'); W, Hh = fr.size
    al = fr.split()[3].transpose(Image.FLIP_TOP_BOTTOM).resize((W, int(Hh * 0.5)), Image.BILINEAR)  # 上下を ひっくり返して(足もとが上)、縦に つぶす
    k = 0.8; sw = int(al.width + k * al.height) + 2; sh = Image.new('L', (sw, al.height), 0)
    sh = al.transform((sw, al.height), Image.AFFINE, (1, -k, 0, 0, 1, 0), Image.BILINEAR)  # y に応じて 右へ ずらす(ななめの影)
    out = Image.new('RGBA', sh.size, (0, 0, 0, 0)); out.putalpha(sh.point(lambda v: int(v * 0.92))); out = out.filter(ImageFilter.GaussianBlur(0.6))
    out.save(os.path.join(OUT, 'ws%d.webp' % gi), 'WEBP', quality=90, method=6)
print('shadow ok')
