$WshShell = New-Object -ComObject WScript.Shell
$StartupPath = [Environment]::GetFolderPath('Startup')
$ShortcutPath = Join-Path $StartupPath "Claude Code UI.lnk"

$Shortcut = $WshShell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = "E:\Code\claude-web-ui\start.bat"
$Shortcut.WorkingDirectory = "E:\Code\claude-web-ui"
$Shortcut.WindowStyle = 7
$Shortcut.Description = "Claude Code Web UI"
$Shortcut.Save()

Write-Host "Raccourci cree dans: $ShortcutPath"
