#!/bin/sh
# 読みとり専用をやめる(ゲームの更新・設定の変更をするとき)。 再起動したあと、普通に書きこめます。 終わったら readonly_on.sh でまた読みとり専用に。
sudo raspi-config nonint disable_overlayfs
echo "やめました。 sudo reboot で再起動してください(再起動後に git pull などができます)。"
