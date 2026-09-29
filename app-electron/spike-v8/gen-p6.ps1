Add-Type -AssemblyName System.Speech
$out = Join-Path $env:TEMP "p6-codeword.wav"
$fmt = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(16000,
  [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen,
  [System.Speech.AudioFormat.AudioChannel]::Mono)
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.SetOutputToWaveFile($out, $fmt)
$text = "My secret code word is blueberry, and my lucky number is forty two."
$synth.Speak($text)
$synth.Dispose()
(Get-Item $out).Length
