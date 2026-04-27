Set-Location "C:\Users\Zetin\Downloads\Sistema-asistencia-main\Sistema-asistencia-main"

Write-Host "=== Forcing sync of all changed files ==="

# Re-encode all files as UTF-8 no BOM to ensure clean content
$files = @("app.js", "index.html", "server.js", "checkin.js", "checkin.html", "checkin.css", "models/State.js", "utils/verifier.js")
foreach ($f in $files) {
    if (Test-Path $f) {
        $content = [System.IO.File]::ReadAllText((Resolve-Path $f).Path, [System.Text.Encoding]::UTF8)
        [System.IO.File]::WriteAllText((Resolve-Path $f).Path, $content, [System.Text.UTF8Encoding]::new($false))
    }
}

git add app.js index.html server.js checkin.js checkin.html checkin.css models/State.js utils/verifier.js

$status = git status --porcelain
Write-Host "Changed files: $status"

if ($status) {
    git commit -m "Sync: force push all updated files to Render"
    git push origin main
    Write-Host "PUSHED OK"
} else {
    Write-Host "Git says no changes - forcing empty commit to trigger Render redeploy"
    git commit --allow-empty -m "Force Render redeploy - sync all files"
    git push origin main
    Write-Host "EMPTY COMMIT PUSHED"
}

git log --oneline -3
