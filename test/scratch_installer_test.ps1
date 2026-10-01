$installerPath = ".\release\EchoCRM Setup 1.0.0.exe"
$testInstallDir = "C:\Users\athul\AppData\Local\Temp\EchoCRM-Final-Audit-Install"

if (Test-Path $testInstallDir) {
    Remove-Item -Recurse -Force $testInstallDir -ErrorAction SilentlyContinue
}

Write-Host "Running silent installation to $testInstallDir..."
$proc = Start-Process -FilePath $installerPath -ArgumentList "/S", "/D=$testInstallDir" -Wait -PassThru
Write-Host "Installer finished with exit code: $($proc.ExitCode)"

$installedExe = Join-Path $testInstallDir "EchoCRM.exe"
if (Test-Path $installedExe) {
    Write-Host "EchoCRM.exe found at: $installedExe"
    $p = Start-Process -FilePath $installedExe -PassThru
    Start-Sleep -Seconds 6
    Write-Host "Launched installed PID: $($p.Id)"

    try {
        $res = Invoke-RestMethod -Uri "http://127.0.0.1:8000/health" -UseBasicParsing -TimeoutSec 5
        $json = $res | ConvertTo-Json -Compress
        Write-Host "Installed app AI health check: $json"
    } catch {
        Write-Host "Health check error: $($_.Exception.Message)"
    }

    taskkill /pid $p.Id /T /F
    Start-Sleep -Seconds 2
} else {
    Write-Host "ERROR: EchoCRM.exe was not created in $testInstallDir"
}

# Clean up test install directory
Write-Host "Cleaning up test installation..."
Start-Sleep -Seconds 2
Remove-Item -Recurse -Force $testInstallDir -ErrorAction SilentlyContinue
Write-Host "Cleanup completed."
