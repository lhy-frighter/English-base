# 生成"破碎英文"测试语音（Windows SAPI，本机离线）：复现用户真实输入的语言形态
# 用法: powershell -NoProfile -ExecutionPolicy Bypass -File tts-clip.ps1
Add-Type -AssemblyName System.Speech
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$outDir = Join-Path $PSScriptRoot "diag-clips"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
$lines = @(
  @{ txt = "Hi! Lets talk about my internship. I work on software for a. Driver the racing car."; file = "broken-internship.wav" },
  @{ txt = "Yesterday I go to the company and finish many report."; file = "broken-yesterday.wav" }
)
foreach ($it in $lines) {
  $path = Join-Path $outDir $it.file
  $s.SetOutputToWaveFile($path)
  $s.Speak($it.txt)
  $s.SetOutputToNull()
  Write-Output ("OK " + $path)
}
$s.Dispose()
