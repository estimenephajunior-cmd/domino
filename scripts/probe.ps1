$ErrorActionPreference = 'Continue'
$core = 'node_modules/howler/src/howler.core.js'
Write-Host '=== autoUnlock / _setup / unload ==='
Select-String -Path $core -Pattern 'autoUnlock|_unlockAudio\(|_setup:|unload:|usingWebAudio =|self\.ctx = null|state = ' |
  ForEach-Object { '{0}: {1}' -f $_.LineNumber, $_.Line.Trim() }
Write-Host ''
Write-Host '=== lines 160-215 (unload) ==='
Get-Content $core | Select-Object -Skip 159 -First 56 | ForEach-Object -Begin { $i = 160 } -Process { '{0}: {1}' -f $i, $_; $i++ }
Write-Host ''
Write-Host '=== lines 60-100 (_setup) ==='
Get-Content $core | Select-Object -Skip 59 -First 45 | ForEach-Object -Begin { $i = 60 } -Process { '{0}: {1}' -f $i, $_; $i++ }
