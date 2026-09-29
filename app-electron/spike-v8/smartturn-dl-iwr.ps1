# S13-0a step B2: IWR 分批下载 FLAC（-Start -Count）
param([int]$Start = 0, [int]$Count = 8)
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$rawDir = Join-Path $root "smartturn-raw"
New-Item -ItemType Directory -Force $rawDir | Out-Null
$lines = Get-Content (Join-Path $root "urls.txt")
for ($i = $Start; $i -lt ($Start + $Count); $i++) {
  $parts = $lines[$i] -split "`t", 2
  $out = Join-Path $rawDir $parts[0]
  Invoke-WebRequest -Uri $parts[1] -OutFile $out -TimeoutSec 60
  Write-Output ("ok $i " + (Get-Item $out).Length)
}
