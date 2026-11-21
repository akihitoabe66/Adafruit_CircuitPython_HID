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
FONT = ImageFont.truetype('/usr/share/fonts/opentype/unifont/unifont_jp.otf', 16)
def text_bits(s):
    w = int(FONT.getlength(s)); im = Image.new('L', (max(1, w), 16), 0); ImageDraw.Draw(im).text((0, 0), s, font=FONT, fill=255)
    return (np.array(im) >= 128).astype(np.uint8)
def pack(a):
    a = np.asarray(a, dtype=np.uint8); h, w = a.shape
    return (w, h, tuple(int(''.join(str(int(v)) for v in r), 2) for r in a))
STAGES = [('たまご', 0, 41), ('ちびずんだ', 5, 24), ('げんきずんだ', 30, 25), ('おうさまずんだ', 100, 27), ('ひーろーずんだ', 300, 46)]
LABELS = ['たまご', 'ちびずんだ', 'げんきずんだ', 'おうさまずんだ', 'ひーろーずんだ', 'なかよし', 'かしこさ', 'つよさ', 'いくのだ！', 'ねむいのだ…', 'おきるのだ…', 'ツン', 'ツンデレ', 'ちょいデレ', 'しんゆう', 'はじめまして']
out = ['# make_oled_pet.py が作る(手で直さない)。 STAGE=成長の姿(はじまりの回数, 幅, 高さ, 行ごとの整数) / LAB=日本語の見出し(幅, 高さ16, 行ごとの整数)', 'STAGE = [']
for n, g, i in STAGES:
    w, h, rows = pack(S['s2'][i]); out.append('    (%d, %d, %d, (%s)),   # %s' % (g, w, h, ', '.join('0x%x' % v for v in rows), n))
out.append(']'); out.append('LAB = {')
for t in LABELS:
    w, h, rows = pack(text_bits(t)); out.append('    %r: (%d, %d, (%s)),' % (t, w, h, ', '.join('0x%x' % v for v in rows)))
out.append('}')
out.append('# LINES = 節目の言葉: 遊んだ回数 -> (幅, 16行ぶんの16進数(1行 = 幅を4の倍数に切り上げた桁数))')
out.append('LINES = {')
for g, t in PLINES:
    a = text_bits(t + '　'); h, w = a.shape; per = (w + 3) // 4
    out.append('    %d: (%d, %r),' % (g, w, ''.join('%0*x' % (per, int(''.join(str(int(v)) for v in r), 2) << (per * 4 - w)) for r in a)))
out.append('}')
open(os.path.join(R, 'native/pi/oled_pet.py'), 'w', encoding='utf-8').write('\n'.join(out) + '\n')
print('ok', os.path.getsize(os.path.join(R, 'native/pi/oled_pet.py')))
