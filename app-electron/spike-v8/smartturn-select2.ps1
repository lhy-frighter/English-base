# S13-0a step A3: 从本地 rows 文件选样本（无网络）
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$rows = @()
foreach ($off in 0,100,200,300,400,500) {
  $j = Get-Content (Join-Path $root ("rows-$off.json")) -Raw | ConvertFrom-Json
  $rows += $j.rows
}
Write-Output ("rows=" + $rows.Count)
$targets = @{ "eng|1" = 13; "eng|0" = 13; "zho|1" = 12; "zho|0" = 12 }
$counts = @{}; $picked = @()
foreach ($r in $rows) {
  $key = ("{0}|{1}" -f $r.row.language, [int]$r.row.endpoint_bool)
  if ($targets.ContainsKey($key) -and (-not $counts.ContainsKey($key) -or $counts[$key] -lt $targets[$key])) {
    $picked += $r
    if ($counts.ContainsKey($key)) { $counts[$key]++ } else { $counts[$key] = 1 }
  }
}
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
$picked | ConvertTo-Json -Depth 6 | Out-File -Encoding utf8 (Join-Path $root "smartturn-picked.json")
Write-Output ("picked=" + $picked.Count)
$counts.GetEnumerator() | ForEach-Object { Write-Output ($_.Key + "=" + $_.Value) }
