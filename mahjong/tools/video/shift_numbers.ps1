# 動画のファイル名の番号を、指定の番号以降 1つずつ後ろにずらす(新しい動画を入れるため)。
# 使い方: 動画のフォルダで PowerShell を開いて  powershell -ExecutionPolicy Bypass -File パス\shift_numbers.ps1 2   (2番以降をずらす。 省略すると4番以降)
param([int]$From = 4)
Get-ChildItem -File | Where-Object { $_.Name -match '^(\d+)_' -and [int]$Matches[1] -ge $From } | Sort-Object { [int]($_.Name -replace '^(\d+)_.*','$1') } -Descending | ForEach-Object {
  $n = [int]($_.Name -replace '^(\d+)_.*','$1'); $new = ('{0:D2}' -f ($n + 1)) + $_.Name.Substring($_.Name.IndexOf('_'))
  Rename-Item -LiteralPath $_.FullName -NewName $new; Write-Host ($_.Name + ' -> ' + $new)
}
