# S13-0a step B0: 导出下载清单 urls.txt（无网络）
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$picked = Get-Content (Join-Path $root "smartturn-picked.json") -Raw | ConvertFrom-Json
$lines = @()
for ($i = 0; $i -lt $picked.Count; $i++) {
  $d = $picked[$i].row
  $name = ("clip-{0:00}-{1}-{2}.flac" -f $i, $d.language, [int]$d.endpoint_bool)
  $lines += ("{0}`t{1}" -f $name, $d.audio.src)
}
$lines | Out-File -Encoding ascii (Join-Path $root "urls.txt")
Write-Output ("lines=" + $lines.Count)
