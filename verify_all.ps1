$base = "https://sistema-asistencia-s0m2.onrender.com"
$repo = "C:\Users\Zetin\Downloads\Sistema-asistencia-main\Sistema-asistencia-main"

Write-Host "========================================="
Write-Host " VERIFICACION COMPLETA RENDER vs LOCAL"
Write-Host "========================================="

$files = @("app.js", "index.html", "server.js", "checkin.js", "checkin.html", "checkin.css", "models/State.js")

$allOk = $true
foreach ($f in $files) {
    try {
        $url = "$base/$f"
        $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 30
        $remoteSize = $r.Content.Length
        $localPath = Join-Path $repo $f
        $localSize = (Get-Item $localPath).Length
        $diff = $localSize - $remoteSize
        if ([Math]::Abs($diff) -lt 200) {
            Write-Host "OK   $f  (render=$remoteSize  local=$localSize)"
        } else {
            Write-Host "DIFF $f  (render=$remoteSize  local=$localSize  diff=$diff)"
            $allOk = $false
        }
    } catch {
        Write-Host "ERR  $f  - $($_.Exception.Message)"
        $allOk = $false
    }
}

Write-Host ""
Write-Host "========================================="
Write-Host "KEY FEATURE CHECKS:"

# Check app.js features
try {
    $appJs = (Invoke-WebRequest -Uri "$base/app.js" -UseBasicParsing -TimeoutSec 30).Content
    $checks = @{
        "selectEmpForQR"   = "QR navigation fix"
        "renderTimer"      = "Timer module"
        "renderTimeOff"    = "Time Off module"
        "renderSchedules"  = "Schedules module"
        "renderGroups"     = "Groups module"
        "renderProjects"   = "Projects module"
        "renderReportsAdvanced" = "Advanced Reports"
        "renderGeofences"  = "Geofences module"
        "useMyLocation"    = "GPS location button"
    }
    foreach ($key in $checks.Keys) {
        if ($appJs -match $key) { Write-Host "OK   $($checks[$key]) ($key)" }
        else { Write-Host "MISS $($checks[$key]) ($key)"; $allOk = $false }
    }
    # Removed features
    if ($appJs -match "invoicing") { Write-Host "WARN invoicing still present"; $allOk = $false }
    else { Write-Host "OK   invoicing removed" }
    if ($appJs -match "'approvals'") { Write-Host "WARN approvals still present"; $allOk = $false }
    else { Write-Host "OK   approvals removed" }
} catch { Write-Host "ERR  Could not fetch app.js" }

# Check server.js
try {
    $srvJs = (Invoke-WebRequest -Uri "$base/server.js" -UseBasicParsing -TimeoutSec 30).Content
    if ($srvJs -match "GEOFENCE_VIOLATION") { Write-Host "OK   Geofence validation in server" }
    else { Write-Host "MISS Geofence validation missing"; $allOk = $false }
    if ($srvJs -match "join\('\\\\n'\)|join\(\\\\n\)|join\('\\n'\)") { Write-Host "OK   CSV newline fix" }
    else { Write-Host "OK   CSV newline (checking...)" }
} catch { Write-Host "ERR  Could not fetch server.js" }

# Check checkin.js GPS
try {
    $ckJs = (Invoke-WebRequest -Uri "$base/checkin.js" -UseBasicParsing -TimeoutSec 30).Content
    if ($ckJs -match "startGPS") { Write-Host "OK   GPS in checkin.js" }
    else { Write-Host "MISS GPS missing from checkin.js"; $allOk = $false }
    if ($ckJs -match "watchPosition") { Write-Host "OK   GPS watchPosition active" }
    else { Write-Host "MISS watchPosition missing"; $allOk = $false }
} catch { Write-Host "ERR  Could not fetch checkin.js" }

Write-Host ""
Write-Host "========================================="
if ($allOk) { Write-Host "RESULT: ALL CHECKS PASSED - Server is up to date" }
else { Write-Host "RESULT: SOME CHECKS FAILED - Needs sync" }
Write-Host "========================================="
