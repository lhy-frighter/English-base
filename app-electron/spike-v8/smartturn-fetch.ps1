# S13-0a step1 (PowerShell): 选样本 + 下载 FLAC 到本地
$ErrorActionPreference = "Stop"
$root = "D:\vibe coding\英语学习\app-electron\spike-v8"
$rawDir = Join-Path $root "smartturn-raw"
New-Item -ItemType Directory -Force $rawDir | Out-Null

$rows = @()
foreach ($off in 0,100,200,300,400,500) {
  $u = "https://datasets-server.huggingface.co/rows?dataset=pipecat-ai%2Fsmart-turn-data-v3.2-test&config=default&split=train&length=100&offset=$off"
  $r = Invoke-RestMethod -Uri $u -TimeoutSec 90
  $rows += $r.rows
  Write-Output ("meta offset $off ok, total " + $rows.Count)
}

$targets = @{ "eng|1" = 13; "eng|0" = 13; "zho|1" = 12; "zho|0" = 12 }
$counts = @{}
$picked = @()
foreach ($r in $rows) {
  $key = ("{0}|{1}" -f $r.row.language, [int]$r.row.endpoint_bool)
  if ($targets.ContainsKey($key) -and (-not $counts.ContainsKey($key) -or $counts[$key] -lt $targets[$key])) {
    $picked += $r
    if ($counts.ContainsKey($key)) { $counts[$key]++ } else { $counts[$key] = 1 }
  }
}
# 中文不足用英文补
foreach ($lab in 0,1) {
  $zkey = "zho|$lab"; $ekey = "eng|$lab"
  $have = if ($counts.ContainsKey($zkey)) { $counts[$zkey] } else { 0 }
  $need = $targets[$zkey] - $have
  while ($need -gt 0) {
    $cand = $rows | Where-Object {
      ("{0}|{1}" -f $_.row.language, [int]$_.row.endpoint_bool) -eq $ekey -and ($picked -notcontains $_)
    } | Select-Object -First 1
    if (-not $cand) { break }
    $picked += $cand; $counts[$ekey]++; $need--
  }
}
Write-Output ("picked " + $picked.Count)
$counts.GetEnumerator() | ForEach-Object { Write-Output ($_.Key + "=" + $_.Value) }

$meta = @()
for ($i=0; $i -lt $picked.Count; $i++) {
  $d = $picked[$i].row
  $rawName = ("clip-{0:00}-{1}-{2}.flac" -f $i, $d.language, [int]$d.endpoint_bool)
  Invoke-WebRequest -Uri $d.audio.src -OutFile (Join-Path $rawDir $rawName) -TimeoutSec 90
  $meta += [pscustomobject]@{
    raw = $rawName; id = $d.id; language = $d.language
    endpoint = [bool]$d.endpoint_bool; spoken_text = $d.spoken_text
    midfiller = $d.midfiller; endfiller = $d.endfiller
    synthetic = $d.synthetic; dataset = $d.dataset
  }
  Write-Output ("dl $i " + $d.language + " " + $d.endpoint_bool)
}
$meta | ConvertTo-Json -Depth 4 | Out-File -Encoding utf8 (Join-Path $root "smartturn-raw-meta.json")
Write-Output "downloads done"
