# S13-0a step A2: 拉取一页元数据（参数 -Offset），累积写入 smartturn-rows.json
param([int]$Offset = 0)
$ErrorActionPreference = "Stop"
$root = "D:\vibe coding\英语学习\app-electron\spike-v8"
$u = "https://datasets-server.huggingface.co/rows?dataset=pipecat-ai%2Fsmart-turn-data-v3.2-test&config=default&split=train&length=100&offset=$Offset"
$r = Invoke-RestMethod -Uri $u -TimeoutSec 45
$rowsFile = Join-Path $root "smartturn-rows.json"
$all = @()
if (Test-Path $rowsFile) { $all = Get-Content $rowsFile -Raw | ConvertFrom-Json }
$all += $r.rows
$all | ConvertTo-Json -Depth 6 | Out-File -Encoding utf8 $rowsFile
Write-Output ("offset=$Offset total=" + $all.Count)
