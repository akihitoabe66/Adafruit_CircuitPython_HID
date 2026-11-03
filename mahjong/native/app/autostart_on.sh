#!/bin/sh
# 電源を入れたら、デスクトップなしで麻雀が起動するようにする。
# 終了は Ctrl+Q(ターミナルに戻る)。 元に戻すには: sh autostart_off.sh
set -e
D="$(cd "$(dirname "$0")/../.." && pwd)"
chmod +x "$D/native/app/start.sh"
# 1) 起動時はコンソールで自動ログイン(デスクトップなし)
sudo raspi-config nonint do_boot_behaviour B2
# 2) 画面とコントローラーを使う権限
sudo usermod -aG video,render,input "$USER" || true
# 3) ログイン直後(画面1だけ)に麻雀を起動
P="$HOME/.bash_profile"
touch "$P"
grep -q "# mahjong-autostart" "$P" || cat >> "$P" <<EOT

# mahjong-autostart
if [ "\$(tty)" = "/dev/tty1" ] && [ -z "\$MJ_NOAUTO" ]; then
  "$D/native/app/start.sh"
fi
# /mahjong-autostart
EOT
[ -f "$HOME/.profile" ] && [ ! -f "$HOME/.bash_profile.bak" ] && true
echo "設定しました。 sudo reboot で再起動してください。"
echo "(自動起動したくない時: 起動中に Ctrl+Q で終了 → ターミナルに戻ります)"
