Set-Location "C:\Users\Zetin\Downloads\Sistema-asistencia-main\Sistema-asistencia-main"
git add -A
$status = git status --porcelain
if ($status) {
    git commit -m "GPS tiempo real + Geofences + columna ubicacion en logs"
    git push origin main
    Write-Host "PUSHED - Render actualizara en ~2 minutos."
} else {
    Write-Host "ALREADY_CLEAN - Todo ya estaba subido."
}
