#!/bin/sh
# Builds the standalone index.html from game.html (the artifact page body).
cd "$(dirname "$0")"
{ printf '<!doctype html>\n<html lang="ja">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
  sed -n '1,/<\/style>/p' game.html
  printf '</head>\n<body>\n'
  sed '1,/<\/style>/d' game.html
  printf '</body>\n</html>\n'; } > index.html
