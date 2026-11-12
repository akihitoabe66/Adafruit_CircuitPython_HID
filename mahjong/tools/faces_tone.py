#!/usr/bin/env python3
"""顔の絵(浮世絵版)の色の補正。 使い方:
   python3 tools/faces_tone.py apply   … img/uk_orig(もとの絵)から、補正した絵を img/uk に作る(いつでも、やり直せる)
   python3 tools/faces_tone.py restore … もとの絵を img/uk に戻す
  補正: 明るさの範囲を広げて(白を白く・墨を濃く)、赤みを少し抑えて、輪郭をくっきり(P1=弱) """
import sys, glob, os, shutil
import numpy as np
from PIL import Image, ImageFilter
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
ORIG, DST = os.path.join(ROOT, 'img/uk_orig'), os.path.join(ROOT, 'img/uk')
BLACK, WHITE, GAMMA, SAT, REDCUT, SHARP = 0.06, 0.93, 0.95, 1.00, 0.35, 60  # P1

def proc(im):
    a = np.asarray(im.convert('RGB')).astype(np.float32) / 255
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    a[..., 0] = r - (r - np.minimum(r, (g + b) / 2 * 1.15)) * REDCUT * (r > g).astype(np.float32)
    a = np.clip((a - BLACK) / (WHITE - BLACK), 0, 1) ** GAMMA
    l = a.mean(-1, keepdims=True); a = np.clip(l + (a - l) * SAT, 0, 1)
    out = Image.fromarray((a * 255).astype(np.uint8))
    return out.filter(ImageFilter.UnsharpMask(radius=1.2, percent=SHARP, threshold=2))

def each():
    for sub in ('chars/face', 'zunda'):
        for f in sorted(glob.glob(os.path.join(ORIG, sub, '*.webp'))):
            yield sub, os.path.basename(f), f

def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else ''
    if mode not in ('apply', 'restore'): print(__doc__); return
    n = 0
    for sub, name, f in each():
        dst = os.path.join(DST, sub, name)
        if mode == 'restore': shutil.copyfile(f, dst)
        else: proc(Image.open(f)).save(dst, 'WEBP', quality=92, method=6)
        n += 1
    print(mode, n, 'files')
main()
