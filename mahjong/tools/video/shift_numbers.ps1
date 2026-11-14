# 動画のファイル名の番号を、4番以降 1つずつ後ろにずらす(新しい4番を入れるため)。 例: 04_xxx.mp4 → 05_xxx.mp4 ... 16_xxx.mp4 → 17_xxx.mp4
# 使い方: 動画のフォルダで PowerShell を開いて  powershell -ExecutionPolicy Bypass -File パス\shift_numbers.ps1
Get-ChildItem -File | Where-Object { $_.Name -match '^(\d+)_' -and [int]$Matches[1] -ge 4 } | Sort-Object { [int]($_.Name -replace '^(\d+)_.*','$1') } -Descending | ForEach-Object {
  $n = [int]($_.Name -replace '^(\d+)_.*','$1'); $new = ('{0:D2}' -f ($n + 1)) + $_.Name.Substring($_.Name.IndexOf('_'))
  Rename-Item -LiteralPath $_.FullName -NewName $new; Write-Host ($_.Name + ' -> ' + $new)
}
