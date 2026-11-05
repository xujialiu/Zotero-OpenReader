/**
 * The Windows speech daemon: one long-lived `powershell.exe` that enumerates
 * the operating system's voices and synthesizes WAV with word marks, over
 * the framed JSON protocol in protocol.ts.
 *
 * Two APIs, because neither alone is the list Firefox shows (issue #12, and
 * re-measured 2026-08-29 on Windows 11): `System.Speech` reads
 * `HKLM\SOFTWARE\Microsoft\Speech\Voices` — the three "… Desktop" voices —
 * and WinRT `Windows.Media.SpeechSynthesis` reads `Speech_OneCore` — the
 * other six. Together they are Zotero's nine, one for one, and `Description`
 * is on both sides exactly the name Gecko publishes as
 * `urn:moz-tts:sapi:<description>?<lang>` (voices.ts maps on it).
 *
 * Why the script is a string and not a file in the xpi: it is handed over as
 * `-EncodedCommand`, which needs no file on disk and is not subject to the
 * execution policy. Two consequences it must live with:
 *
 * - **ASCII only.** Not for the command line, which is UTF-16 — for the
 *   probes: PowerShell 5.1 reads a BOM-less .ps1 in the console codepage, so
 *   a copy of this script saved to disk would break on a non-ASCII
 *   character. Nothing here needs one.
 * - **Size.** `CreateProcess` takes at most 32767 characters of command line
 *   and the base64 of UTF-16 is ~2.67× the source; a test pins the margin.
 *
 * Two environment facts this shape exists for, both measured:
 *
 * - **There is no console.** `Subprocess` starts the process with no window
 *   (`MainWindowHandle` 0, `[Console]::WindowWidth` throws), so
 *   `[Console]::OutputEncoding = …` — the obvious way to fix the codepage —
 *   throws on the first line and the daemon never starts. The standard
 *   streams themselves open fine, so all I/O here is raw bytes on them and
 *   the encoding is ours to choose (UTF-8, framed, never the console's).
 * - **`SpeakProgress.AudioPosition` skews when System.Speech resamples.**
 *   It divides the output byte count by the engine's input bytes/second:
 *   forcing a 24 kHz voice to 16 kHz compresses the word clock to 2/3,
 *   while forcing a 16 kHz voice to 22050 stretches it by 37.8%. The old
 *   blanket 16 kHz workaround fixed the Desktop voices but broke Andrew
 *   HD (#242). Negotiate each selected engine's PCM format through public
 *   SAPI interfaces and request that same format, cached per voice. If it
 *   cannot be verified, deliver audio without untrusted word marks.
 */

/**
 * The daemon, as PowerShell 5.1 source. Kept ASCII; `assertAsciiScript`
 * (protocol.ts) is what enforces it at build time.
 *
 * Protocol: uint32 little-endian byte length, then that many bytes of UTF-8
 * JSON, both directions — Firefox's own native-messaging framing, which
 * `Subprocess` reads with `read(4)` / `read(length)` and so needs no line
 * splitting and no escaping (protocol.ts).
 */
export const WINDOWS_DAEMON_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$pin = [Console]::OpenStandardInput()
$pout = [Console]::OpenStandardOutput()

function ReadExact($n) {
  $buf = New-Object byte[] $n
  $got = 0
  while ($got -lt $n) {
    $r = $pin.Read($buf, $got, $n - $got)
    if ($r -le 0) { return $null }
    $got += $r
  }
  , $buf
}
function Send($json) {
  $b = [Text.Encoding]::UTF8.GetBytes($json)
  $pout.Write([BitConverter]::GetBytes([uint32]$b.Length), 0, 4)
  $pout.Write($b, 0, $b.Length)
  $pout.Flush()
}
function JStr($s) {
  $sb = New-Object Text.StringBuilder
  [void]$sb.Append('"')
  foreach ($ch in "$s".ToCharArray()) {
    $n = [int]$ch
    if ($ch -eq '"') { [void]$sb.Append('\"') }
    elseif ($ch -eq '\') { [void]$sb.Append('\\') }
    elseif ($n -lt 32) { [void]$sb.AppendFormat('\u{0:x4}', $n) }
    else { [void]$sb.Append($ch) }
  }
  [void]$sb.Append('"')
  $sb.ToString()
}
function Fail($id, $msg) { Send ('{"id":' + $id + ',"ok":false,"error":' + (JStr $msg) + '}') }

$sapi = $null
$sapiFmt = $null
$sapiFormats = @{}
$sapiTimingNote = $null
$sapiMarks = New-Object Collections.ArrayList
function SapiSynth {
  if ($null -eq $script:sapi) {
    Add-Type -AssemblyName System.Speech
    $script:sapi = New-Object System.Speech.Synthesis.SpeechSynthesizer
    # Fallback audio only; verified voices use their own negotiated format.
    $script:sapiFmt = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(16000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
    $script:sapi.add_SpeakProgress({
        param($sender, $e)
        [void]$script:sapiMarks.Add(([int]$e.AudioPosition.TotalMilliseconds).ToString() + ',' + $e.CharacterPosition + ',' + $e.CharacterCount)
      })
  }
  $script:sapi
}

# Read the engine's negotiated format without speaking or editing a token.
# SupportedAudioFormats is empty even for the installed Microsoft voices.
function SapiFormat($token) {
  if ($script:sapiFormats.ContainsKey($token)) { return $script:sapiFormats[$token] }
  $format = $null
  $catalog = $null
  $voices = $null
  try {
    if (-not ('SapiWave' -as [type])) {
      Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public static class SapiWave {
  [StructLayout(LayoutKind.Sequential, Pack = 2)]
  struct Wave {
    public short tag, channels;
    public int rate, bytesPerSecond;
    public short align, bits, extra;
  }
  [ComImport, Guid("14056589-E16C-11D2-BB90-00C04F8EE6C0"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface Token { }
  [ComImport, Guid("5B559F40-E952-11D2-BB91-00C04F8EE6C0"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface WithToken { void SetObjectToken(Token token); }
  [ComImport, Guid("A74D7C8E-4CC5-4F2F-A6EB-804DEE18500E"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface Engine {
    void Speak(); // Unused slot before GetOutputFormat.
    void GetOutputFormat(ref Guid wanted, IntPtr format, out Guid actual, out IntPtr wave);
  }
  public static int[] Get(object token, string clsid) {
    object engine = Activator.CreateInstance(Type.GetTypeFromCLSID(new Guid(clsid)));
    IntPtr result = IntPtr.Zero;
    try {
      ((WithToken)engine).SetObjectToken((Token)token);
      Guid wanted = new Guid("C31ADBAE-527F-4FF5-A230-F62BB61FF70C"), actual;
      ((Engine)engine).GetOutputFormat(ref wanted, IntPtr.Zero, out actual, out result);
      if (actual != wanted || result == IntPtr.Zero) throw new NotSupportedException("Not PCM");
      var wave = (Wave)Marshal.PtrToStructure(result, typeof(Wave));
      if (wave.tag != 1 || wave.extra != 0 || wave.rate < 8000 || wave.rate > 192000 ||
          (wave.bits != 8 && wave.bits != 16) || (wave.channels != 1 && wave.channels != 2) ||
          wave.align != wave.channels * wave.bits / 8 || wave.bytesPerSecond != wave.rate * wave.align)
        throw new NotSupportedException("Unsupported PCM");
      return new int[] { wave.rate, wave.bits, wave.channels };
    } finally {
      Marshal.FreeCoTaskMem(result);
      Marshal.ReleaseComObject(engine);
    }
  }
}
'@
    }
    $catalog = New-Object -ComObject SAPI.SpVoice
    $voices = $catalog.GetVoices()
    for ($i = 0; $i -lt $voices.Count; $i++) {
      $v = $voices.Item($i)
      try {
        if (($v.Id -replace '^.*\\', '') -ne $token) { continue }
        $f = [SapiWave]::Get($v, $v.DataKey.GetStringValue('CLSID'))
        $format = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo($f[0], [System.Speech.AudioFormat.AudioBitsPerSample]$f[1], [System.Speech.AudioFormat.AudioChannel]$f[2])
        break
      } finally { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($v) }
    }
  } catch { $format = $null }
  finally {
    foreach ($v in @($voices, $catalog)) {
      if ($null -ne $v) { try { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($v) } catch {} }
    }
  }
  # Cache failures too: keep audio, but never guess a word clock.
  $script:sapiFormats[$token] = $format
  $format
}

$winrt = $null
$asTask = $null
function WinrtSynth {
  if ($null -eq $script:winrt) {
    Add-Type -AssemblyName System.Runtime.WindowsRuntime
    [Windows.Media.SpeechSynthesis.SpeechSynthesizer, Windows.Media, ContentType = WindowsRuntime] | Out-Null
    [Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType = WindowsRuntime] | Out-Null
    $script:asTask = ([WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
        $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation` + '`' + String.raw`1'
      })[0]
    $script:winrt = New-Object Windows.Media.SpeechSynthesis.SpeechSynthesizer
    $script:winrt.Options.IncludeWordBoundaryMetadata = $true
  }
  $script:winrt
}
function Await($op, $type) {
  $t = $script:asTask.MakeGenericMethod($type).Invoke($null, @($op))
  $t.Wait(-1) | Out-Null
  $t.Result
}

function ListVoices {
  $rows = New-Object Collections.ArrayList
  $notes = New-Object Collections.ArrayList
  try {
    foreach ($v in (SapiSynth).GetInstalledVoices()) {
      if (-not $v.Enabled) { continue }
      $i = $v.VoiceInfo
      [void]$rows.Add('{"id":' + (JStr ('sapi5/' + $i.Id)) + ',"name":' + (JStr $i.Name) + ',"desc":' + (JStr $i.Description) + ',"lang":' + (JStr $i.Culture.Name) + '}')
    }
  }
  catch { [void]$notes.Add((JStr ('System.Speech: ' + $_.Exception.Message))) }
  try {
    [void](WinrtSynth)
    foreach ($v in [Windows.Media.SpeechSynthesis.SpeechSynthesizer]::AllVoices) {
      [void]$rows.Add('{"id":' + (JStr ('onecore/' + ($v.Id -replace '^.*\\', ''))) + ',"name":' + (JStr $v.DisplayName) + ',"desc":' + (JStr $v.Description) + ',"lang":' + (JStr $v.Language) + '}')
    }
  }
  catch { [void]$notes.Add((JStr ('Windows.Media: ' + $_.Exception.Message))) }
  '{"voices":[' + ($rows -join ',') + '],"notes":[' + ($notes -join ',') + ']}'
}

# Milliseconds of audio in the file, from its own data chunk. SAPI writes an
# 18-byte fmt chunk, so the data does not start at the textbook offset 44.
function WavMs($path) {
  $b = [IO.File]::ReadAllBytes($path)
  $p = 12
  $rate = 0
  $align = 0
  while ($p + 8 -le $b.Length) {
    $id = [Text.Encoding]::ASCII.GetString($b, $p, 4)
    $sz = [BitConverter]::ToUInt32($b, $p + 4)
    if ($id -eq 'fmt ') { $rate = [BitConverter]::ToUInt32($b, $p + 12); $align = [BitConverter]::ToUInt16($b, $p + 20) }
    if ($id -eq 'data') { if ($rate -eq 0 -or $align -eq 0) { return 0 }; return [int]($sz * 1000 / ($rate * $align)) }
    $p += 8 + $sz + ($sz % 2)
  }
  0
}

function SpeakSapi($token, $text, $file) {
  $s = SapiSynth
  $name = $null
  foreach ($v in $s.GetInstalledVoices()) { if ($v.VoiceInfo.Id -eq $token) { $name = $v.VoiceInfo.Name } }
  if ($null -eq $name) { throw "no such voice: $token" }
  $script:sapiMarks.Clear()
  $s.SelectVoice($name)
  $format = SapiFormat $s.Voice.Id
  $script:sapiTimingNote = $null
  if ($null -eq $format) {
    $script:sapiTimingNote = 'the SAPI voice audio format could not be verified; using sentence highlighting'
    $format = $script:sapiFmt
  }
  $s.SetOutputToWaveFile($file, $format)
  try { $s.Speak($text) } finally { $s.SetOutputToNull() }
  if ($null -ne $script:sapiTimingNote) { $script:sapiMarks.Clear() }
  $script:sapiMarks
}

function SpeakWinrt($token, $text, $file) {
  $s = WinrtSynth
  $target = $null
  foreach ($v in [Windows.Media.SpeechSynthesis.SpeechSynthesizer]::AllVoices) { if (($v.Id -replace '^.*\\', '') -eq $token) { $target = $v } }
  if ($null -eq $target) { throw "no such voice: $token" }
  $s.Voice = $target
  $stream = Await $s.SynthesizeTextToStreamAsync($text) ([Windows.Media.SpeechSynthesis.SpeechSynthesisStream])
  $reader = New-Object Windows.Storage.Streams.DataReader ($stream.GetInputStreamAt(0))
  try {
    [void](Await $reader.LoadAsync([uint32]$stream.Size) ([uint32]))
    $buf = New-Object byte[] ([int]$stream.Size)
    $reader.ReadBytes($buf)
    [IO.File]::WriteAllBytes($file, $buf)
  }
  finally { $reader.Dispose() }
  # The word track, not Markers: Markers carries SSML <mark/> and stays empty
  $marks = New-Object Collections.ArrayList
  foreach ($track in $stream.TimedMetadataTracks) {
    if ($track.Id -ne 'SpeechWord') { continue }
    foreach ($cue in $track.Cues) {
      $c = $cue.StartPositionInInput
      $e = $cue.EndPositionInInput
      if ($null -eq $c -or $null -eq $e) { continue }
      # EndPositionInInput is inclusive; Cue.Duration is always zero, so the
      # end of a word is the start of the next one (protocol.ts)
      [void]$marks.Add(([int]$cue.StartTime.TotalMilliseconds).ToString() + ',' + $c + ',' + ($e - $c + 1))
    }
  }
  $marks
}

Send '{"id":0,"ok":true,"ready":true}'
while ($true) {
  $head = ReadExact 4
  if ($null -eq $head) { break }
  $n = [BitConverter]::ToUInt32($head, 0)
  if ($n -eq 0 -or $n -gt 33554432) { break }
  $body = ReadExact $n
  if ($null -eq $body) { break }
  $id = 0
  try {
    $req = [Text.Encoding]::UTF8.GetString($body) | ConvertFrom-Json
    $id = [int]$req.id
    switch ($req.op) {
      'ping' { Send ('{"id":' + $id + ',"ok":true}') }
      'voices' {
        $v = ListVoices
        Send ('{"id":' + $id + ',"ok":true,' + $v.Substring(1))
      }
      'speak' {
        $slash = $req.voice.IndexOf('/')
        if ($slash -lt 1) { throw ('malformed voice id: ' + $req.voice) }
        $api = $req.voice.Substring(0, $slash)
        $token = $req.voice.Substring($slash + 1)
        if ($api -eq 'sapi5') { $marks = SpeakSapi $token $req.text $req.file }
        elseif ($api -eq 'onecore') { $marks = SpeakWinrt $token $req.text $req.file }
        else { throw ('unknown speech API: ' + $api) }
        $words = ($marks | ForEach-Object { $p = $_.Split(','); '{"t":' + $p[0] + ',"c":' + $p[1] + ',"n":' + $p[2] + '}' }) -join ','
        $note = ''
        if ($api -eq 'sapi5' -and $null -ne $script:sapiTimingNote) { $note = ',"timingNote":' + (JStr $script:sapiTimingNote) }
        Send ('{"id":' + $id + ',"ok":true,"ms":' + (WavMs $req.file) + ',"words":[' + $words + ']' + $note + '}')
      }
      default { Fail $id ('unknown op: ' + $req.op) }
    }
  }
  catch { Fail $id $_.Exception.Message }
}
`;

/** Where a Windows install always keeps the 5.1 host. `Subprocess.pathSearch` cannot find it: Zotero's process environment has no PATH (measured 2026-08-29), so the path is spelled out. */
export const WINDOWS_POWERSHELL = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';

/** `-EncodedCommand` wants base64 of UTF-16LE. Kept here beside the script it encodes; `spawn` in src/index.ts is the only caller. */
export function encodeCommand(script: string, toBase64: (binary: string) => string): string {
  let binary = '';
  for (let i = 0; i < script.length; i++) {
    const code = script.charCodeAt(i);
    binary += String.fromCharCode(code & 0xff, code >> 8);
  }
  return toBase64(binary);
}

/** The whole command line `CreateProcess` will see; a test keeps it inside the 32767-character limit. */
export function windowsCommandArguments(encoded: string): string[] {
  return ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded];
}
