#!/bin/sh
# 家電のように使うための起動スクリプト(電源を入れる → ゲーム、 ゲームを終了 → コンセントを抜く)。
#   ・ゲームが始まるまで、文字(コマンド)は見せず、「ゲーム起動中」の絵だけを出す
#   ・ゲームを終えたら「終了の準備中」→(書きこみが終わったら)「コンセントを抜いてください」の絵を出す(コマンドの画面には戻らない)
# 更新・保守のとき: ゲーム中に Ctrl+Q を押すと、ふつうのコマンド画面に戻る(メニューの「終了」は、抜く画面)。
# 常にコマンド画面にしたいとき(開発): セーブの置き場に DEV という名前の空のファイルを作る  touch /boot/firmware/mjdata/DEV
D="$(cd "$(dirname "$0")/../.." && pwd)"; SP="$D/native/pi/splash"

# セーブの置き場: SDカードの boot の領域(Windowsからも見える所)。 OSを読みとり専用にしても、ここには書ける
for b in /boot/firmware /boot; do [ -d "$b" ] && BOOTMNT="$b" && break; done
if [ -n "$BOOTMNT" ]; then
  MJ_DATA="$BOOTMNT/mjdata"; mkdir -p "$MJ_DATA" 2>/dev/null || sudo mkdir -p "$MJ_DATA"
  # 前の save.json(ゲームのフォルダにあった設定・成績)を、はじめの1回だけ引っ越し
  [ -f "$MJ_DATA/save.json" ] || { [ -f "$D/save.json" ] && cp "$D/save.json" "$MJ_DATA/save.json"; }
  export MJ_DATA
fi
if [ -n "$MJ_NOAUTO" ] || [ -e "$MJ_DATA/DEV" ]; then DEV=1; fi
# 記録(あとで不具合を調べる用。 1回の起動で 数行だけ。 64KBをこえたら 古い方を .old に)
ev() { [ -n "$MJ_DATA" ] || return 0; f="$MJ_DATA/events.log"; [ "$(wc -c < "$f" 2>/dev/null || echo 0)" -gt 65536 ] && mv -f "$f" "$f.old"; echo "up$(cut -d. -f1 /proc/uptime)s $(date '+%F %T') $*" >> "$f" 2>/dev/null; }
ev boot-start

show() { pkill -x fbi 2>/dev/null; [ -f "$1" ] && command -v fbi >/dev/null 2>&1 && (sudo -n fbi -T 1 -d /dev/fb0 -noverbose -a "$1" >/dev/null 2>&1 &); }
hide() { pkill -x fbi 2>/dev/null; sudo -n pkill -x fbi 2>/dev/null; }

[ -z "$DEV" ] && { printf '\033[?25l\033[2J\033[H'; show "$SP/booting.png"; }

# ゲームを起動(途中で落ちたら、2回まで やり直す)
[ -z "$DISPLAY" ] && [ -z "$WAYLAND_DISPLAY" ] && export SDL_VIDEODRIVER=${SDL_VIDEODRIVER:-kmsdrm}
try=0
while :; do
  hide
  MJ_KIOSK=1 "$D/native/app/mj" "$D"; rc=$?
  [ $rc -ne 0 ] && ev "game-exit rc=$rc"
  [ $rc -ge 128 ] && [ $try -lt 2 ] && { try=$((try+1)); show "$SP/booting.png"; sleep 1; continue; }
  break
done
# Ctrl+Q(終了コード10)・開発用の印(DEV)のときは、更新などのために、ふつうのコマンド画面へ戻る
if [ -n "$DEV" ] || [ $rc -eq 10 ]; then
  hide; printf '\033[?25h\033[2J\033[H'
  echo "== 更新・保守用の画面です(Ctrl+Q で出てきました) =="
  echo "  ゲームを更新する:  sh $D/native/pi/update.sh      (終わると自動で再起動します)"
  echo "  そのまま遊びに戻る: sudo reboot"
  cd "$D" 2>/dev/null; exec "${SHELL:-/bin/bash}"
fi

# 終了: 書きこみを終えて、安全にしてから、「抜いてください」
ev game-exit-normal
show "$SP/shutting.png"
sync; sleep 2; sync
if [ -n "$BOOTMNT" ]; then
  i=0; while [ $i -lt 8 ]; do sudo -n mount -o remount,ro "$BOOTMNT" 2>/dev/null && break; i=$((i+1)); sleep 1; done   # セーブの領域を「書きこみ禁止」にしておく(このあと いつ抜いても壊れない)
fi
sleep 1
show "$SP/unplug.png"
# 「コンセントを抜いてもイイよ」と言ってから、OLED・ブザー(終了のメロディ)に「抜いてよい」を知らせる
"$D/native/app/mj" "$D" --say audio/yk/v_unplug.mp3 >/dev/null 2>&1
printf 'scene=EXIT\npose=calm\nmsg=UNPLUG OK\n' > "${MJ_OLED_FILE:-/dev/shm/mj_oled.txt}" 2>/dev/null
# Raspberry Pi 本体も、きちんと終了させる(メロディが終わって、テレビで「抜いて」の絵を少し見せてから)。 終了させたくないときは、セーブの置き場に NOHALT という名前の空のファイルを作る
if [ -z "$MJ_DATA" ] || [ ! -e "$MJ_DATA/NOHALT" ]; then sleep 12; sudo -n systemctl poweroff 2>/dev/null || sudo -n poweroff 2>/dev/null; fi
while :; do sleep 3600; done     # ここで止まる(コマンドの画面には、戻らない)
