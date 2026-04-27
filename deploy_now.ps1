Set-Location "C:\Users\Zetin\Downloads\Sistema-asistencia-main\Sistema-asistencia-main"
git add app.js
$status = git status --porcelain
if ($status) {
    git commit -m "Fix: add missing selectEmpForQR and generateAndShowQR - restores full JS functionality"
    git push origin main
    Write-Host "PUSHED OK"
    git log --oneline -2
} else {
    Write-Host "NO_CHANGES"
}
