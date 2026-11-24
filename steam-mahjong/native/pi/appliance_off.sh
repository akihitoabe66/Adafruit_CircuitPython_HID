#!/bin/sh
# appliance_on.sh で変えた設定を、元に戻す(起動の文字・自動起動・早い絵)。 読みとり専用も使っていたら、先に readonly_off.sh。
BOOT=/boot/firmware; [ -f "$BOOT/cmdline.txt" ] || BOOT=/boot
[ -f "$BOOT/cmdline.txt.mjbak" ] && sudo cp "$BOOT/cmdline.txt.mjbak" "$BOOT/cmdline.txt"
[ -f "$BOOT/config.txt.mjbak" ]  && sudo cp "$BOOT/config.txt.mjbak" "$BOOT/config.txt"
[ -f /etc/fstab.mjbak ] && sudo cp /etc/fstab.mjbak /etc/fstab
sudo systemctl disable mj-splash.service 2>/dev/null; sudo rm -f /etc/systemd/system/mj-splash.service
sed -i '/# mahjong-autostart/,/# \/mahjong-autostart/d' "$HOME/.bash_profile"
echo "元に戻しました。 sudo reboot で再起動してください。"
