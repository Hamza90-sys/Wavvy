$root = Split-Path -Parent $PSScriptRoot
Start-Process -FilePath "node.exe" -ArgumentList "scripts\\dev-watch.cjs" -WorkingDirectory $root -WindowStyle Minimized
