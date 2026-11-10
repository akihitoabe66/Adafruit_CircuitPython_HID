#!/usr/bin/env python3
"""Pi版(native/app)の画面とゲームを、ブラウザで動かすための3ファイルを作る(音なし・遅さを真似る)。
使い方: python3 tools/build_web.py 出力フォルダ
  出力: bundle.js(JS全部) / assets.json(画像を data URI にまとめたもの) / chars.txt(使う文字)"""
import base64, json, os, re, sys
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
out = sys.argv[1]
os.makedirs(out, exist_ok=True)
LIST = ['native/app/prelude.js', 'js/tiles.js', 'js/rules.js', 'js/forms.js', 'js/chars.js', 'js/ai.js', 'js/coach.js', 'js/game.js', 'js/banter.js', 'js/banter2.js', 'js/chars2.js', 'js/rank.js', 'native/app/icon.js', 'js/ruby.js', 'js/drill.js', 'native/app/stats.js', 'native/app/learn.js', 'native/app/nsnd.js', 'native/app/nui.js']
src = []
for f in LIST:
    src.append('/* ==== %s ==== */\n' % f + open(os.path.join(root, f), encoding='utf-8').read())
body = '\n;\n'.join(src)
PARAMS = 'gfx,snd,print,__now,__load,__save,__swapab,__quit,__readtext,__slotlist,__slotload,__slotsave,__slotdel,__shanten'
open(os.path.join(out, 'bundle.js'), 'w', encoding='utf-8').write('window.__mjBundle = function (%s) {\n%s\n};\n' % (PARAMS, body))
chars = sorted(set(c for c in body if ord(c) > 0x2000))
open(os.path.join(out, 'chars.txt'), 'w', encoding='utf-8').write(''.join(chars))
assets = {}
for d, _, fs in os.walk(os.path.join(root, 'img')):
    for f in fs:
        p = os.path.join(d, f)
        rel = os.path.relpath(p, root).replace(os.sep, '/')
        mime = {'webp': 'image/webp', 'png': 'image/png', 'jpg': 'image/jpeg', 'svg': 'image/svg+xml'}.get(f.rsplit('.', 1)[-1], 'application/octet-stream')
        assets[rel] = 'data:%s;base64,%s' % (mime, base64.b64encode(open(p, 'rb').read()).decode())
for d, _, fs in (os.walk(os.path.join(root, 'native', 'img')) if os.path.isdir(os.path.join(root, 'native', 'img')) else []): # 実機用に小さくした絵が、あれば、そちらを使う
    for f in fs:
        p = os.path.join(d, f); rel = os.path.relpath(p, os.path.join(root, 'native')).replace(os.sep, '/'); assets[rel] = 'data:image/webp;base64,%s' % base64.b64encode(open(p, 'rb').read()).decode()
for k in [k for k in assets if k.startswith('img/cert') or k.startswith('img/tenbo_')]: del assets[k]  # 実機では使わない絵
json.dump(assets, open(os.path.join(out, 'assets.json'), 'w'))
print('bundle %d bytes, assets %d files, chars %d' % (len(body), len(assets), len(chars)))
