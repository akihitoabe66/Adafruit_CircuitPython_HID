#!/bin/sh
# 商用の別プロジェクトへ引きつぐための「きれいな書き出し」。 履歴(git log)も、画像・音・動画(権利の確認が要るもの)も入れず、コードと道具だけを 新しいフォルダに写す。
# 使い方: sh tools/export_clean.sh /書き出すフォルダ        → できたフォルダを、新しいリポジトリ(別チャンネルの持ち物)として git init して push する
# 入れるもの : js/(ゲームの頭脳・画面) index.html style.css simple.css / native/(Pi版) / android-app/(Capacitor) / tools/(素材づくりの道具。素材そのものは除く) / 設計の文書(DECISIONS・HANDOFF・DESIGN_SENIOR・SIMPLE_PLAN・COMMERCIAL_HANDOVER)
# 入れないもの: audio/ video/ img/(ぜんぶ入れかえる前提。 一覧と、作りなおす手順は COMMERCIAL_HANDOVER.md) / tools の素材元(*_src) / save.json
set -e
D="$(cd "$(dirname "$0")/.." && pwd)"; OUT="$1"; [ -n "$OUT" ] || { echo "使い方: sh tools/export_clean.sh /書き出すフォルダ"; exit 1; }
[ -e "$OUT" ] && [ -n "$(ls -A "$OUT" 2>/dev/null)" ] && { echo "書き出し先が空ではありません: $OUT"; exit 1; }
mkdir -p "$OUT/mahjong"
cd "$D"
tar cf - --exclude='./audio' --exclude='./video' --exclude='./img' --exclude='./save.json' --exclude='*_src' --exclude='__pycache__' --exclude='./native/app/mj' --exclude='./native/app/obj' --exclude='*.webp' --exclude='*.mp3' --exclude='*.mp4' --exclude='*.wav' --exclude='*.ttf' --exclude='*.png' --exclude='*.jpg' --exclude='*.jpeg' --exclude='./tools/mjsim/results' . | (cd "$OUT/mahjong" && tar xf -)
mkdir -p "$OUT/mahjong/audio" "$OUT/mahjong/img" "$OUT/mahjong/video"
for d in audio img video; do printf '素材(自分のチャンネルで 用意したもの)を ここに入れる。 一覧は COMMERCIAL_HANDOVER.md\n' > "$OUT/mahjong/$d/README.txt"; done
echo "できました: $OUT/mahjong"
echo "つぎ: cd $OUT && git init && git add -A && git commit -m 'はじまり' → 新しいリポジトリへ push"
