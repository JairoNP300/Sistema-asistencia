$base = "https://sistema-asistencia-s0m2.onrender.com"

Write-Host "Step 1: Waking up server..."
try {
    $ping = Invoke-WebRequest -Uri "$base/" -UseBasicParsing -TimeoutSec 60 -Method HEAD
    Write-Host "Server responded: $($ping.StatusCode)"
} catch {
    Write-Host "Ping result: $($_.Exception.Message)"
}

Write-Host "Step 2: Checking checkin.js for GPS code..."
try {
    $r = Invoke-WebRequest -Uri "$base/checkin.js" -UseBasicParsing -TimeoutSec 30
    Write-Host "checkin.js size: $($r.Content.Length) bytes"
    if ($r.Content -match "startGPS") {
        Write-Host "SUCCESS - GPS code is LIVE on Render!"
    } else {
        Write-Host "FAIL - GPS code not found (old version still serving)"
    }
} catch {
    Write-Host "Error: $($_.Exception.Message)"
}

Write-Host "Step 3: Checking server.js syntax (API health)..."
try {
    $api = Invoke-WebRequest -Uri "$base/api/config" -UseBasicParsing -TimeoutSec 20
    Write-Host "API /api/config: $($api.StatusCode) - $($api.Content)"
} catch {
    Write-Host "API error: $($_.Exception.Message)"
}
