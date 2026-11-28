#!/usr/bin/env python3
"""OLEDに出す日本語の文字(16x16ドット)を、Unifont から取り出して native/pi/oled_jp.py に書く。
 出す文字は、native/app/nui.js の /* OLED-JP-BEGIN */ 〜 /* OLED-JP-END */ の中の日本語と、下の EXTRA。
 使い方: python3 tools/make_oled_font.py     (Unifont: /usr/share/fonts/opentype/unifont/unifont_jp.otf が要る)"""
import os, re
from PIL import Image, ImageDraw, ImageFont
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONT = os.environ.get('UNIFONT', '/usr/share/fonts/opentype/unifont/unifont_jp.otf')
EXTRA = '麻雀先生ゲーム起動中電源を抜いてね保守停止待機危険熱すぎ切って高温電圧注意がたりない無線切れスタートを押してねコントローラーボそとどかあのれ２回'   # mjoled.py が自分で出す文字
src = open(os.path.join(R, 'native/app/nui.js'), encoding='utf-8').read()
m = re.search(r'/\* OLED-JP-BEGIN \*/(.*?)/\* OLED-JP-END \*/', src, re.S)
chars = sorted({c for c in (m.group(1) if m else '') + EXTRA if ord(c) > 127 and not c.isspace()})
f = ImageFont.truetype(FONT, 16)
out = ['# make_oled_font.py が作る(手で直さない)。 16x16の文字。 1文字 = 16行 × 2バイト(左が上位ビット)。 %d文字\nG = {' % len(chars)]
for c in chars:
    im = Image.new('L', (16, 16), 0); ImageDraw.Draw(im).text((0, 0), c, font=f, fill=255)
    px = im.load(); rows = []
    for y in range(16):
        v = 0
        for x in range(16): v = (v << 1) | (1 if px[x, y] >= 128 else 0)
        rows.append(v)
    out.append('    %r: "%s",' % (c, ''.join('%04x' % v for v in rows)))
out.append('}')
open(os.path.join(R, 'native/pi/oled_jp.py'), 'w', encoding='utf-8').write('\n'.join(out) + '\n')
print('wrote native/pi/oled_jp.py:', len(chars), 'chars:', ''.join(chars))
