#!/bin/sh
# 動画を、ラズパイ(Zero W)で、らくに再生できる形に作り直す(Mac/Linux用)。
# 使い方: 動画(.mp4)を入れたフォルダで  sh /パス/lighten.sh   → light/ に、できあがりが入る。 FFmpeg が必要。
mkdir -p light
for f in *.mp4; do
  echo "$f"
  ffmpeg -v error -stats -y -i "$f" -r 15 -vf scale=640:360 -c:v libx264 -profile:v baseline -level 3.0 -tune fastdecode -crf 26 -preset slow -c:a aac -b:a 64k -ar 44100 -ac 2 -movflags +faststart "light/$f"
done
echo "できました。 light フォルダを見てください。"
