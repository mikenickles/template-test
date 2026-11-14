# Makes Arlo start quietly whenever you sign in to Windows.
# Run once:   powershell -ExecutionPolicy Bypass -File scripts\autostart.ps1
# Undo:       delete "Arlo" from the folder that opens with Win+R, shell:startup
$arlo = Split-Path -Parent $PSScriptRoot
$shortcut = Join-Path ([Environment]::GetFolderPath('Startup')) 'Arlo.lnk'
$link = (New-Object -ComObject WScript.Shell).CreateShortcut($shortcut)
$link.TargetPath = Join-Path $arlo 'start.cmd'
$link.Arguments = '--no-open'
$link.WorkingDirectory = $arlo
$link.WindowStyle = 7   # start minimised
$link.Save()
Write-Host "Arlo will now start when you sign in. Open it any time at http://127.0.0.1:8787"
