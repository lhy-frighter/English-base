Add-Type -AssemblyName System.Speech
$out = Join-Path $env:TEMP "p5-story.wav"
$fmt = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(16000,
  [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen,
  [System.Speech.AudioFormat.AudioChannel]::Mono)
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.SetOutputToWaveFile($out, $fmt)
$text = "Tell me a short original story about a penguin named Balthazar who runs a jazz bookstore in Kyoto. Make it at least three hundred words with specific details."
$synth.Speak($text)
$synth.Dispose()
(Get-Item $out).Length
