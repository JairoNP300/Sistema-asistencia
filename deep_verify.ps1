$base = "https://sistema-asistencia-s0m2.onrender.com"

Write-Host "=== DEEP CONTENT VERIFICATION ==="
Write-Host ""

# server.js - check all critical endpoints
$srv = (Invoke-WebRequest -Uri "$base/server.js" -UseBasicParsing -TimeoutSec 40).Content
$srvChecks = @(
    "GEOFENCE_VIOLATION",
    "api/timer/clockin",
    "api/timer/clockout", 
    "api/timer/active",
    "api/timeoff",
    "api/schedules",
    "api/groups",
    "api/projects",
    "api/reports/advanced",
    "api/geofences",
    "api/sync/offline",
    "api/employees/:empId/pin",
    "join\('\\n'\)",
    "DELETE.*employees"
)
Write-Host "--- server.js ---"
foreach ($c in $srvChecks) {
    if ($srv -match $c) { Write-Host "OK  $c" } else { Write-Host "MISS $c" }
}

Write-Host ""
Write-Host "--- app.js ---"
$app = (Invoke-WebRequest -Uri "$base/app.js" -UseBasicParsing -TimeoutSec 40).Content
$appChecks = @(
    "selectEmpForQR",
    "generateAndShowQR",
    "renderTimer",
    "timerClockIn",
    "timerClockOut",
    "renderTimeOff",
    "submitTimeOff",
    "renderSchedules",
    "saveSchedule",
    "renderGroups",
    "saveGroup",
    "renderProjects",
    "saveProject",
    "renderReportsAdvanced",
    "runAdvancedReport",
    "renderGeofences",
    "addGeofence",
    "useMyLocation",
    "deleteGeofence"
)
foreach ($c in $appChecks) {
    if ($app -match $c) { Write-Host "OK  $c" } else { Write-Host "MISS $c" }
}

Write-Host ""
Write-Host "--- checkin.js ---"
$ck = (Invoke-WebRequest -Uri "$base/checkin.js" -UseBasicParsing -TimeoutSec 40).Content
$ckChecks = @("startGPS","stopGPS","watchPosition","gpsPosition","GEOFENCE_VIOLATION","gpsStatusBar","haversineClient")
foreach ($c in $ckChecks) {
    if ($ck -match $c) { Write-Host "OK  $c" } else { Write-Host "MISS $c" }
}

Write-Host ""
Write-Host "=== DONE ==="
