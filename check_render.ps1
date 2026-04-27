try {
    $r = Invoke-WebRequest -Uri "https://sistema-asistencia-s0m2.onrender.com/checkin.js" -UseBasicParsing -TimeoutSec 30
    $content = $r.Content
    if ($content -match "startGPS") {
        Write-Host "OK - GPS code found on Render server"
    } else {
        Write-Host "MISSING - GPS code NOT found on Render server"
    }
    if ($content -match "gpsPosition") {
        Write-Host "OK - gpsPosition found"
    }
    Write-Host "File size: $($content.Length) bytes"
} catch {
    Write-Host "ERROR: $($_.Exception.Message)"
}
