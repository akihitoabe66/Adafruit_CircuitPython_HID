#!/bin/sh
# ※ もう使いません: ゲームは、boot の mjdata/video の「01.mp4〜18.mp4」だけを読むようになりました(番号をずらす必要はありません)。
# ビデオの番号を、2番以降 1つずつ後ろにずらす(ラズパイの中で完結)。 新しい2番の動画を入れるため。
# 使い方:  sh ~/Adafruit_CircuitPython_HID/mahjong/native/pi/shift_videos.sh
# 動画の置き場所(boot の mjdata/video など)を、自動で探します。 1つの置き場所につき、1回だけ(2回目は何もしません)。
FROM=2
DRY=0; [ "$1" = "-n" ] && DRY=1   # -n: 動かさずに、動かす内容だけ 見せる
found=0
for d in /boot/firmware/mjdata/video /boot/mjdata/video "$HOME/mjdata/video"; do
  [ -d "$d" ] || continue
  found=1
  echo "== $d"
  if [ $DRY = 0 ] && [ -e "$d/_shifted_from$FROM.txt" ]; then echo "   すでに ずらしてあります(何もしません)"; continue; fi
  S=""; [ -w "$d" ] || S="sudo"   # boot の領域は、書きこめないとき sudo を使う
  n=99
  while [ $n -ge $FROM ]; do
    nn=$(printf '%02d' $n); nx=$(printf '%02d' $((n+1)))
    for f in "$d"/${nn}_*.mp4 "$d"/${nn}_*.m4v "$d"/${nn}_*.mov "$d"/${nn}_*.mkv "$d"/${nn}_*.webm "$d"/${nn}_*.png; do
      [ -e "$f" ] || continue
      b=$(basename "$f"); nb="${nx}${b#${nn}}"
      if [ -e "$d/$nb" ]; then echo "   スキップ(すでにある): $nb"; continue; fi
      if [ $DRY = 1 ]; then echo "   (見るだけ) $b -> $nb"; else $S mv "$f" "$d/$nb" && echo "   $b -> $nb"; fi
    done
    n=$((n-1))
  done
  if [ $DRY = 1 ]; then echo "   (見るだけでした。 何も動かしていません)"; else echo ずらし済み | $S tee "$d/_shifted_from$FROM.txt" >/dev/null; echo "   できました"; fi
done
[ $found = 0 ] && echo "動画の置き場所が見つかりませんでした(動画をSDに入れていなければ、このままで大丈夫です)。"
exit 0
