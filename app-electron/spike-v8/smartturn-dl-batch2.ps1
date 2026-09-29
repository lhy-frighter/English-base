# S13-0a step B1: curl 分批下载（-Start -Count）
param([int]$Start = 0, [int]$Count = 5)
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$rawDir = Join-Path $root "smartturn-raw"
New-Item -ItemType Directory -Force $rawDir | Out-Null
$lines = Get-Content (Join-Path $root "urls.txt")
for ($i = $Start; $i -lt ($Start + $Count); $i++) {
  $parts = $lines[$i] -split "`t", 2
  $out = Join-Path $rawDir $parts[0]
  curl.exe -sL --fail --max-time 45 -o $out $parts[1]
  if ($LASTEXITCODE -ne 0) { throw ("curl failed at " + $i) }
  Write-Output ("ok $i " + (Get-Item $out).Length)
}
