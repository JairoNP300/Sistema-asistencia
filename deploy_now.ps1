$REPO = "C:\Users\Zetin\Downloads\Sistema-asistencia-main\Sistema-asistencia-main"
Set-Location $REPO
$ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
git add checkin.js checkin.html checkin.css app.js server.js models/State.js index.html
$status = git status --porcelain
if ($status) {
    git commit -m "GPS tiempo real + Geofences ($ts)"
    git push origin main
    Write-Host "OK - Push exitoso. Render actualizara en ~2 minutos."
} else {
    Write-Host "INFO - No hay cambios detectados por git."
}
