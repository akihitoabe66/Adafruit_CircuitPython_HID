#!/bin/sh
# ビルド(Raspberry Pi Zero W では数分かかります)。 使い方: cd mahjong/native/app && sh build.sh
set -e
cd "$(dirname "$0")"
Q=../quickjs
CF=$(sdl2-config --cflags)
LF=$(sdl2-config --libs)
mkdir -p obj
for f in cutils libbf libregexp libunicode quickjs; do
  [ -f obj/$f.o ] || gcc -O2 -w -I"$Q" -DCONFIG_VERSION='"2021"' -D_GNU_SOURCE -c "$Q/$f.c" -o obj/$f.o
done
gcc -O2 -w -I"$Q" $CF -o mj main.c obj/*.o $LF -lSDL2_image -lSDL2_ttf -lSDL2_mixer -lm -ldl -lpthread
echo "できました: ./mj"
