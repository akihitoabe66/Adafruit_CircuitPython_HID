#!/bin/sh
# OSを読みとり専用にする(第2段階)。 コンセントを急に抜いても、OSは壊れません。
# 書きこみは、メモリの上だけ(再起動で消える)。 セーブ(成績・設定)は、boot の mjdata に書くので、残ります。
# 先に appliance_on.sh を済ませて、動くことを確かめてから実行してください。
# このあと、ゲームの更新(git pull)などは、読みとり専用を一度やめてから:  sh native/pi/readonly_off.sh
set -e
BOOT=/boot/firmware; [ -d "$BOOT" ] || BOOT=/boot
[ -d "$BOOT/mjdata" ] || sudo mkdir -p "$BOOT/mjdata"
D="$(cd "$(dirname "$0")/../.." && pwd)"
[ -f "$BOOT/mjdata/save.json" ] || { [ -f "$D/save.json" ] && sudo cp "$D/save.json" "$BOOT/mjdata/save.json"; } || true
sudo raspi-config nonint enable_overlayfs
echo "設定しました。 sudo reboot で再起動すると、読みとり専用になります。"
echo "(boot の領域は、セーブのために、書きこみ可のままです。 終了のときの「抜いてください」の画面で、書きこみ禁止になります)"
