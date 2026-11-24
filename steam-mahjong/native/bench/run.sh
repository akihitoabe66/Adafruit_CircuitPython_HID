#!/bin/sh
# 麻雀の「頭脳」(ルール・CPUの思考)を、小さなJavaScriptエンジン(QuickJS)で動かして、速さを測る。
# 使い方:  cd mahjong/native/bench && sh run.sh
set -e
cd "$(dirname "$0")"
Q=../quickjs
J=../../js
echo "== ビルド(Zero W では数分かかります) =="
if [ ! -x ./qhost ]; then
  gcc -O2 -I"$Q" -DCONFIG_VERSION='"2021"' -D_GNU_SOURCE -w -o qhost host.c \
    "$Q/cutils.c" "$Q/libbf.c" "$Q/libregexp.c" "$Q/libunicode.c" "$Q/quickjs.c" -lm -ldl -lpthread
fi
cat prelude.js $J/tiles.js $J/rules.js $J/forms.js $J/chars.js $J/ai.js $J/game.js bench.js > all.js
echo "== 測定(CPU同士の東風戦を1回、速さ最大で最後まで打つ) =="
./qhost all.js
echo "== 完了。上の「ms/discard」の数字を教えてください =="
