Set-Location "C:\Users\Zetin\Downloads\Sistema-asistencia-main\Sistema-asistencia-main"

Write-Host "=== STEP 1: Verify GitHub has GPS code ==="
$gpsInGithub = git show origin/main:checkin.js | Select-String "startGPS"
if ($gpsInGithub) {
    Write-Host "OK - GPS code confirmed in GitHub (origin/main)"
} else {
    Write-Host "MISSING - GPS not in GitHub, pushing now..."
    git add -A
    git commit --allow-empty -m "GPS tiempo real + Geofences"
    git push origin main
}

Write-Host ""
Write-Host "=== STEP 2: Wake up Render (HTTP GET) ==="
try {
    $wake = Invoke-WebRequest -Uri "https://sistema-asistencia-s0m2.onrender.com/" -UseBasicParsing -TimeoutSec 120
    Write-Host "Render responded: $($wake.StatusCode)"
} catch {
    Write-Host "Wake request sent (may have timed out, that is OK): $($_.Exception.Message)"
}

Write-Host ""
Write-Host "=== STEP 3: Check checkin.js on Render ==="
try {
    $r = Invoke-WebRequest -Uri "https://sistema-asistencia-s0m2.onrender.com/checkin.js" -UseBasicParsing -TimeoutSec 120
    Write-Host "checkin.js size on Render: $($r.Content.Length) bytes"
    if ($r.Content -match "startGPS") {
        Write-Host "SUCCESS - GPS code is LIVE on Render!"
    } else {
        Write-Host "NOT YET - Render still serving old version. Deploy may still be in progress."
        Write-Host "Check https://dashboard.render.com for deploy status."
    }
} catch {
    Write-Host "Could not reach checkin.js: $($_.Exception.Message)"
}

Write-Host ""
Write-Host "=== STEP 4: Check server.js on Render (geofence endpoint) ==="
try {
    $api = Invoke-WebRequest -Uri "https://sistema-asistencia-s0m2.onrender.com/api/geofences" -UseBasicParsing -TimeoutSec 60 -Headers @{Authorization="Bearer test"}
    Write-Host "Geofences API responded: $($api.StatusCode) - $($api.Content)"
} catch {
    Write-Host "Geofences API: $($_.Exception.Message)"
}

Write-Host ""
Write-Host "=== DONE ==="
