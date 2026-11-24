#!/bin/sh
# ビルド(Raspberry Pi Zero W では数分かかります)。 使い方: cd mahjong/native/app && sh build.sh
set -e
OPT="-O2" # 最適化(-O3やARM向けフラグは、起動後に落ちる疑いがあったので、いったん戻した)
cd "$(dirname "$0")"
Q=../quickjs
CF=$(sdl2-config --cflags)
LF=$(sdl2-config --libs)
mkdir -p obj
for f in cutils libbf libregexp libunicode quickjs; do
  [ -f obj/$f.o ] || gcc $OPT -w -I"$Q" -DCONFIG_VERSION='"2021"' -D_GNU_SOURCE -c "$Q/$f.c" -o obj/$f.o
done
# 動画(FFmpeg)。無ければ、動画なしでビルドする: sudo apt install libavcodec-dev libavformat-dev libswscale-dev libswresample-dev libavutil-dev
if pkg-config --exists libavformat libavcodec libswscale libswresample libavutil 2>/dev/null; then
  VF=$(pkg-config --cflags libavformat libavcodec libswscale libswresample libavutil); VL=$(pkg-config --libs libavformat libavcodec libswscale libswresample libavutil)
else
  echo "(FFmpegの開発ファイルが無いので、動画なしでビルドします)"; VF="-DNO_VIDEO"; VL=""
fi
gcc $OPT -w -I"$Q" $CF $VF -o mj main.c obj/*.o $LF $VL -lSDL2_image -lSDL2_ttf -lSDL2_mixer -lm -ldl -lpthread
echo "できました: ./mj"
