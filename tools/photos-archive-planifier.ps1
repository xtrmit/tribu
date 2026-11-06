# Crée (ou met à jour) la tâche planifiée Windows qui archive les photos de Tribu chaque jour.
#   .\tools\photos-archive-planifier.ps1
# La tâche lance tools\photos-archive.ps1 chaque jour à 21 h. Si le PC était éteint à cette heure-là,
# elle se lance dès que possible (au démarrage suivant).
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$script = Join-Path $PSScriptRoot 'photos-archive.ps1'
if (-not (Test-Path $script)) { Write-Host "[X] $script introuvable" -ForegroundColor Red; exit 1 }

$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$script`""
$declencheur = New-ScheduledTaskTrigger -Daily -At '21:00'
$reglages = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 30)
Register-ScheduledTask -TaskName 'Tribu - archive des photos' -Action $action -Trigger $declencheur -Settings $reglages `
  -Description 'Copie chaque jour les nouvelles photos de Tribu depuis le serveur n8n vers D:\Mes images\Tribu-Photos (sans doublon).' -Force | Out-Null

Write-Host "[OK] Tâche planifiée « Tribu - archive des photos » créée : chaque jour à 21 h (ou au démarrage suivant si le PC était éteint)." -ForegroundColor Green
Write-Host "  Pour la lancer tout de suite : Start-ScheduledTask -TaskName 'Tribu - archive des photos'"
Write-Host "  Journal : D:\Mes images\Tribu-Photos\archive.log"
