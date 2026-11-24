#!/bin/sh
# クレジット画面の絵(img/credits.webp)を作りなおす。クレジットの文章(nui.js の CREDITS)を変えたときに実行する。 使い方: sh tools/make_credits_img.sh  (PCで)
cd "$(dirname "$0")/.." || exit 1
S=$(mktemp -d); cat > "$S/c.js" <<'EOT'
globalThis.__creditsLive = true;
setTimeout(() => { window.__openSettings(); for (let i = 0; i < 8; i++) window.__key('down'); window.__key('ok'); }, 1500);   // 設定の「開発者」(上から9番め)を開く
setTimeout(() => gfx.snap(__shotDir + '/credits.bmp'), 2200);
setTimeout(() => window.__key('right'), 2500);
EOT
mkdir -p "$S/shots" "$S/d"
MJ_WINDOWED=832x468 MJ_DATA="$S/d" MJ_SCRIPT="$S/c.js" SDL_VIDEODRIVER=dummy SDL_AUDIODRIVER=dummy timeout 20 ./native/app/mj . --shots "$S/shots" >/dev/null 2>&1
python3 -c "from PIL import Image; Image.open('$S/shots/credits.bmp').convert('RGB').save('img/credits.webp','WEBP',lossless=True,quality=100,method=6)" && echo "できました: img/credits.webp"
