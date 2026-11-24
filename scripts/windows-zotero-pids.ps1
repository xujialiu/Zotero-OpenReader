# Return only PIDs for the disposable profile and data arguments.
$ErrorActionPreference = 'Stop'
$profilePath = [regex]::Escape((Join-Path $env:OPENREADER_SESSION_ROOT 'profile'))
$dataPath = [regex]::Escape((Join-Path $env:OPENREADER_SESSION_ROOT 'data'))
$profileArgument = '(?:^|\s)-profile\s+(?:"{0}"|{0})(?=\s|$)' -f $profilePath
$dataArgument = '(?:^|\s)-datadir\s+(?:"{0}"|{0})(?=\s|$)' -f $dataPath

Get-CimInstance Win32_Process -Property Name,ProcessId,ExecutablePath,CommandLine |
    Where-Object Name -eq $env:OPENREADER_IMAGE_NAME |
    ForEach-Object {
        if ($env:OPENREADER_EXECUTABLE -and $_.ExecutablePath -and
            $_.ExecutablePath -ne $env:OPENREADER_EXECUTABLE) { return }
        if (!$_.CommandLine) { throw 'Cannot verify a Zotero process command line' }
        if ($_.CommandLine -match $profileArgument -and $_.CommandLine -match $dataArgument) {
            if ($env:OPENREADER_EXECUTABLE -and !$_.ExecutablePath) {
                throw 'Cannot verify the disposable executable'
            }
            $_.ProcessId
        }
    }
