#!/bin/sh
# stall.log を、写真1枚(40行ほど)で 読める 短さにして 表示する。  使い方:  sh native/pi/log_summary.sh [何行(ふつう 40)]
# ・いちばん あたらしい「start」(ゲームを起動した印)から あとだけ ・長い JSON は 画面名だけに ・memstat は 数字だけ
N="${1:-40}"
for f in "$HOME/mjdata/stall.log" /boot/firmware/mjdata/stall.log; do [ -f "$f" ] && { L="$f"; break; }; done
[ -n "$L" ] || { echo "stall.log が みつかりません(MJ_LOG=1 MJ_STALL=100 で 起動してください)"; exit 1; }
# 最後の start 以降(なければ 全部)
S=$(grep -a -n ' start ' "$L" | tail -1 | cut -d: -f1); [ -n "$S" ] || S=1
tail -n +"$S" "$L" | grep -a -E '^(up[0-9]+s|[0-9]{2}:)' | sed -E 's/ \{"mode":"([a-z]+)".*/ [\1]/; s/(memstat [0-9]+ms rss=[0-9]+ avail=[0-9]+ min=[0-9]+ swap=[0-9]+).*/\1/; s/(mem-free [0-9]+ms).*/\1/; s/(audio-gap [0-9]+ms).*/\1/' | cut -c1-78 > /tmp/mj_sum.txt
echo "== $L  ($(wc -l < /tmp/mj_sum.txt) 行 / 最後の起動から) =="
grep -a -v memstat /tmp/mj_sum.txt | tail -n "$N"
echo "-- memstat(最後の3つ) --"; grep -a memstat /tmp/mj_sum.txt | tail -3
