@echo off
rem 動画を、ラズパイ(Zero W)で、らくに再生できる形に作り直す。
rem 使い方: 動画(.mp4)を入れたフォルダに、このファイルを置いて、ダブルクリック。 「light」フォルダに、できあがりが入る。
rem 必要なもの: FFmpeg (https://ffmpeg.org/ から。 Windows なら「winget install ffmpeg」でも入る)
chcp 65001 >nul
if not exist light mkdir light
for %%f in (*.mp4) do (
  echo %%f
  ffmpeg -v error -stats -y -i "%%f" -r 15 -vf scale=640:360 -c:v libx264 -profile:v baseline -level 3.0 -tune fastdecode -crf 26 -preset slow -c:a aac -b:a 64k -ar 44100 -ac 2 -movflags +faststart "light\%%~nxf"
)
echo できました。 light フォルダを見てください。
pause
