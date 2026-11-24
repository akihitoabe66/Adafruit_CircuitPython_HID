@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
rem ビデオ番号を ずらす(Windows用)。 2番以降の動画(と サムネイルの png)を、1つずつ後ろにずらします。
rem 使い方: このファイルを、動画の入っているフォルダ(例: boot の mjdata\video)に入れて、ダブルクリック。
rem        または、動画のフォルダを、このファイルの上に ドラッグ&ドロップ。
set "DIR=%~dp0"
if not "%~1"=="" set "DIR=%~1\"
cd /d "%DIR%" || (echo フォルダに入れません: %DIR% & pause & exit /b 1)
if exist "_shifted_from2.txt" (
  echo すでに ずらしてあります(_shifted_from2.txt があります)。 2回ずらすと 番号が ずれすぎるので、何もしません。
  pause & exit /b 0
)
echo 次のフォルダの、2番以降の動画を 1つずつ後ろにずらします:
echo   %CD%
echo.
dir /b ??_*.mp4 ??_*.m4v ??_*.mov ??_*.mkv ??_*.webm ??_*.png 2>nul
echo.
echo よければ、何かキーを押してください(やめるときは、このウィンドウを閉じる)。
pause >nul
for /l %%n in (99,-1,2) do (
  set "a=0%%n"
  set "a=!a:~-2!"
  set /a m=%%n+1
  set "b=0!m!"
  set "b=!b:~-2!"
  for %%e in (mp4 m4v mov mkv webm png) do (
    for %%f in (!a!_*.%%e) do (
      if exist "%%f" (
        set "old=%%f"
        set "new=!b!!old:~2!"
        if exist "!new!" (echo スキップ^(すでにある^): !new!) else (ren "%%f" "!new!" & echo %%f -^> !new!)
      )
    )
  )
)
echo ずらし済み> "_shifted_from2.txt"
echo.
echo できました。 新しい 02 の動画は、git で配られるので、ここに入れなくても 出ます。
pause
