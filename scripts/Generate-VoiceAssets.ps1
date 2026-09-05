param(
  [string]$OutputDirectory = (Join-Path $PSScriptRoot '..\src\assets\voice')
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null

$rankNames = [ordered]@{
  '3' = '三'; '4' = '四'; '5' = '五'; '6' = '六'; '7' = '七';
  '8' = '八'; '9' = '九'; '10' = '十'; '11' = '勾'; '12' = '圈';
  '13' = '凯'; '14' = '尖'; '15' = '二'; '16' = '小王'; '17' = '大王'
}

$announcements = [ordered]@{}
foreach ($entry in $rankNames.GetEnumerator()) {
  $announcements["single-$($entry.Key)"] = $entry.Value
  if ([int]$entry.Key -le 15) {
    $announcements["pair-$($entry.Key)"] = "对$($entry.Value)"
    $announcements["triple-$($entry.Key)"] = "三个$($entry.Value)"
  }
}
$announcements['triple-single'] = '三带一'
$announcements['triple-pair'] = '三带二'
$announcements['straight'] = '顺子'
$announcements['pair-straight'] = '连对'
$announcements['airplane'] = '飞机'
$announcements['airplane-wing'] = '飞机带翅膀'
$announcements['four-two'] = '四带二'
$announcements['four-two-pair'] = '四带两对'
$announcements['bomb'] = '炸弹'
$announcements['rocket'] = '王炸'

$format = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(
  16000,
  [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen,
  [System.Speech.AudioFormat.AudioChannel]::Mono
)
$speaker = New-Object System.Speech.Synthesis.SpeechSynthesizer
$speaker.Volume = 94
$speaker.Rate = 1

function Write-VoiceClip {
  param([string]$Voice, [string]$Name, [string]$Text, [int]$Rate = 1)
  $speaker.SelectVoice($Voice)
  $speaker.Rate = $Rate
  $path = Join-Path $OutputDirectory "$Name.wav"
  $speaker.SetOutputToWaveFile($path, $format)
  $speaker.Speak($Text)
  $speaker.SetOutputToNull()
}

foreach ($entry in $announcements.GetEnumerator()) {
  Write-VoiceClip -Voice 'Microsoft Huihui Desktop' -Name $entry.Key -Text $entry.Value
}
Write-VoiceClip -Voice 'Microsoft Huihui Desktop' -Name 'river-one' -Text '我还剩一张牌咯' -Rate 0
Write-VoiceClip -Voice 'Microsoft Huihui Desktop' -Name 'river-two' -Text '我还剩两张牌咯' -Rate 0
Write-VoiceClip -Voice 'Microsoft Kangkang' -Name 'forest-one' -Text '我还剩一张牌咯' -Rate 0
Write-VoiceClip -Voice 'Microsoft Kangkang' -Name 'forest-two' -Text '我还剩两张牌咯' -Rate 0

$speaker.Dispose()
Write-Host "Generated $($announcements.Count + 4) offline voice clips in $OutputDirectory"
