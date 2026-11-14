#!/bin/sh
# 動画のファイル名の番号を、4番以降 1つずつ後ろにずらす(新しい4番を入れるため)。 例: 04_xxx.mp4 → 05_xxx.mp4 ... 16_xxx.mp4 → 17_xxx.mp4
# 使い方: 動画のフォルダで  sh /パス/shift_numbers.sh   (サムネイルの .png も、同じようにずらす)
n=99
while [ $n -ge 4 ]; do
  nn=$(printf '%02d' $n); nx=$(printf '%02d' $((n+1)))
  for f in ${nn}_*.mp4 ${nn}_*.m4v ${nn}_*.mov ${nn}_*.mkv ${nn}_*.webm ${nn}_*.png; do
    [ -e "$f" ] || continue
    mv -n "$f" "${nx}${f#${nn}}" && echo "$f -> ${nx}${f#${nn}}"
  done
  n=$((n-1))
done
