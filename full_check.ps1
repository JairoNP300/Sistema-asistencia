Set-Location "C:\Users\Zetin\Downloads\Sistema-asistencia-main\Sistema-asistencia-main"

Write-Host "=== LOCAL GIT STATUS ==="
git log --oneline -3
git status --short

Write-Host ""
Write-Host "=== CHECKING RENDER SERVER ==="
try {
    $r = Invoke-WebRequest -Uri "https://sistema-asistencia-s0m2.onrender.com/app.js" -UseBasicParsing -TimeoutSec 60
    Write-Host "app.js size on Render: $($r.Content.Length) bytes"
    if ($r.Content -match "renderTimer") { Write-Host "OK - renderTimer found" } else { Write-Host "MISSING - renderTimer NOT found" }
    if ($r.Content -match "renderTimeOff") { Write-Host "OK - renderTimeOff found" } else { Write-Host "MISSING - renderTimeOff NOT found" }
    if ($r.Content -match "invoicing") { Write-Host "WARN - invoicing still present" } else { Write-Host "OK - invoicing removed" }
    if ($r.Content -match "Aprobaciones") { Write-Host "WARN - Aprobaciones still present" } else { Write-Host "OK - Aprobaciones removed" }
} catch {
    Write-Host "ERROR fetching app.js: $($_.Exception.Message)"
}

Write-Host ""
Write-Host "=== LOCAL app.js ==="
$local = Get-Content "app.js" -Raw
Write-Host "Local app.js size: $($local.Length) bytes"
if ($local -match "renderTimer") { Write-Host "OK - renderTimer in local" }
if ($local -match "renderTimeOff") { Write-Host "OK - renderTimeOff in local" }
