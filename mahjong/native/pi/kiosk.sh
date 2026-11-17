#!/bin/sh
# 家電のように使うための起動スクリプト(電源を入れる → ゲーム、 ゲームを終了 → コンセントを抜く)。
#   ・ゲームが始まるまで、文字(コマンド)は見せず、「ゲーム起動中」の絵だけを出す
#   ・ゲームを終えたら「終了の準備中」→(書きこみが終わったら)「コンセントを抜いてください」の絵を出す(コマンドの画面には戻らない)
# 開発用に、普通の画面(ターミナル)へ戻りたいときは、セーブの置き場に DEV という名前の空のファイルを作る:  touch /boot/firmware/mjdata/DEV
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

show() { pkill -x fbi 2>/dev/null; [ -f "$1" ] && command -v fbi >/dev/null 2>&1 && (sudo -n fbi -T 1 -d /dev/fb0 -noverbose -a "$1" >/dev/null 2>&1 &); }
hide() { pkill -x fbi 2>/dev/null; sudo -n pkill -x fbi 2>/dev/null; }

[ -z "$DEV" ] && { printf '\033[?25l\033[2J\033[H'; show "$SP/booting.png"; }

# ゲームを起動(途中で落ちたら、2回まで やり直す)
[ -z "$DISPLAY" ] && [ -z "$WAYLAND_DISPLAY" ] && export SDL_VIDEODRIVER=${SDL_VIDEODRIVER:-kmsdrm}
try=0
while :; do
  hide
  "$D/native/app/mj" "$D"; rc=$?
  [ $rc -ge 128 ] && [ $try -lt 2 ] && { try=$((try+1)); show "$SP/booting.png"; sleep 1; continue; }
  break
done
[ -n "$DEV" ] && exit $rc

# 終了: 書きこみを終えて、安全にしてから、「抜いてください」
show "$SP/shutting.png"
sync; sleep 2; sync
if [ -n "$BOOTMNT" ]; then
  i=0; while [ $i -lt 8 ]; do sudo -n mount -o remount,ro "$BOOTMNT" 2>/dev/null && break; i=$((i+1)); sleep 1; done   # セーブの領域を「書きこみ禁止」にしておく(このあと いつ抜いても壊れない)
fi
sleep 1
show "$SP/unplug.png"
while :; do sleep 3600; done     # ここで止まる(コマンドの画面には、戻らない)
