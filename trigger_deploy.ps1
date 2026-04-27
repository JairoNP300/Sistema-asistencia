Set-Location "C:\Users\Zetin\Downloads\Sistema-asistencia-main\Sistema-asistencia-main"

# Add a version comment to checkin.js to force a real file change
$file = "checkin.js"
$content = Get-Content $file -Raw
$marker = "/* GPS-DEPLOY-$(Get-Date -Format 'yyyyMMdd-HHmmss') */"

# Only add if marker not already present from today
if ($content -notmatch "GPS-DEPLOY-$(Get-Date -Format 'yyyyMMdd')") {
    $newContent = $marker + "`n" + $content
    [System.IO.File]::WriteAllText((Resolve-Path $file).Path, $newContent, [System.Text.UTF8Encoding]::new($false))
    Write-Host "Added deploy marker to checkin.js"
}

git add checkin.js
$status = git status --porcelain
Write-Host "Status: $status"

if ($status) {
    git commit -m "Trigger deploy: GPS tiempo real activo"
    git push origin main
    Write-Host "PUSHED - commit sent to GitHub"
    git log --oneline -2
} else {
    Write-Host "No change detected"
}
