#!/bin/sh
# 「コンセントを入れるだけで遊べる」設定にする(第1段階: 起動中の文字を隠す・ゲームを自動起動・終了の画面)。
# 読みとり専用(コンセントを急に抜いても壊れない)にするのは、第2段階:  sh native/pi/readonly_on.sh
# 元に戻す:  sh native/pi/appliance_off.sh
# 試験用に、書きかえる場所を変えられる: MJ_BOOT=/tmp/xx(cmdline.txt と config.txt の場所) MJ_FSTAB=/tmp/fstab
set -e
D="$(cd "$(dirname "$0")/../.." && pwd)"
BOOT="${MJ_BOOT:-/boot/firmware}"; [ -f "$BOOT/cmdline.txt" ] || BOOT=/boot
FSTAB="${MJ_FSTAB:-/etc/fstab}"; SUDO=""; [ -n "$MJ_BOOT" ] || SUDO="sudo"
[ -f "$BOOT/cmdline.txt" ] || { echo "cmdline.txt が見つかりません($BOOT)"; exit 1; }

echo "1) 画面にコマンドを出さない設定(起動の文字を隠す)"
[ -f "$BOOT/cmdline.txt.mjbak" ] || $SUDO cp "$BOOT/cmdline.txt" "$BOOT/cmdline.txt.mjbak"
[ -f "$BOOT/config.txt.mjbak" ]  || $SUDO cp "$BOOT/config.txt" "$BOOT/config.txt.mjbak"
L="$(cat "$BOOT/cmdline.txt" | tr -d '\n')"
L="$(printf '%s' "$L" | sed 's/ *console=tty1//g')"
for w in console=tty3 quiet loglevel=0 logo.nologo vt.global_cursor_default=0 systemd.show_status=0 plymouth.enable=0; do
  case " $L " in *" $w "*) ;; *) L="$L $w";; esac
done
printf '%s\n' "$L" | $SUDO tee "$BOOT/cmdline.txt" >/dev/null
grep -q '^disable_splash=1' "$BOOT/config.txt" || printf '\ndisable_splash=1\nboot_delay=0\n' | $SUDO tee -a "$BOOT/config.txt" >/dev/null

echo "2) セーブの領域(boot)を、書いたらすぐ ディスクへ送る設定(flush)にする"
if [ -f "$FSTAB" ] && ! grep -E '^[^#].*[[:space:]]/boot(/firmware)?[[:space:]]' "$FSTAB" | grep -q flush; then
  [ -f "$FSTAB.mjbak" ] || $SUDO cp "$FSTAB" "$FSTAB.mjbak"
  $SUDO sed -i -E '/^[^#].*[[:space:]]\/boot(\/firmware)?[[:space:]]/ s/(vfat[[:space:]]+)([^[:space:]]+)/\1\2,flush/' "$FSTAB"
fi

if [ -z "$MJ_BOOT" ]; then
  echo "3) 必要なもの(fbi: 絵を全画面に出す)と、ログインの文字を消す"
  command -v fbi >/dev/null 2>&1 || sudo apt-get install -y fbi
  touch "$HOME/.hushlogin"
  sudo raspi-config nonint do_boot_behaviour B2          # 起動時はコンソールで自動ログイン(デスクトップなし)
  sudo usermod -aG video,render,input "$USER" || true
  echo "4) 起動の最初に「ゲーム起動中」の絵を出す(OSが立ち上がってすぐ)"
  sudo tee /etc/systemd/system/mj-splash.service >/dev/null <<EOT
[Unit]
Description=Mahjong boot splash
DefaultDependencies=no
After=local-fs.target
Before=getty@tty1.service

[Service]
Type=simple
ExecStart=/usr/bin/fbi -T 1 -d /dev/fb0 -noverbose -a $D/native/pi/splash/booting.png
StandardInput=null
StandardOutput=null
StandardError=null

[Install]
WantedBy=sysinit.target
EOT
  sudo systemctl daemon-reload; sudo systemctl enable mj-splash.service >/dev/null 2>&1 || true
  echo "5) ログインしたら、ゲームを自動で起動する"
  P="$HOME/.bash_profile"; touch "$P"
  sed -i '/# mahjong-autostart/,/# \/mahjong-autostart/d' "$P"
  cat >> "$P" <<EOT

# mahjong-autostart
if [ "\$(tty)" = "/dev/tty1" ] && [ -z "\$MJ_NOAUTO" ]; then
  exec "$D/native/pi/kiosk.sh"
fi
# /mahjong-autostart
EOT
fi
echo
echo "できました。 sudo reboot で再起動して、次を確かめてください:"
echo "  ・電源を入れてから、コマンドの文字が出ずに「ゲーム起動中」→ゲーム、になるか"
echo "  ・ゲームを終了すると「終了の準備中です」→「コンセントを抜いてください」になるか"
echo "(開発用に普通の画面へ戻りたいとき: touch /boot/firmware/mjdata/DEV を作る。 なおすとき: sh native/pi/appliance_off.sh)"
