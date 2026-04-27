try {
    Write-Host "Connecting to Render..."
    $r = Invoke-WebRequest -Uri "https://sistema-asistencia-s0m2.onrender.com/checkin.js" -UseBasicParsing -TimeoutSec 60
    $content = $r.Content
    Write-Host "File size: $($content.Length) bytes"
    if ($content -match "startGPS") {
        Write-Host "DEPLOYED - GPS code is LIVE on Render"
    } else {
        Write-Host "PENDING - GPS code not yet on Render (still deploying)"
    }
} catch {
    Write-Host "ERROR or TIMEOUT: $($_.Exception.Message)"
    Write-Host "Render may still be deploying. Try again in 1-2 minutes."
}
