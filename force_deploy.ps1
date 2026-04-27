Set-Location "C:\Users\Zetin\Downloads\Sistema-asistencia-main\Sistema-asistencia-main"

# Read current files from Kiro workspace (parent folder has the edited versions)
# The workspace root is one level up from the git repo
$workspace = "C:\Users\Zetin\Downloads\Sistema-asistencia-main\Sistema-asistencia-main"

# Show current sizes to diagnose
Write-Host "Current file sizes in repo:"
Get-ChildItem "$workspace\checkin.js", "$workspace\app.js", "$workspace\server.js" | Select-Object Name, Length

# Force git to see changes by updating timestamps
(Get-Item "$workspace\checkin.js").LastWriteTime = Get-Date
(Get-Item "$workspace\app.js").LastWriteTime = Get-Date
(Get-Item "$workspace\server.js").LastWriteTime = Get-Date
(Get-Item "$workspace\checkin.html").LastWriteTime = Get-Date
(Get-Item "$workspace\checkin.css").LastWriteTime = Get-Date
(Get-Item "$workspace\index.html").LastWriteTime = Get-Date
(Get-Item "$workspace\models\State.js").LastWriteTime = Get-Date

git add -A
$status = git status --porcelain
Write-Host "Git status: '$status'"

if ($status) {
    git commit -m "GPS tiempo real + Geofences + columna ubicacion en logs"
    git push origin main
    Write-Host "PUSHED OK - Render actualizara en ~2 minutos"
} else {
    Write-Host "NO_CHANGES - git no detecta diferencias"
    Write-Host "Checking if content differs from last commit..."
    git show HEAD:checkin.js | Measure-Object -Line | Select-Object Lines
    Get-Content checkin.js | Measure-Object -Line | Select-Object Lines
}
