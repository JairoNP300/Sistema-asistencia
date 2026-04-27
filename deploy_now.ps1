Set-Location "C:\Users\Zetin\Downloads\Sistema-asistencia-main\Sistema-asistencia-main"

# Re-write files with correct UTF-8 encoding (no BOM)
$files = @("checkin.js", "checkin.html", "checkin.css", "app.js", "server.js", "index.html", "models/State.js")
foreach ($f in $files) {
    if (Test-Path $f) {
        $content = Get-Content $f -Raw -Encoding UTF8
        [System.IO.File]::WriteAllText((Resolve-Path $f).Path, $content, [System.Text.UTF8Encoding]::new($false))
        Write-Host "Re-encoded: $f"
    }
}

git add -A
$status = git status --porcelain
if ($status) {
    git commit -m "Fix encoding UTF-8 + GPS tiempo real + Geofences"
    git push origin main
    Write-Host "PUSHED OK"
} else {
    Write-Host "NO_CHANGES"
}
