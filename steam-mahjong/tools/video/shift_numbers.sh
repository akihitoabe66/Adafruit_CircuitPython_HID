#!/bin/sh
# 動画のファイル名の番号を、指定の番号以降 1つずつ後ろにずらす(新しい動画を入れるため)。 例(2番に入れる): 02_xxx.mp4 → 03_xxx.mp4 ... 
# 使い方: 動画のフォルダで  sh /パス/shift_numbers.sh 2   (2番以降をずらす。 省略すると4番以降。 サムネイルの .png も、同じようにずらす)
FROM=${1:-4}
n=99
while [ $n -ge $FROM ]; do
  nn=$(printf '%02d' $n); nx=$(printf '%02d' $((n+1)))
  for f in ${nn}_*.mp4 ${nn}_*.m4v ${nn}_*.mov ${nn}_*.mkv ${nn}_*.webm ${nn}_*.png; do
    [ -e "$f" ] || continue
    mv -n "$f" "${nx}${f#${nn}}" && echo "$f -> ${nx}${f#${nn}}"
  done
  n=$((n-1))
done
