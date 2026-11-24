#!/usr/bin/env python3
# 認定証の顔写真: ずんだもん(浮世絵ふう)の顔から、背景のうろこ模様を切りぬいて、無地の青い背景(証明写真ふう)に置いた絵を作る。 出力: img/certface/NN.webp
# 使い方: python3 tools/make_certface.py
import os, glob
import cv2, numpy as np
from PIL import Image
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'); OUT = os.path.join(ROOT, 'img', 'certface'); os.makedirs(OUT, exist_ok=True)
BG = (122, 163, 179)
def cut(path):
    img = cv2.imread(path); h, w = img.shape[:2]; hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV).astype(float); H, S, V = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    bg = ((H > 85) & (H < 135) & (S > 25)) | ((S < 45) & (V > 150)) | ((S < 60) & (V < 95) & (H > 85) & (H < 135))
    m = np.full((h, w), cv2.GC_PR_FGD, np.uint8); m[bg] = cv2.GC_PR_BGD; m[:6, :] = cv2.GC_BGD; m[:, :6] = cv2.GC_BGD; m[:, -6:] = cv2.GC_BGD
    cv2.circle(m, (w // 2, int(h * 0.55)), int(w * 0.22), cv2.GC_FGD, -1)
    cv2.grabCut(img, m, None, np.zeros((1, 65)), np.zeros((1, 65)), 6, cv2.GC_INIT_WITH_MASK)
    fg = ((m == cv2.GC_FGD) | (m == cv2.GC_PR_FGD)).astype(np.uint8); fg = cv2.morphologyEx(fg, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    n, lab, st, _ = cv2.connectedComponentsWithStats(fg)
    if n > 1: fg = (lab == 1 + np.argmax(st[1:, cv2.CC_STAT_AREA])).astype(np.uint8)
    a = cv2.GaussianBlur(fg.astype(np.float32), (0, 0), 1.2); rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB).astype(float)
    out = rgb * a[..., None] + np.array(BG, float) * (1 - a[..., None]); return out.astype(np.uint8)
for p in sorted(glob.glob(os.path.join(ROOT, 'img', 'uk', 'zunda', '*.webp'))):
    o = Image.fromarray(cut(p)); w, h = o.size; cw = int(round(h * 54 / 65)); x0 = (w - cw) // 2; o = o.crop((x0, 0, x0 + cw, h))  # 証明写真の わく(縦長)に合わせて 左右を 切る
    o.save(os.path.join(OUT, os.path.basename(p)), 'WEBP', quality=94, method=6)
print('ok')
