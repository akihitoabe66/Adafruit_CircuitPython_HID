#!/bin/sh
# ビデオの置き場所を調べる(何も動かしません・消しません)。
# ゲームが読むのは、SDカードの boot の mjdata/video に入れた「01.mp4〜18.mp4」(番号だけの名前)だけです。 ほかの名前・ほかの場所の動画は、読みません。
D="${MJ_VIDEO_DIR:-/boot/firmware/mjdata/video}"; [ -d "$D" ] || D=/boot/mjdata/video
TITLES="1:10分で分かる麻雀ルール 2:30分で打てる麻雀ルール 3:麻雀役解説 4:役はこれだけ覚えればOK 5:リーチされたら、この順番で切る 6:ポンしていい? 7:ポンしたらあがれない? 8:スジ、習ったのに忘れる 9:どれが通る? 10:どれを捨てる? 11:捨てた順番で読む、3から5なら? 12:待ちがわからない? 13:役なしロン、防ぐ3つのコツ 14:フリテン、そのロン待った 15:丸暗記、重要な形5選 16:あがったのに点数が言えない 17:7つを整理 18:席決め親決め"
[ -d "$D" ] || { echo "動画の置き場所が見つかりません(/boot/firmware/mjdata/video)"; exit 1; }
echo "== 置き場所: $D =="; ok=0; miss=""
for n in $(seq 1 18); do
  f=$(printf '%02d.mp4' "$n"); t=$(printf '%s' "$TITLES" | tr ' ' '\n' | sed -n "s/^$n://p")
  if [ -f "$D/$f" ]; then
    sz=$(( $(wc -c < "$D/$f") / 1048576 )); info=""; command -v ffprobe >/dev/null 2>&1 && info=$(ffprobe -v error -select_streams v:0 -show_entries stream=profile,width,height,r_frame_rate -of csv=p=0 "$D/$f" 2>/dev/null | tr '\n' ' ')
    printf '%s  あり  %3sMB  %s  %s\n' "$f" "$sz" "$t" "$info"; ok=$((ok+1))
  else printf '%s  ※なし  %s\n' "$f" "$t"; miss="$miss $f"; fi
done
echo; echo "ある: $ok / 18"; [ -n "$miss" ] && echo "足りない:$miss"
echo; echo "== ゲームが読まない(上の18本以外の)ファイル =="
ls "$D" 2>/dev/null | grep -viE '^(0[1-9]|1[0-8])\.mp4$' | sed 's/^/   /'
echo; echo "(調べただけです。 何も動かしていません)"
