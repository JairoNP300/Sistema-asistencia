$REPO = "C:\Users\Zetin\Downloads\Sistema-asistencia-main\Sistema-asistencia-main"
Set-Location $REPO
$ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
git add .
$status = git status --porcelain
if ($status) {
    git commit -m "GPS + Geofences: ubicacion en tiempo real ($ts)"
    git push origin main
    Write-Host "OK - Cambios subidos a GitHub. Render actualizara en ~2 minutos."
} else {
    Write-Host "INFO - No hay cambios nuevos para subir."
}
