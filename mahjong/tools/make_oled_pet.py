#!/usr/bin/env python3
"""OLED用の ずんだもんペット(たまごっち風)の絵と、日本語の見出しを、native/pi/oled_pet.py に作る。
 絵: tools/ui_src/pet_sprites.pkl(ユーザーの絵から ドット単位で取り出したもの)の s2 から、成長の姿5つ。
 見出し: Unifont で 16ドット高の絵にして 持たせる(oled_jp.py の文字表に、文字を足さなくて すむ)"""
import os, pickle
import numpy as np
from PIL import Image, ImageDraw, ImageFont
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
import sys; sys.path.insert(0, os.path.join(R, 'tools/ui_src'))
from pet_lines import L as PLINES   # のだ口調の一言(102): (遊んだ回数, 文)
S = pickle.load(open(os.path.join(R, 'tools/ui_src/pet_sprites.pkl'), 'rb'))
SEA = pickle.load(open(os.path.join(R, 'tools/ui_src/pet_season.pkl'), 'rb')); COS = pickle.load(open(os.path.join(R, 'tools/ui_src/pet_costume.pkl'), 'rb'))
# 季節(お正月→春・こどもの日→夏→ハロウィン→秋→クリスマスの順): (名前, 絵の番号, あいさつ)
SEASONS = [('お正月', [12, 13, 14, 15], 'あけまして おめでとうなのだ！'), ('春・こどもの日', [16, 17, 18, 19, 20, 21, 23], 'はるが きたのだ！ こいのぼりなのだ'), ('夏', [22, 24, 25, 26, 27], 'なつなのだ！ すいか たべたいのだ'),
           ('ハロウィン', [6, 7, 8, 9, 10, 11], 'トリックオアトリートなのだ！'), ('秋', [28, 29, 30, 31], 'あきなのだ。 とんぼが いるのだ'), ('クリスマス', [0, 1, 2, 3, 4, 5], 'メリークリスマスなのだ！')]
JOBS_ALL = ['コック', 'えきちょう', 'ゆうびんやさん', 'かしゅ', 'さっか', 'けんちくし', 'はかせ', 'のうか', 'きし', 'まほうつかい', 'じょおう', 'ようせい', 'さむらい', 'かいぞく', 'うちゅうひこうし', 'うらないし', 'いぬに のる', 'きの うろ', 'はっぱの ふね', 'ことりと あそぶ', 'きつねの めん', 'ひつじ', 'よるの さんぽ', 'ひまわり', 'ぺろっ', 'まねきねこ', 'さかだち', 'サングラス', 'カメラ', 'WINの はた', 'りんご', 'ハンモック']
FORM_COS = {4, 5, 6, 8, 9, 10, 11, 12, 13, 14, 15, 16, 25, 30}   # 進化の姿に使う衣装の絵(衣装の一覧からは外す)
JOBS_IDX = [i for i in range(32) if i not in FORM_COS]
JOBS = [JOBS_ALL[i] for i in JOBS_IDX]
FONT = ImageFont.truetype('/usr/share/fonts/opentype/unifont/unifont_jp.otf', 16)
def text_bits(s):
    w = int(FONT.getlength(s)); im = Image.new('L', (max(1, w), 16), 0); ImageDraw.Draw(im).text((0, 0), s, font=FONT, fill=255)
    return (np.array(im) >= 128).astype(np.uint8)
def pack(a):
    a = np.asarray(a, dtype=np.uint8); h, w = a.shape
    return (w, h, tuple(int(''.join(str(int(v)) for v in r), 2) for r in a))

# ---- 進化の姿: (名前の前の部分(4文字まで), 絵, 倍率) ----
s2 = lambda i: S['s2'][i]; cs = lambda i: COS[i]
FIRST = {'riichi': ('りーち', s2(47), 2), 'ron': ('ろん', s2(51), 2), 'tsumo': ('つも', s2(36), 2), 'naki': ('なき', s2(50), 2), 'mamori': ('まもり', s2(40), 2), 'study': ('はかせ', cs(6), 1), 'view': ('たび', s2(45), 2), 'round': ('まるい', s2(31), 2)}
FINAL = {'riichi': (('まほう', cs(9), 1), ('うらない', cs(15), 1)), 'ron': (('さむらい', cs(12), 1), ('にんじゃ', s2(59), 2)), 'tsumo': (('じょおう', cs(10), 1), ('ようせい', cs(11), 1)),
         'naki': (('きし', cs(8), 1), ('かいぞく', cs(13), 1)), 'mamori': (('てっぺき', s2(39), 2), ('まねき', cs(25), 1)), 'study': (('けんじゃ', cs(5), 1), ('さっか', cs(4), 1)),
         'view': (('うちゅう', cs(14), 1), ('ぶらり', cs(16), 1)), 'round': (('ひーろー', s2(46), 2), ('のんびり', cs(30), 1))}
HINTS = {'riichi': 'いま リーチが おおめなのだ', 'ron': 'いま ロンが おおめなのだ', 'tsumo': 'いま ツモが おおめなのだ', 'naki': 'いま なきが おおめなのだ', 'mamori': 'いま ふりこまないのだ',
         'study': 'いま べんきょうちゅうなのだ', 'view': 'いま ものしりになってるのだ', 'win': 'いま かちぐせなのだ', 'lose': 'いま まけぐせなのだ…'}
STAGES = [('たまご', 0, 41), ('ちびずんだ', 5, 24), ('げんきずんだ', 30, 25), ('おうさまずんだ', 100, 27), ('ひーろーずんだ', 300, 46)]
LABELS = ['たまご', 'ちびずんだ', 'げんきずんだ', 'おうさまずんだ', 'ひーろーずんだ', 'なかよし', 'かしこさ', 'つよさ', 'いくのだ！', 'ねむいのだ…', 'おきるのだ…', 'ツン', 'ツンデレ', 'ちょいデレ', 'しんゆう', 'はじめまして', 'あそんだ', 'クイズ', 'だんい', '無段', '初段', '二段', '三段', '四段', '五段', '六段', '七段', '八段', '九段', '名人', '永世名人', 'ずんだ', 'あと', 'しんか', 'したのだ', 'うまれた', 'のだ', 'あそぶと', 'すがたが', 'かわるぞ', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'] + [v[0] for v in FIRST.values()] + [x[0] for p in FINAL.values() for x in p]
out = ['# make_oled_pet.py が作る(手で直さない)。 STAGE=成長の姿(はじまりの回数, 幅, 高さ, 行ごとの整数) / LAB=日本語の見出し(幅, 高さ16, 行ごとの整数)', 'STAGE = [']
for n, g, i in STAGES:
    w, h, rows = pack(S['s2'][i]); out.append('    (%d, %d, %d, (%s)),   # %s' % (g, w, h, ', '.join('0x%x' % v for v in rows), n))
out.append(']'); out.append('LAB = {')
for t in LABELS:
    w, h, rows = pack(text_bits(t)); out.append('    %r: (%d, %d, (%s)),' % (t, w, h, ', '.join('0x%x' % v for v in rows)))
out.append('}')
out.append('# FORM1 = 100回めの姿 {id: (名前の前の部分, 倍率, 幅, 高さ, 行)} / FORM2 = 300回めの最終の姿 {id: [かちぐせ, まけぐせ]}')
def fo(t):
    n, a, k = t; w, h, rows = pack(a); return '(%r, %d, %d, %d, (%s))' % (n, k, w, h, ', '.join('0x%x' % v for v in rows))
out.append('FORM1 = {%s}' % ', '.join('%r: %s' % (i, fo(v)) for i, v in FIRST.items()))
out.append('FORM2 = {%s}' % ', '.join('%r: [%s, %s]' % (i, fo(v[0]), fo(v[1])) for i, v in FINAL.items()))
for k, t in HINTS.items(): PLINES.append(('h:' + k, t))
for n, _, ln in SEASONS: PLINES.append(('s:' + n, ln))
for n in JOBS: PLINES.append(('c:' + n, n + ' に へんしん なのだ！'))
out.append('# LINES = 節目の言葉: 遊んだ回数 -> (幅, 16行ぶんの16進数(1行 = 幅を4の倍数に切り上げた桁数))')
out.append('LINES = {')
for g, t in PLINES:
    a = text_bits(t + '　'); h, w = a.shape; per = (w + 3) // 4
    out.append('    %r: (%d, %r),' % (g, w, ''.join('%0*x' % (per, int(''.join(str(int(v)) for v in r), 2) << (per * 4 - w)) for r in a)))
out.append('}')
out.append('# SEASONS = 季節の順(名前, 絵の番号) / SEA = 季節の絵 / JOBS = 職業の名前 / COS = 職業の絵(15回ごとに ひとつ ふえる)。 絵は (幅, 高さ, 行ごとの整数)')
out.append('SEASONS = %r' % [(n, i) for n, i, _ in SEASONS])
out.append('SEA = {')
for n, idx, _ in SEASONS:
    for i in idx: w, h, rows = pack(SEA[i]); out.append('    %d: (%d, %d, (%s)),' % (i, w, h, ', '.join('0x%x' % v for v in rows)))
out.append('}'); out.append('JOBS = %r' % JOBS); out.append('COS = (')
for i in JOBS_IDX: w, h, rows = pack(COS[i]); out.append('    (%d, %d, (%s)),' % (w, h, ', '.join('0x%x' % v for v in rows)))
out.append(')')
open(os.path.join(R, 'native/pi/oled_pet.py'), 'w', encoding='utf-8').write('\n'.join(out) + '\n')
print('ok', os.path.getsize(os.path.join(R, 'native/pi/oled_pet.py')))
