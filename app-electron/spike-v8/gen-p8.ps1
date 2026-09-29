Add-Type -AssemblyName System.Speech
$out = Join-Path $env:TEMP "p8-ask2.wav"
$fmt = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(16000,
  [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen,
  [System.Speech.AudioFormat.AudioChannel]::Mono)
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.SetOutputToWaveFile($out, $fmt)
$text = "What is the meeting password I just told you? Answer with just the word."
$synth.Speak($text)
$synth.Dispose()
(Get-Item $out).Length
