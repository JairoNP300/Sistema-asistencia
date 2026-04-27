$file = "C:\Users\Zetin\Downloads\Sistema-asistencia-main\Sistema-asistencia-main\app.js"
$lines = [System.IO.File]::ReadAllLines($file)
Write-Host "Total lines: $($lines.Count)"

# Find lines that look like they're cut mid-word (end with a letter, no semicolon/brace/comma)
$suspicious = @()
for ($i = 0; $i -lt $lines.Count - 1; $i++) {
    $line = $lines[$i].TrimEnd()
    $next = $lines[$i+1].TrimStart()
    # Check if line ends mid-identifier (letter/digit) and next line continues it
    if ($line -match '[a-zA-Z0-9]$' -and $next -match '^[a-zA-Z]' -and $line -notmatch '^\s*//' -and $line.Length -gt 20) {
        $suspicious += "Line $($i+1): $line"
        $suspicious += "Line $($i+2): $($lines[$i+1])"
        $suspicious += "---"
    }
}
if ($suspicious.Count -gt 0) {
    Write-Host "SUSPICIOUS LINES:"
    $suspicious | ForEach-Object { Write-Host $_ }
} else {
    Write-Host "No suspicious line breaks found"
}
