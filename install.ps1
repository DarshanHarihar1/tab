# Tab installer (Windows PowerShell). Mirrors install.sh. Idempotent.
# Uninstall with: install.ps1 -Uninstall
param([switch]$Uninstall)
$ErrorActionPreference = "Stop"

$Src = Split-Path -Parent $MyInvocation.MyCommand.Path
$Dest = if ($env:TAB_DEST) { $env:TAB_DEST } else { Join-Path $HOME ".claude\plugins\tab" }

if ($Uninstall) {
  $cfg = Join-Path $Dest "install\configure.js"
  if (Test-Path $cfg) { node $cfg uninstall $Dest }
  if (Test-Path $Dest) { Remove-Item -Recurse -Force $Dest }
  Write-Host "tab: uninstalled."
  exit 0
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Write-Error "tab: needs Node >= 18 on PATH."; exit 1 }
if (-not (Test-Path (Join-Path $HOME ".claude"))) { Write-Host "tab: note - ~/.claude not found; is Claude Code installed?" }

New-Item -ItemType Directory -Force -Path $Dest | Out-Null
foreach ($item in @(".claude-plugin","hooks","lib","statusline","bin","commands","skills","install","package.json")) {
  $p = Join-Path $Src $item
  if (Test-Path $p) { Copy-Item -Recurse -Force $p $Dest }
}

node (Join-Path $Dest "install\configure.js") install $Dest

Write-Host "tab: installed to $Dest and registered in settings.json."
Write-Host "tab: restart Claude Code. Silence the statusline any time with TAB_STATUSLINE=0."
