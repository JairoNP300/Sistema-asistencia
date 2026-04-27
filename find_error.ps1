$file = "C:\Users\Zetin\Downloads\Sistema-asistencia-main\Sistema-asistencia-main\app.js"
$lines = [System.IO.File]::ReadAllLines($file)
$total = $lines.Count
Write-Host "Total lines: $total"
Write-Host "Lines 1165-1180:"
for ($i = 1164; $i -le [Math]::Min(1179, $total-1); $i++) {
    Write-Host "$($i+1): $($lines[$i])"
}
