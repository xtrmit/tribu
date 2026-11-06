# Lance Tribu sur le PC (version LOCAL) : http://localhost:8080
# Usage : .\tools\serve.ps1
$py = Get-Command python -ErrorAction SilentlyContinue
if (-not $py) { $py = Get-Command py -ErrorAction SilentlyContinue }
if (-not $py) { Write-Host "Python est introuvable. Installe-le : winget install Python.Python.3.12" -ForegroundColor Red; exit 1 }
& $py.Source (Join-Path $PSScriptRoot 'serve.py') 8080
