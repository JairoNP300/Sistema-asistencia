Set-Location "C:\Users\Zetin\Downloads\Sistema-asistencia-main\Sistema-asistencia-main"

# Create an empty commit to force Render to redeploy
git commit --allow-empty -m "Force redeploy: GPS + Geofences en tiempo real"
git push origin main
Write-Host "Empty commit pushed - Render will redeploy in ~2 minutes"
Write-Host "Monitor at: https://dashboard.render.com"
