# S13-0a step B: 分批下载 FLAC（参数 -Start -Count）
param([int]$Start = 0, [int]$Count = 10)
$ErrorActionPreference = "Stop"
$root = "D:\vibe coding\英语学习\app-electron\spike-v8"
$rawDir = Join-Path $root "smartturn-raw"
New-Item -ItemType Directory -Force $rawDir | Out-Null
$picked = Get-Content (Join-Path $root "smartturn-picked.json") -Raw | ConvertFrom-Json
$end = [Math]::Min($Start + $Count - 1, $picked.Count - 1)
for ($i = $Start; $i -le $end; $i++) {
  $d = $picked[$i].row
  $name = ("clip-{0:00}-{1}-{2}.flac" -f $i, $d.language, [int]$d.endpoint_bool)
  $out = Join-Path $rawDir $name
  curl.exe -sL --fail --max-time 60 -o $out $d.audio.src
  if ($LASTEXITCODE -ne 0) { throw "curl failed at $i" }
  Write-Output ("ok $i " + (Get-Item $out).Length)
}
