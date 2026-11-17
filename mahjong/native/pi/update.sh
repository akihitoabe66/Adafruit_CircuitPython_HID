#!/bin/sh
# ゲームを最新にする(git pull)。 OSが読みとり専用(readonly_on.sh のあと)でも、これ1本でできる。 終わったら自動で再起動する。
# 使い方: ゲーム中に Ctrl+Q → コマンド画面で  sh ~/Adafruit_CircuitPython_HID/mahjong/native/pi/update.sh
D="$(cd "$(dirname "$0")/../.." && pwd)"; REPO="$(git -C "$D" rev-parse --show-toplevel)"
LOWER=""
for m in /media/root-ro /mnt/root-ro; do grep -q " $m " /proc/mounts && LOWER="$m" && break; done
if [ -n "$LOWER" ]; then
  # 読みとり専用(overlay)のとき: 元のディスク(下の層)を、いっとき書きこみ可にして、そこで git pull
  R="$LOWER$REPO"
  echo "読みとり専用のOSです。 元のディスク($LOWER)を、いっとき書きこみ可にして更新します。"
  sudo mount -o remount,rw "$LOWER" || { echo "書きこみ可にできませんでした(readonly_off.sh を試してください)"; exit 1; }
  git -C "$R" pull; rc=$?
  sync; sudo mount -o remount,ro "$LOWER"
else
  git -C "$REPO" pull; rc=$?
fi
[ $rc -eq 0 ] || { echo "git pull が うまくいきませんでした。 上のメッセージを見てください(再起動はしません)。"; exit $rc; }
echo "更新できました。 5秒後に再起動します(やめるときは Ctrl+C)。"
sleep 5; sudo reboot
