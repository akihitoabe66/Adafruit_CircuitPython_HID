#!/usr/bin/env python3
"""旅のはじまりで ずんだもんがとるポーズの絵(img/map/zp_*.webp)を、ポーズの一覧画像(tools/zn_src/pose_sheet_a/b.jpg)から作る。
背景(灰色)をぬいて切りだし、地図の上のずんだもんと同じ大きさ(立ち=高さ64)に縮め、白+こげ茶の縁をつける。 最後に、JS用の表(ZP)を表示する。
使い方: python3 tools/make_zunda_poses.py"""
import os, json, cv2, numpy as np
from PIL import Image, ImageFilter
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SRC = {'a': 'tools/zn_src/pose_sheet_a.jpg', 'b': 'tools/zn_src/pose_sheet_b.jpg'}
POSE = {'stand': ('a', 0), 'arms': ('a', 1), 'jump': ('a', 2), 'fists': ('a', 3), 'hip': ('b', 1), 'shout': ('b', 2), 'fist1': ('b', 3)}
MULT = {'stand': 1.10, 'arms': 1.05 * 1.02, 'jump': 1.05, 'fists': 1.10, 'hip': 1.10, 'shout': 1.10, 'fist1': 1.10}   # 地図のずんだもんを 100% として(見て決めた大きさ)
S0 = 64 / 420; BASE = 594; PAD = 5
def cut(sheet):
    im = cv2.imread(os.path.join(ROOT, SRC[sheet])); a = im.astype(int); bg = np.median(a[:40, :40].reshape(-1, 3), axis=0)
    m = (np.abs(a - bg).sum(axis=2) > 45).astype(np.uint8); k = np.ones((3, 3), np.uint8)
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, k, iterations=2); m = cv2.morphologyEx(m, cv2.MORPH_OPEN, k)
    n, lab, st, _ = cv2.connectedComponentsWithStats(m)
    comps = sorted((st[i, 0], st[i, 1], st[i, 0] + st[i, 2], st[i, 1] + st[i, 3], i) for i in range(1, n) if st[i, 4] > 1500)
    groups = []
    for c in comps:
        if groups and c[0] < groups[-1]['x1'] + 40:
            g = groups[-1]; g['x0'] = min(g['x0'], c[0]); g['y0'] = min(g['y0'], c[1]); g['x1'] = max(g['x1'], c[2]); g['y1'] = max(g['y1'], c[3]); g['ks'].append(c[4])
        else: groups.append(dict(x0=c[0], y0=c[1], x1=c[2], y1=c[3], ks=[c[4]]))
    out = []
    for g in groups:
        sub = np.isin(lab[g['y0']:g['y1'], g['x0']:g['x1']], g['ks']).astype(np.uint8)
        cn, _ = cv2.findContours(sub, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE); fill = np.zeros_like(sub); cv2.drawContours(fill, cn, -1, 1, -1)
        rgb = cv2.cvtColor(im[g['y0']:g['y1'], g['x0']:g['x1']], cv2.COLOR_BGR2RGB); out.append((Image.fromarray(np.dstack([rgb, fill * 255]).astype(np.uint8), 'RGBA'), g['y1']))
    return out
def outline(sp, w, color):  # 縁: 透明の外側に w 画素ひろげた色の面
    al = sp.split()[3].filter(ImageFilter.MaxFilter(2 * w + 1)); o = Image.new('RGBA', sp.size, color + (255,)); o.putalpha(al); return o
sheets = {s: cut(s) for s in SRC}; table = {}
os.makedirs(os.path.join(ROOT, 'img/map'), exist_ok=True)
for name, (s, i) in POSE.items():
    im, y1 = sheets[s][i]; S = S0 * MULT[name]; w, h = im.size; a = np.array(im)[:, :, 3] > 0
    ys, xs = np.nonzero(a[int(h * 0.55):]); ax = xs.mean()
    W, H = round(w * S), round(h * S); sp = im.resize((W, H), Image.LANCZOS)
    cv = Image.new('RGBA', (W + 2 * PAD, H + 2 * PAD), (0, 0, 0, 0)); big = Image.new('RGBA', cv.size, (0, 0, 0, 0)); big.paste(sp, (PAD, PAD))
    cv.alpha_composite(outline(big, 3, (60, 40, 22))); cv.alpha_composite(outline(big, 2, (255, 255, 255))); cv.alpha_composite(big)
    cv.save(os.path.join(ROOT, 'img/map/zp_%s.webp' % name), 'WEBP', quality=92, method=6, exact=True)
    table[name] = [cv.width, cv.height, round(PAD + ax * S), round(PAD + H - (y1 - BASE) * S)]   # 幅・高さ・足もとの中心の x・足もとの線の y(絵の左上から)
print('const ZP = ' + json.dumps(table, ensure_ascii=False).replace('"', '') + ';')
