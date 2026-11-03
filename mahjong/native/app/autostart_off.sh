#!/bin/sh
# 自動起動をやめる(デスクトップ起動に戻す)
sed -i '/# mahjong-autostart/,/# \/mahjong-autostart/d' "$HOME/.bash_profile"
sudo raspi-config nonint do_boot_behaviour B4
echo "元に戻しました。 sudo reboot で再起動してください。"
