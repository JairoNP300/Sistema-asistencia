try {
    $r = Invoke-WebRequest -Uri "https://sistema-asistencia-s0m2.onrender.com/app.js" -UseBasicParsing -TimeoutSec 60
    if ($r.Content -match "selectEmpForQR") {
        Write-Host "DEPLOYED - selectEmpForQR fix is LIVE"
    } else {
        Write-Host "PENDING - fix not yet deployed"
    }
    Write-Host "app.js size: $($r.Content.Length) bytes"
} catch {
    Write-Host "ERROR: $($_.Exception.Message)"
}
