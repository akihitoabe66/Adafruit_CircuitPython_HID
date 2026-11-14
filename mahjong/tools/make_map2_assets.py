#!/usr/bin/env python3
# 昇段の地図(巻物・2枚め): 青い背景を透明にした巻物の絵、水面の絵(波うたせる用の 横長の帯)、歩く道すじ(赤い線から読み取った)を作る。
# 入力: tools/map_src/scroll2.jpg(巻物) / water.jpg(水面) / scroll2_route.png(赤い点と線)。 出力: img/map/scroll2.webp, img/map/wa0..13.webp, native/app/map2data.js
import os, json, heapq
import numpy as np, cv2
from PIL import Image, ImageFilter
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'); SRC = os.path.join(ROOT, 'tools', 'map_src'); OUT = os.path.join(ROOT, 'img', 'map')
# ---- 巻物: 青い背景(74,126,163)を 透明に
im = Image.open(os.path.join(SRC, 'scroll2.jpg')).convert('RGB'); a = np.array(im).astype(float)
dist = np.sqrt(((a - np.array([74, 126, 163])) ** 2).sum(axis=2)); alpha = np.clip((dist - 22) / 30, 0, 1)
alpha = cv2.GaussianBlur(alpha.astype(np.float32), (0, 0), 0.8)
ys, xs = np.where(alpha > 0.5); bx0, by0, bx1, by1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
rgba = np.dstack([a, alpha * 255]).astype(np.uint8)[by0:by1, bx0:bx1]
AW = 1040; sc = AW / (bx1 - bx0); AH = int(round((by1 - by0) * sc))
Image.fromarray(rgba, 'RGBA').resize((AW, AH), Image.LANCZOS).save(os.path.join(OUT, 'scroll2.webp'), 'WEBP', quality=88, method=6)
# ---- 水面: 960x504 に して 14本の帯に(横にずらして 波うたせる)
wt = Image.open(os.path.join(SRC, 'water.jpg')).convert('RGB').resize((960, 504), Image.LANCZOS)
wt = Image.eval(wt, lambda v: min(255, int(v * 1.12 + 6)))
for i in range(14): wt.crop((0, i * 36, 960, i * 36 + 36)).save(os.path.join(OUT, 'wa%d.webp' % i), 'WEBP', quality=80, method=6)
# ---- 道すじ: 赤い点と線(1375x768の座標)を たどる
r = np.array(Image.open(os.path.join(SRC, 'scroll2_route.png')).convert('RGB')).astype(int)
red = ((r[..., 0] > 200) & (r[..., 1] < 70) & (r[..., 2] < 70)).astype(np.uint8); H, W = red.shape
dt = cv2.distanceTransform(red, cv2.DIST_L2, 5); cost = np.where(red > 0, 1.0 / (dt + 0.5), 1e9)
nodes = {'A': (228, 613), 'B': (192, 490), 'C': (521, 480), 'D': (418, 391), 'E': (771, 417), 'F': (860, 319), 'G': (1015, 327), 'H': (986, 428), 'I': (1201, 387), 'J': (1216, 217)}
def snap(p):
    x, y = p; best = None
    for dy in range(-25, 26):
        for dx in range(-25, 26):
            xx, yy = x + dx, y + dy
            if 0 <= xx < W and 0 <= yy < H and red[yy, xx] and (best is None or dt[yy, xx] > dt[best[1], best[0]]): best = (xx, yy)
    return best
nodes = {k: snap(v) for k, v in nodes.items()}
def dijk(s, t):
    dd = {s: 0}; prev = {}; pq = [(0, s)]
    while pq:
        d, u = heapq.heappop(pq)
        if u == t: break
        if d > dd.get(u, 1e18): continue
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                if dx == 0 and dy == 0: continue
                v = (u[0] + dx, u[1] + dy)
                if 0 <= v[0] < W and 0 <= v[1] < H and red[v[1], v[0]]:
                    nd = d + cost[v[1], v[0]] * (1.414 if dx and dy else 1)
                    if nd < dd.get(v, 1e18): dd[v] = nd; prev[v] = u; heapq.heappush(pq, (nd, v))
    p = [t]
    while p[-1] != s: p.append(prev[p[-1]])
    return p[::-1]
def trace(a, b): return cv2.approxPolyDP(np.array(dijk(nodes[a], nodes[b]), np.int32).reshape(-1, 1, 2), 4.0, False).reshape(-1, 2).tolist()
E_ = {k: trace(k[0], k[1]) for k in ['AB', 'BC', 'CD', 'DE', 'EF', 'FG', 'GH', 'HI', 'GJ']}
def cut(poly, i, j): return poly[i:j + 1]
# 段位ごとの 区間(1段ぶん)。 0=熊本 1=福岡 2=四国 3=中国 4=山城(京) 5=摂津(大阪) 6=信濃 7=越後 8=駿河の手前 9=駿河 10=江戸 11=奥州(天下統一)
de = E_['DE']; fg = E_['FG']; gh = E_['GH']
top = int(np.argmin(np.array(fg)[:, 1]))                          # 越後: 北の海ぞいの、いちばん高いところ
mid = [(gh[0][0] + gh[1][0]) // 2, (gh[0][1] + gh[1][1]) // 2 + 20]  # 駿河の手前
legs = [E_['AB'], E_['BC'], E_['CD'], de[:7], de[6:], E_['EF'], fg[:top + 1], fg[top:] + [gh[1], mid], [mid, gh[2], gh[3]], E_['HI'], E_['HI'][::-1] + gh[::-1][1:] + E_['GJ'][1:]]
# じゅんばんに つなぐ(区間の はじめは、まえの区間の おわり)
for i in range(1, len(legs)): legs[i][0] = legs[i - 1][-1]
data = {'ox': int(bx0), 'oy': int(by0), 'bw': int(bx1 - bx0), 'bh': int(by1 - by0), 'start': legs[0][0], 'legs': legs}
with open(os.path.join(ROOT, 'native', 'app', 'map2data.js'), 'w') as f:
    f.write('// 自動生成(tools/make_map2_assets.py): 昇段の地図の道すじ(元の絵 1375x768 の座標)。 legs[i] = 段位 i→i+1 の道\nglobalThis.MAP2 = ' + json.dumps(data, separators=(',', ':')) + ';\n')
print('scroll bbox', bx0, by0, bx1, by1, 'asset', AW, AH, 'legs', [len(l) for l in legs])
