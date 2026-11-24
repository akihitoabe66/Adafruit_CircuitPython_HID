#!/bin/sh
# BGM(audio/*.mp3)を、展開(デコード)のいらない WAV(48000Hz・モノラル・16bit)に変換して、同じ名前の .wav として置く。
# 使い方:  sh tools/make_bgm_wav.sh        (mahjong フォルダで)   元に戻すには  sh tools/make_bgm_wav.sh --clean
# ゲームは、同じ名前の .wav があれば、そちらを使う(MJ_NOWAV=1 で .mp3 を使う)。 容量は 全部で 300MB ほど(SDカードの空きを確認)。 git には入れない。
cd "$(dirname "$0")/.." || exit 1
if [ "$1" = "--clean" ]; then rm -f audio/*.wav; echo "wavを消しました"; exit 0; fi
command -v ffmpeg >/dev/null 2>&1 || { echo "ffmpeg がありません: sudo apt install ffmpeg"; exit 1; }
RATE="${MJ_AFREQ:-48000}"
for f in audio/*.mp3; do
  o="${f%.mp3}.wav"; [ -f "$o" ] && [ "$o" -nt "$f" ] && { echo "済: $o"; continue; }
  echo "変換: $f -> $o"; ffmpeg -v error -y -i "$f" -ar "$RATE" -ac 1 -c:a pcm_s16le "$o" || { rm -f "$o"; echo "失敗: $f"; exit 1; }
done
du -sh audio/*.wav 2>/dev/null | tail -1; df -h . | tail -1
