#!/bin/sh
# クレジット画面の絵(img/credits.webp)を作りなおす。クレジットの文章(nui.js の CREDITS)を変えたときに実行する。 使い方: sh tools/make_credits_img.sh  (PCで)
cd "$(dirname "$0")/.." || exit 1
S=$(mktemp -d); cat > "$S/c.js" <<'EOT'
globalThis.__creditsLive = true;
let t = 1500; const K = (k, d) => { setTimeout(() => window.__key(k), t); t += d || 350; };
K('ok', 1500); K('down'); K('down'); K('down'); K('ok', 800); for (let i = 0; i < 9; i++) K('down', 250); K('ok', 1200);
setTimeout(() => gfx.snap(__shotDir + '/credits.bmp'), t); t += 300; setTimeout(() => window.__key('right'), t);
EOT
mkdir -p "$S/shots" "$S/d"
MJ_WINDOWED=832x468 MJ_DATA="$S/d" MJ_SCRIPT="$S/c.js" SDL_VIDEODRIVER=dummy SDL_AUDIODRIVER=dummy timeout 20 ./native/app/mj . --shots "$S/shots" >/dev/null 2>&1
python3 -c "from PIL import Image; Image.open('$S/shots/credits.bmp').convert('RGB').save('img/credits.webp','WEBP',lossless=True,quality=100,method=6)" && echo "できました: img/credits.webp"
