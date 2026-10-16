"""本書の図版（SVG）を生成するモジュール。

寸法はすべて cm で計算し、SVG 上では 1cm = 10 単位で描く。
製図の数値は B96 / W82 / H96 の標準体（身長170cm前後）を例にしている。
"""

import math

FONT = "Noto Sans CJK JP"
INK = "#1d2a3a"
ACCENT = "#9c2f2f"
GUIDE = "#8a96a3"
FILL = "#f3efe6"


def _f(v):
    return f"{v:.1f}"


def catmull(points, closed=False):
    """点列を通る滑らかな曲線（Catmull-Rom→ベジェ）のパス文字列を返す。"""
    pts = [(x * 10, y * 10) for x, y in points]
    if closed:
        pts = pts + pts[:3]
    d = f"M{_f(pts[0][0])},{_f(pts[0][1])}"
    n = len(pts)
    for i in range(n - 1):
        p0 = pts[i - 1] if i > 0 else pts[i]
        p1, p2 = pts[i], pts[i + 1]
        p3 = pts[i + 2] if i + 2 < n else p2
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        d += f" C{_f(c1[0])},{_f(c1[1])} {_f(c2[0])},{_f(c2[1])} {_f(p2[0])},{_f(p2[1])}"
    return d


def line(points):
    d = "M" + " L".join(f"{_f(x * 10)},{_f(y * 10)}" for x, y in points)
    return d


class Svg:
    def __init__(self, x0, y0, w, h, width_mm):
        self.vb = (x0 * 10, y0 * 10, w * 10, h * 10)
        self.width_mm = width_mm
        self.items = []

    def path(self, d, stroke=INK, sw=3.0, fill="none", dash=None):
        da = f' stroke-dasharray="{dash}"' if dash else ""
        self.items.append(
            f'<path d="{d}" stroke="{stroke}" stroke-width="{sw}" fill="{fill}"'
            f' stroke-linejoin="round" stroke-linecap="round"{da}/>'
        )

    def guide(self, points):
        self.path(line(points), stroke=GUIDE, sw=1.4, dash="8,6")

    def text(self, x, y, s, size=2.6, color=INK, anchor="middle", weight="normal", rotate=None):
        tr = f' transform="rotate({rotate} {_f(x * 10)} {_f(y * 10)})"' if rotate else ""
        self.items.append(
            f'<text x="{_f(x * 10)}" y="{_f(y * 10)}" font-family="{FONT}" font-size="{_f(size * 10)}"'
            f' fill="{color}" text-anchor="{anchor}" font-weight="{weight}"{tr}>{s}</text>'
        )

    def dot(self, x, y, r=0.45, color=ACCENT):
        self.items.append(f'<circle cx="{_f(x * 10)}" cy="{_f(y * 10)}" r="{_f(r * 10)}" fill="{color}"/>')

    def arrow_dim(self, a, b, label, off=0.0, size=2.2, side=1):
        """寸法線（両矢印）"""
        (x1, y1), (x2, y2) = a, b
        dx, dy = x2 - x1, y2 - y1
        ln = math.hypot(dx, dy) or 1
        nx, ny = -dy / ln * off, dx / ln * off
        x1, y1, x2, y2 = x1 + nx, y1 + ny, x2 + nx, y2 + ny
        self.path(line([(x1, y1), (x2, y2)]), stroke=ACCENT, sw=1.3)
        for (px, py, sx) in ((x1, y1, 1), (x2, y2, -1)):
            ux, uy = dx / ln * sx, dy / ln * sx
            for s in (0.5, -0.5):
                hx = px + (ux * 1.2 - uy * s)
                hy = py + (uy * 1.2 + ux * s)
                self.path(line([(px, py), (hx, hy)]), stroke=ACCENT, sw=1.3)
        mx, my = (x1 + x2) / 2, (y1 + y2) / 2
        ang = math.degrees(math.atan2(dy, dx))
        if ang > 90 or ang < -90:
            ang += 180
        self.text(mx - dy / ln * 1.0 * side, my + dx / ln * 1.0 * side + 0.7, label, size=size,
                  color=ACCENT, rotate=ang if abs(ang) > 1 else None)

    def render(self):
        x, y, w, h = self.vb
        return (
            f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{_f(x)} {_f(y)} {_f(w)} {_f(h)}"'
            f' width="{self.width_mm}mm" height="{_f(self.width_mm * h / w)}mm">'
            + "".join(self.items)
            + "</svg>"
        )


# ---------------------------------------------------------------------------
# トラウザーズ製図
# ---------------------------------------------------------------------------

def trouser_draft():
    W, H, rise, inseam = 82, 96, 26.0, 76.0
    crotch = rise
    hip = crotch - rise / 3
    knee = crotch + inseam / 2 - 5
    hem = crotch + inseam

    s = Svg(-22, -9, 96, hem + 20, 165)

    # ---- 前 ----
    fh = H / 4 + 0.5           # 前ヒップ
    ff = H / 16 + 0.5          # 前股ぐり出
    total = fh + ff
    side_c = -total / 2
    cf_hip = side_c + fh
    fork = total / 2
    cf_waist = cf_hip - 1.0
    side_w = cf_waist - (W / 4 + 0.5)
    for yy, lab in ((0, "ウエストライン"), (hip, "ヒップライン"), (crotch, "股上線（わたり線）"),
                    (knee, "膝線"), (hem, "裾線")):
        s.guide([(-20, yy), (74, yy)])
        s.text(-21.5, yy - 0.6, lab, size=1.9, anchor="start", color=GUIDE)
    s.guide([(0, -4), (0, hem + 2)])
    s.text(0.6, -4.8, "前折り山線（クリース）", size=1.9, anchor="start", color=GUIDE)

    front = []
    front.append(catmull([(side_w, 0), (side_c + 0.3, hip * 0.55), (side_c, hip), (side_c + 0.6, crotch)]))
    s.path(front[0])
    s.path(catmull([(side_c + 0.6, crotch), (-11.5, knee), (-10, hem)]))
    s.path(line([(-10, hem), (10, hem)]))
    s.path(catmull([(10, hem), (10.6, knee), (fork - 2.5, crotch + 6), (fork, crotch)]))
    # 前股ぐり
    s.path(catmull([(fork, crotch), (cf_hip + 2.6, crotch - 1.6), (cf_hip + 0.2, hip + 2), (cf_hip, hip)]))
    s.path(line([(cf_hip, hip), (cf_waist, 0), (side_w, 0)]))
    s.text(-2.5, crotch + 18, "前パンツ", size=3.2, weight="bold")
    s.dot(fork, crotch)
    s.arrow_dim((side_c, hip + 2.2), (cf_hip, hip + 2.2), f"H/4+0.5={fh:.1f}", size=1.8)
    s.arrow_dim((cf_hip, crotch + 2.2), (fork, crotch + 2.2), f"{ff:.1f}", size=1.8)
    s.arrow_dim((side_w, -2.2), (cf_waist, -2.2), f"W/4+0.5={W/4+0.5:.1f}", size=1.8)
    s.arrow_dim((-10, hem + 2.5), (10, hem + 2.5), "前裾幅 20", size=1.8)

    # ---- 後ろ ----
    ox = 44
    bh = H / 4 + 1.5
    side_bh = ox + side_c - 1.5
    cb_hip = side_bh + bh
    cb_waist = (cb_hip - 2.5, -3.5)
    bfork = (cb_hip + H / 8 + 0.5 - 1.5, crotch + 1.0)
    dart = 1.5
    # 後ろウエスト：CBウエストから W/4+1.5+ダーツ
    bw = W / 4 + 1.5 + dart
    side_bw = (cb_waist[0] - math.sqrt(max(bw ** 2 - 3.5 ** 2, 1)), -0.3)
    s.guide([(ox, -4), (ox, hem + 2)])
    s.path(catmull([side_bw, (side_bh + 0.2, hip * 0.55), (side_bh, hip), (side_bh + 0.7, crotch + 1)]))
    s.path(catmull([(side_bh + 0.7, crotch + 1), (ox - 12.5, knee), (ox - 11, hem)]))
    s.path(line([(ox - 11, hem + 0.6), (ox + 11, hem + 0.6)]))
    s.path(catmull([(ox + 11, hem + 0.6), (ox + 12.2, knee), (bfork[0] - 4, crotch + 7), bfork]))
    # 後ろ股ぐり（尻ぐり）
    s.path(catmull([bfork, (cb_hip + 4.5, crotch - 0.4), (cb_hip + 1.0, hip + 3.5), (cb_hip, hip)]))
    s.path(line([(cb_hip, hip), cb_waist]))
    s.path(line([cb_waist, side_bw]))
    # ダーツ
    mx = (cb_waist[0] + side_bw[0]) / 2
    my = (cb_waist[1] + side_bw[1]) / 2
    s.path(line([(mx - dart / 2, my - 0.1), (mx, my + 11), (mx + dart / 2, my - 0.1)]), sw=2)
    s.text(ox - 2, crotch + 18, "後ろパンツ", size=3.2, weight="bold")
    s.dot(*bfork)
    s.text(cb_waist[0] + 0.8, cb_waist[1] - 0.8, "後ろ中心を3.5上げ・2.5内へ", size=1.7, anchor="start", color=ACCENT)
    s.arrow_dim((side_bh, hip + 2.2), (cb_hip, hip + 2.2), f"H/4+1.5={bh:.1f}", size=1.8)
    s.arrow_dim((ox - 11, hem + 3.0), (ox + 11, hem + 3.0), "後ろ裾幅 22", size=1.8)
    s.text(mx, my + 13.2, "ダーツ1.5", size=1.7, color=ACCENT)
    s.text(37, hem + 8.2, "例：W82・H96・股上26・股下76（単位cm、縫い代なし）", size=2.0, color=GUIDE)
    return s.render()


# ---------------------------------------------------------------------------
# ジャケット製図（3パネル：後ろ・脇・前）
# ---------------------------------------------------------------------------

def jacket_draft():
    B = 96
    half = (B + 16) / 2      # 56
    back_w = B / 6 + 4.5     # 20.5
    chest_w = B / 6 + 3      # 19
    cf = half
    scye = B / 6 + 9.5       # 25.5
    waist, hipl, hem = 45.0, 65.0, 74.0

    s = Svg(-6, -9, 80, 94, 165)
    for yy, lab in ((0, ""), (scye, "胸囲線"), (waist, "ウエストライン"), (hipl, "ヒップライン"), (hem, "裾線")):
        s.guide([(-3, yy), (70, yy)])
        if lab:
            s.text(-5.5, yy - 0.6, lab, size=1.9, anchor="start", color=GUIDE)
    s.guide([(back_w, -3), (back_w, scye + 4)])
    s.guide([(cf - chest_w, -3), (cf - chest_w, scye + 4)])
    s.guide([(cf, -3), (cf, hem + 3)])
    s.text(cf + 0.5, -3.8, "前中心", size=1.9, anchor="start", color=GUIDE)

    # --- 後ろ身頃 ---
    neck_b = (B / 12 + 1, -2.5)
    sh_b = (23.0, 2.5)
    s.path(catmull([(0, 0), (4.5, -0.3), (neck_b[0] - 1, -1.6), neck_b]))
    s.path(line([neck_b, sh_b]))
    s.path(catmull([sh_b, (21.3, 9), (back_w, 15.5), (back_w + 0.6, 19.5)]))
    # 背中心（ウエストで2cmしぼる）
    s.path(catmull([(0, 0), (0, 12), (1.2, scye), (2.0, waist), (1.6, hem)]))
    # 後ろ/脇の切替
    s.path(catmull([(back_w + 0.6, 19.5), (back_w - 0.3, scye + 4), (19.4, waist), (21.0, hem)]))
    s.path(line([(1.6, hem), (21.0, hem)]))
    s.text(10, 38, "後ろ身頃", size=3.0, weight="bold")

    # --- 脇身頃 ---
    s.path(catmull([(back_w + 0.6, 19.5), (back_w + 1.8, scye + 1.2), (27.5, scye + 1.0),
                    (33.5, scye + 0.3), (35.2, scye - 3.0)]))
    s.path(catmull([(back_w + 0.6, 19.5), (back_w + 1.6, scye + 4), (21.6, waist), (20.2, hem)]))
    s.path(catmull([(35.2, scye - 3.0), (34.6, scye + 4), (33.6, waist), (36.4, hem)]))
    s.path(line([(20.2, hem), (36.4, hem)]))
    s.text(28, 50, "脇身頃", size=3.0, weight="bold")

    # --- 前身頃 ---
    neck_f = (cf - B / 12, -1.0)
    sh_f = (35.5, 5.0)
    s.path(line([sh_f, neck_f]))
    s.path(catmull([sh_f, (36.6, 13), (cf - chest_w, 18.0), (35.2, scye - 3.0)]))
    s.path(catmull([(35.2, scye - 3.0), (35.6, scye + 4), (35.2, waist), (35.6, hem + 1.2)]))
    # 前端と裾
    brk = (cf + 2, waist - 1)
    s.path(catmull([brk, (cf + 2, waist + 8), (cf + 1.2, hem - 3), (cf - 3, hem + 1.6)]))
    s.path(catmull([(cf - 3, hem + 1.6), (45, hem + 1.6), (35.6, hem + 1.2)]))
    # ラペル（型紙上は前端の外側に出る）
    s.path(catmull([brk, (cf + 6.0, 24), (cf + 8.2, 10.5), (cf + 7.4, 5.8)]))
    s.path(line([(cf + 7.4, 5.8), (cf + 3.0, 7.0), (cf + 2.4, 4.4)]))
    s.path(catmull([(cf + 2.4, 4.4), (cf - 1.5, 2.6), neck_f]))
    # 返り線
    rl_top = (neck_f[0] + 1.8, neck_f[1] - 0.9)
    s.path(line([brk, rl_top]), stroke=ACCENT, sw=1.8, dash="10,6")
    s.text(cf + 1.0, 20, "返り線", size=1.9, color=ACCENT, rotate=-80)
    # 前ダーツ
    s.path(line([(43.6, 30), (43.0, waist), (43.4, 54), (44.0, waist), (43.6, 30)]), sw=2)
    # 腰ポケット・胸ポケット
    s.path(line([(38.5, 54.5), (53.0, 53.8)]), sw=2.2)
    s.path(line([(41.5, 23.5), (51.5, 22.5)]), sw=2.2)
    # ボタン
    for yy in (waist, waist + 11):
        s.dot(cf, yy, r=0.7, color=INK)
    s.text(47.5, 40, "前身頃", size=3.0, weight="bold")
    s.text(cf + 4.6, 30, "ラペル", size=1.9, color=GUIDE, rotate=-80)

    s.arrow_dim((0, -6), (back_w, -6), f"背幅 B/6+4.5={back_w:.1f}", size=1.7)
    s.arrow_dim((back_w, -6), (cf - chest_w, -6), f"{half-back_w-chest_w:.1f}", size=1.7)
    s.arrow_dim((cf - chest_w, -6), (cf, -6), f"胸幅 B/6+3={chest_w:.0f}", size=1.7)
    s.arrow_dim((-2.2, 0), (-2.2, scye), f"B/6+9.5={scye:.1f}", size=1.7, side=-1)
    s.text(33, hem + 7.0, "例：B96（胸囲ゆとり16cm）・背丈45・着丈74（単位cm、縫い代なし）", size=2.0, color=GUIDE)
    return s.render()


def sleeve_draft():
    cap, length, elbow = 17.5, 60.0, 33.0
    s = Svg(-4, -4, 56, 72, 100)
    # 外袖
    top = [(0, cap), (2.0, 7.5), (8.5, 0.5), (12.5, 0), (17.5, 4.0), (20.5, cap - 4.5), (21.5, cap)]
    s.path(catmull(top))
    s.path(catmull([(21.5, cap), (21.8, elbow - 4), (20.4, elbow), (17.5, length - 1.0)]))
    s.path(line([(17.5, length - 1.0), (4.0, length)]))
    s.path(catmull([(4.0, length), (1.8, elbow + 6), (0.4, elbow), (0, cap)]))
    s.text(11, 32, "外袖", size=3.0, weight="bold")
    # 内袖（右に並べる）
    o = 25
    s.path(catmull([(o, cap - 2.5), (o + 4, cap + 1.8), (o + 10, cap + 0.8), (o + 15.5, cap - 3.0)]))
    s.path(catmull([(o + 15.5, cap - 3.0), (o + 15.2, elbow - 4), (o + 14.0, elbow), (o + 13.0, length - 1.6)]))
    s.path(line([(o + 13.0, length - 1.6), (o + 1.8, length - 0.4)]))
    s.path(catmull([(o + 1.8, length - 0.4), (o + 0.6, elbow + 5), (o + 1.8, elbow), (o, cap - 2.5)]))
    s.text(o + 8, 32, "内袖", size=3.0, weight="bold")
    s.guide([(-2, elbow), (44, elbow)])
    s.text(46, elbow + 0.6, "肘線", size=1.9, color=GUIDE)
    s.arrow_dim((-2, 0), (-2, cap), f"袖山高 {cap}", size=1.7, side=-1)
    s.arrow_dim((43, 0), (43, length), f"袖丈 {length:.0f}", size=1.7)
    s.text(22, 66, "袖山のいせ量の目安：ウールで3〜4cm", size=1.9, color=GUIDE)
    return s.render()


# ---------------------------------------------------------------------------
# 人体シルエットと採寸箇所
# ---------------------------------------------------------------------------

def _body(s, ox, oy, k=1.0, side=False):
    """簡易人体シルエット。ox,oy は頭頂。k は倍率（cm/単位）。"""
    def P(pts):
        return [(ox + x * k, oy + y * k) for x, y in pts]
    if not side:
        s.path(catmull(P([(0, 0), (4, 1.2), (5, 6), (3.6, 11), (0, 12.5), (-3.6, 11), (-5, 6), (-4, 1.2), (0, 0)])), sw=2.2)
        right = [(2.6, 12.5), (3.0, 16), (11, 18.5), (19, 21), (21, 26), (21.8, 40), (22.6, 55), (23.2, 66), (24.5, 76),
                 (22.2, 78), (20.0, 70), (18.4, 58), (16.8, 46), (16.0, 37), (15.0, 50), (15.6, 60), (17.8, 70),
                 (17.4, 92), (14.8, 112), (13.0, 128), (13.6, 151), (16.6, 158), (6.0, 158), (6.4, 150), (5.6, 128),
                 (4.8, 106), (1.4, 84), (0, 82)]
        left = [(-x, y) for x, y in right][::-1]
        s.path(catmull(P(right[:-1] + [(0, 82)])), sw=2.2)
        s.path(catmull(P([(0, 82)] + left[1:])), sw=2.2)
    else:
        s.path(catmull(P([(0, 0), (4.2, 1.5), (6.2, 6.5), (5.2, 10), (5.6, 12.4), (3.2, 12.8), (1.5, 12.4),
                          (-2.8, 11.2), (-5.4, 7), (-4.4, 1.8), (0, 0)])), sw=2.2)
        front = [(3.0, 12.6), (3.4, 16), (8.8, 22), (10.0, 31), (8.6, 40), (8.4, 48), (10.2, 58),
                 (9.6, 70), (8.2, 84), (6.6, 104), (5.0, 122), (6.4, 140), (5.0, 151), (14.8, 158), (-4.0, 158),
                 (-4.6, 150), (-6.2, 140), (-4.0, 122), (-6.0, 104), (-9.4, 86), (-11.0, 76), (-9.6, 66),
                 (-7.6, 52), (-8.6, 38), (-8.0, 22), (-4.6, 15), (-2.4, 12.2)]
        s.path(catmull(P(front)), sw=2.2)


def measure_figure():
    s = Svg(-34, -6, 150, 174, 165)
    k = 1.0
    # 正面
    _body(s, 0, 0, k)
    lines = [
        ((-21, 30), (21, 30), "①胸囲"), ((-16.4, 46), (16.4, 46), "②胴囲"),
        ((-17.6, 64), (17.6, 64), "④尻囲"), ((-15.8, 92), (-3.4, 92), "⑭ワタリ"),
        ((-13.8, 124), (-5.4, 124), "⑮膝"),
    ]
    for a, b, lab in lines:
        s.path(line([a, b]), stroke=ACCENT, sw=1.6, dash="6,4")
        s.text(b[0] + 1.2, b[1] + 0.8, lab, size=2.6, color=ACCENT, anchor="start")
    s.path(line([(4, 84), (4.6, 150)]), stroke=ACCENT, sw=1.8)
    s.text(8, 140, "⑬股下", size=2.6, color=ACCENT, anchor="start")
    s.text(0, -2, "正面", size=3.4, weight="bold")
    # 背面
    bx = 60
    _body(s, bx, 0, k)
    s.path(catmull([(bx - 11, 17.5), (bx, 15.5), (bx + 11, 17.5)]), stroke=ACCENT, sw=1.8)
    s.text(bx + 12, 16.8, "⑤肩幅", size=2.6, color=ACCENT, anchor="start")
    s.path(line([(bx - 13.5, 27), (bx + 13.5, 27)]), stroke=ACCENT, sw=1.6, dash="6,4")
    s.text(bx + 14.5, 27.8, "⑥背幅", size=2.6, color=ACCENT, anchor="start")
    s.path(line([(bx, 13), (bx, 46)]), stroke=ACCENT, sw=1.8)
    s.text(bx - 1.2, 40, "⑦背丈", size=2.6, color=ACCENT, anchor="end")
    s.path(line([(bx + 3, 13), (bx + 3, 76)]), stroke=ACCENT, sw=1.2, dash="3,3")
    s.text(bx + 4, 72, "⑧着丈", size=2.6, color=ACCENT, anchor="start")
    s.path(catmull([(bx + 11, 17.5), (bx + 21.4, 26), (bx + 22.4, 52), (bx + 23.6, 72)]), stroke=ACCENT, sw=1.8)
    s.text(bx + 25, 50, "⑨袖丈", size=2.6, color=ACCENT, anchor="start")
    s.path(line([(bx + 18.5, 115), (bx + 18.0, 156)]), stroke=ACCENT, sw=1.2, dash="3,3")
    s.path(line([(bx + 18.8, 46), (bx + 18.5, 115)]), stroke=ACCENT, sw=1.8)
    s.text(bx + 20, 100, "⑫パンツ総丈", size=2.6, color=ACCENT, anchor="start")
    s.text(bx, -2, "背面", size=3.4, weight="bold")
    s.text(40, 168, "番号は採寸順。⑩首回り ⑪股上 ③腹囲 などは本文参照", size=2.4, color=GUIDE)
    return s.render()


def blank_figures():
    """採寸フォーム用：正面・側面の書き込み用シルエット"""
    s = Svg(-26, -3, 80, 170, 46)
    _body(s, 0, 0)
    _body(s, 40, 0, side=True)
    s.text(0, 162.5, "正面", size=4)
    s.text(40, 162.5, "側面", size=4)
    return s.render()


# ---------------------------------------------------------------------------
# 裁断配置図
# ---------------------------------------------------------------------------

def cutting_layout():
    fw, ln = 75, 320  # わ（二つ折り）で幅75、長さ320
    s = Svg(-14, -14, ln + 28, fw + 34, 165)
    s.path(line([(0, 0), (ln, 0), (ln, fw), (0, fw), (0, 0)]), sw=2.4, fill=FILL)
    s.text(-4, fw / 2, "わ（折り山）", size=6, rotate=-90)
    s.text(ln / 2, -4, "生地幅150cmを中表に二つ折り（耳をそろえる）── 用尺 約3.2m", size=6.5)
    s.text(ln + 7, fw / 2, "耳", size=6)
    s.path(line([(ln + 2, fw - 6), (ln + 2, 6)]), stroke=ACCENT, sw=2.4)
    s.text(ln / 2, fw + 10, "→ たて地＝生地の長さ方向。型紙の地の目線はすべて耳と平行に", size=6.0, color=ACCENT)

    def piece(x, y, w, h, name, dash=None):
        s.path(line([(x, y), (x + w, y), (x + w, y + h), (x, y + h), (x, y)]), sw=2.0, fill="#ffffff", dash=dash)
        s.text(x + w / 2, y + h / 2 + 1.8, name, size=5.2)

    # パンツ
    piece(4, 4, 112, 33, "後ろパンツ")
    piece(4, 39, 112, 30, "前パンツ")
    # ジャケット
    piece(120, 3, 78, 30, "後ろ身頃")
    piece(120, 36, 80, 34, "前身頃")
    piece(204, 3, 62, 22, "外袖")
    piece(204, 28, 58, 18, "内袖")
    piece(204, 49, 54, 20, "脇身頃")
    piece(270, 3, 46, 12, "見返し")
    piece(270, 18, 44, 9, "ウエストベルト")
    piece(270, 30, 26, 9, "表衿")
    piece(270, 42, 40, 14, "玉縁・フラップ")
    piece(270, 59, 44, 12, "残布・予備", dash="6,5")
    return s.render()


# ---------------------------------------------------------------------------
# 部位名称図・毛芯構成・ハサミ
# ---------------------------------------------------------------------------

def jacket_parts():
    s = Svg(-72, -6, 150, 90, 165)
    # 簡易ジャケット正面
    body = [(0, 6), (-6, 4), (-16, 7), (-19, 12), (-20, 30), (-19, 50), (-18, 74), (-3, 76), (0, 74)]
    s.path(catmull(body), sw=2.6)
    s.path(catmull([(0, 6), (6, 4), (16, 7), (19, 12), (20, 30), (19, 50), (18, 74), (5, 76), (2, 72)]), sw=2.6)
    # 袖
    s.path(catmull([(-19, 12), (-24, 22), (-26, 46), (-27, 64), (-21, 65), (-20.5, 44), (-20, 30)]), sw=2.4)
    s.path(catmull([(19, 12), (24, 22), (26, 46), (27, 64), (21, 65), (20.5, 44), (20, 30)]), sw=2.4)
    # 衿・ラペル
    s.path(line([(-6, 4), (-8, 12), (-11, 13), (-9, 18), (0, 46)]), sw=2.2)
    s.path(line([(6, 4), (8, 12), (11, 13), (9, 18), (1.5, 46)]), sw=2.2)
    s.path(line([(-6, 4), (0, 9), (6, 4)]), sw=1.6)
    # ボタン・ポケット
    s.dot(1, 47, r=0.9, color=INK)
    s.dot(1, 58, r=0.9, color=INK)
    s.path(line([(-15, 57), (-5, 56.5)]), sw=2.2)
    s.path(line([(-15, 57), (-15, 61), (-5, 60.5), (-5, 56.5)]), sw=1.4)
    s.path(line([(15, 57), (5, 56.5)]), sw=2.2)
    s.path(line([(15, 57), (15, 61), (5, 60.5), (5, 56.5)]), sw=1.4)
    s.path(line([(-15.5, 27), (-8.5, 26)]), sw=2.2)
    for i in range(4):
        s.dot(-25.3 + i * 0.35, 59.5 - i * 2.0, r=0.5, color=INK)

    labels = [
        ((-8, 12), (-31, 4), "ゴージライン（衿刻み）"),
        ((-11, 13), (-31, 10), "ノッチ（刻み）"),
        ((-6, 30), (-31, 30), "ラペル（下衿）"),
        ((-12, 27), (-31, 22), "胸ポケット（箱）"),
        ((-10, 57), (-31, 52), "腰ポケット（フラップ）"),
        ((-24.5, 58), (-31, 64), "袖ボタン（本切羽）"),
        ((0.5, 46), (-31, 44), "返り止まり（ゴージから続く返り線の終点）"),
        ((4, 6), (40, 2), "上衿（表衿）"),
        ((16, 7), (40, 9), "肩線・肩先"),
        ((23, 20), (40, 18), "袖山（いせ込み）"),
        ((19.5, 40), (40, 38), "脇身頃との切替"),
        ((1, 58), (40, 56), "前端・ボタン（2つボタン）"),
        ((10, 75.5), (40, 74), "前裾のカット（カッタウェイ）"),
    ]
    for p, t, lab in labels:
        s.path(line([p, (t[0] + (2 if t[0] < 0 else -2), t[1])]), stroke=GUIDE, sw=1.0)
        s.text(t[0], t[1] + 0.8, lab, size=2.5, anchor="end" if t[0] < 0 else "start")
        s.dot(*p, r=0.45)
    return s.render()


def canvas_layers():
    s = Svg(0, 0, 175, 70, 160)
    layers = [
        ("表地（前身頃）", "#d9d2c3", 0),
        ("毛芯（ヘアクロス：ウール＋馬毛）", "#b8a986", 8),
        ("胸増し芯（毛芯をもう1枚／馬毛のバス芯）", "#9b8a62", 16),
        ("フェルト／ドミット（胸の膨らみと肌あたり）", "#e8e2d4", 24),
    ]
    for name, col, i in layers:
        x0, y0 = 8 + i * 1.4, 6 + i
        s.path(catmull([(x0, y0 + 30), (x0 + 6, y0 + 10), (x0 + 22, y0 + 2), (x0 + 40, y0 + 2),
                        (x0 + 48, y0 + 14), (x0 + 44, y0 + 30), (x0, y0 + 30)]),
               fill=col, sw=1.6)
        s.text(84, y0 + 10, name, size=3.4, anchor="start")
        s.path(line([(x0 + 44, y0 + 9), (82, y0 + 9)]), stroke=GUIDE, sw=1)
    s.text(88, 66, "体側（裏側）へ行くほど上の層。八刺しで一体化してから身頃に据える", size=3.0, color=GUIDE)
    return s.render()


def shears_figure():
    s = Svg(0, 0, 215, 58, 165)
    sizes = [(24, "240mm（約9.5インチ）：薄地・小物"), (26, "260mm（約10インチ）：最初の1本に最適"),
             (28, "280mm（約11インチ）：スーツ地全般"), (30, "300mm（約12インチ）：紳士服の標準的な裁ち鋏"),
             (35, "12〜14インチ（約30〜35cm）以上：英国テーラーの大型シアーズ")]
    y = 6
    for L, lab in sizes:
        handle = L * 0.38
        s.path(catmull([(2, y + 1.4), (6, y - 1.2), (2 + handle, y), (2 + handle - 1, y + 2.6), (2, y + 1.4)]),
               fill="#2c3440", sw=1)
        s.path(line([(2 + handle, y), (2 + L * 3.6, y + 0.4), (2 + handle, y + 1.6)]), fill="#c9cfd6", sw=1.2)
        s.text(2 + L * 3.6 + 3, y + 1.4, lab, size=3.0, anchor="start")
        y += 10.5
    s.text(2, 54, "※図の長さは相対比較用（同一縮尺）", size=2.6, anchor="start", color=GUIDE)
    return s.render()


ALL = {
    "TROUSER_DRAFT": trouser_draft,
    "JACKET_DRAFT": jacket_draft,
    "SLEEVE_DRAFT": sleeve_draft,
    "MEASURE_FIGURE": measure_figure,
    "BLANK_FIGURES": blank_figures,
    "CUTTING_LAYOUT": cutting_layout,
    "JACKET_PARTS": jacket_parts,
    "CANVAS_LAYERS": canvas_layers,
    "SHEARS": shears_figure,
}
