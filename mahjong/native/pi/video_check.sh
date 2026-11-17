#!/bin/sh
# ビデオの置き場所を調べる/直す。
#   sh native/pi/video_check.sh          ... 調べるだけ(消したり動かしたりしません)。 番号ごとに、どの動画が使われるかを表にします
#   sh native/pi/video_check.sh --fix    ... 重い動画・番号が重なった動画を、~/video_heavy に「移す」(消しません)。 あとから、もとの場所に戻せます
# 決まり: 番号が同じ動画は1本だけ使う。 ゲームと一緒に配る軽い動画(リポジトリの video フォルダ)を、先に使う。
D="$(cd "$(dirname "$0")/../.." && pwd)"; REPO="$D/video"
DIRS="${MJ_VIDEO_DIRS:-/boot/firmware/mjdata/video /boot/mjdata/video $HOME/mjdata/video}"
HEAVY="${MJ_HEAVY_DIR:-$HOME/video_heavy}"; FIX=0; [ "$1" = "--fix" ] && FIX=1
TITLES="1:10分で分かる麻雀ルール 2:30分で打てる麻雀ルール 3:麻雀役解説 4:役はこれだけ覚えればOK 5:リーチされたら、この順番で切る 6:ポンしていい? 7:ポンしたらあがれない? 8:スジ、習ったのに忘れる 9:どれが通る? 10:どれを捨てる? 11:捨てた順番で読む、3から5なら? 12:待ちがわからない? 13:役なしロン、防ぐ3つのコツ 14:フリテン、そのロン待った 15:丸暗記、重要な形5選 16:あがったのに点数が言えない 17:7つを整理 18:席決め親決め"
num() { b=$(basename "$1"); n=$(printf '%s' "$b" | sed -n 's/^\([0-9][0-9]*\)[_ -].*/\1/p' | sed 's/^0*//'); echo "${n:-0}"; }
mb() { s=$(wc -c < "$1" 2>/dev/null || echo 0); echo $((s / 1048576)); }
info() { if command -v ffprobe >/dev/null 2>&1; then ffprobe -v error -select_streams v:0 -show_entries stream=profile,width,height,r_frame_rate -of csv=p=0 "$1" 2>/dev/null | tr '\n' ' '; fi; }
heavy() { # 重い動画か(大きさ15MB以上、または コマ数が20より多い・幅が640より大きい)
  m=$(mb "$1"); [ "$m" -ge 15 ] && return 0
  if command -v ffprobe >/dev/null 2>&1; then
    l=$(ffprobe -v error -select_streams v:0 -show_entries stream=width,r_frame_rate -of csv=p=0 "$1" 2>/dev/null | head -1)
    if [ -n "$l" ]; then
      w=${l%%,*}; r=${l#*,}; fr=$(awk -v a="${r%%/*}" -v b="${r##*/}" 'BEGIN { if (b > 0) print int(a / b); else print 0 }')
      [ "${w:-0}" -gt 640 ] 2>/dev/null && return 0
      [ "${fr:-0}" -gt 20 ] 2>/dev/null && return 0
    fi
  fi; return 1; }
echo "== 動画の置き場所と、中身 =="
for d in "$REPO" $DIRS; do
  [ -d "$d" ] || { echo "(なし) $d"; continue; }
  echo "[$d]"; ls "$d" 2>/dev/null | grep -iE '\.(mp4|m4v|mov|mkv|webm)$' | while read -r f; do echo "   $f   $(mb "$d/$f")MB  $(info "$d/$f")"; done
done
echo; echo "== 番号ごとの、使われる動画(軽い配布版を先に使います) =="
USED=""; MOVE=""
for n in $(seq 1 18); do
  pick=""; extra=""
  for d in "$REPO" $DIRS; do
    [ -d "$d" ] || continue
    for f in "$d"/*; do
      [ -f "$f" ] || continue; case "$f" in *.mp4|*.m4v|*.mov|*.mkv|*.webm|*.MP4) ;; *) continue;; esac
      [ "$(num "$f")" = "$n" ] || continue
      if [ -z "$pick" ] && ! { [ "$d" != "$REPO" ] && heavy "$f"; }; then pick="$f"; else extra="$extra
$f"; fi
    done
  done
  t=$(printf '%s' "$TITLES" | tr ' ' '\n' | sed -n "s/^$n://p")
  if [ -n "$pick" ]; then printf '%2d  %s\n      使う: %s (%sMB)\n' "$n" "$t" "$pick" "$(mb "$pick")"; else printf '%2d  %s\n      ※ 動画なし(一覧には、サムネイルだけ出ます)\n' "$n" "$t"; fi
  printf '%s\n' "$extra" | while read -r e; do [ -n "$e" ] && echo "      使わない: $e (重い or 番号が重なっている)"; done
  MOVE="$MOVE$extra"
done
echo
echo "== 番号が合わない(1〜18の外)の動画 =="
for d in "$REPO" $DIRS; do [ -d "$d" ] || continue; for f in "$d"/*; do [ -f "$f" ] || continue; case "$f" in *.mp4|*.m4v|*.mov|*.mkv|*.webm) n=$(num "$f"); { [ "$n" -lt 1 ] || [ "$n" -gt 18 ]; } && echo "   $f";; esac; done; done
if [ $FIX = 1 ]; then
  echo; echo "== 移します(消しません): $HEAVY =="; mkdir -p "$HEAVY"
  printf '%s\n' "$MOVE" | while read -r e; do [ -n "$e" ] || continue; case "$e" in "$REPO"/*) echo "   (リポジトリの動画は動かしません) $e"; continue;; esac
    S=""; [ -w "$(dirname "$e")" ] || S="sudo"; $S mv "$e" "$HEAVY/" && echo "   移した: $e"; done
  echo "できました。 もとに戻すには、$HEAVY の中のファイルを、もとの場所へ 移してください。"
else
  echo; echo "(調べただけです。 重い動画・重なった動画を、~/video_heavy に移すには:  sh native/pi/video_check.sh --fix )"
fi
