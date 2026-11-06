# Préparation unique : GitHub CLI, connexion, dépôt Git local, et les deux dépôts GitHub :
#   tribu-test  -> version TEST (https://<compte>.github.io/tribu-test/)
#   tribu       -> version PROD (https://<compte>.github.io/tribu/)
# Usage : .\tools\setup-github.ps1
$ErrorActionPreference = 'Continue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Set-Location (Split-Path $PSScriptRoot -Parent)

function Fail([string]$m) { Write-Host "`n[X] $m" -ForegroundColor Red; exit 1 }
function Ok([string]$m)   { Write-Host "[OK] $m" -ForegroundColor Green }
function Info([string]$m) { Write-Host "  - $m" -ForegroundColor Gray }
function Run([string]$exe, [string[]]$a) {
  & $exe @a
  if ($LASTEXITCODE -ne 0) { Fail "Échec de la commande : $exe $($a -join ' ')" }
}
function Get-Version([string]$text) {
  return [regex]::Match($text, "TRIBU_VERSION\s*=\s*'([^']+)'").Groups[1].Value
}
function Next-Version([string]$v) {
  $p = $v.Split('.'); $p[$p.Length-1] = [string]([int]$p[$p.Length-1] + 1); return ($p -join '.')
}
function Ensure-Gh {
  if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    $env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')
  }
  if (-not (Get-Command gh -ErrorAction SilentlyContinue)) { Fail "GitHub CLI (gh) est introuvable. Lance d'abord .\tools\setup-github.ps1" }
}
function Ensure-Pages([string]$user, [string]$repo) {
  gh api "repos/$user/$repo/pages" 2>$null | Out-Null
  if ($LASTEXITCODE -ne 0) {
    Info "Activation de GitHub Pages sur $repo..."
    gh api -X POST "repos/$user/$repo/pages" -f "source[branch]=main" -f "source[path]=/" 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) { Write-Host "  ! Active Pages à la main : github.com/$user/$repo > Settings > Pages > Branch main / (root)" -ForegroundColor Yellow }
  }
}

Write-Host "=== Tribu : préparation GitHub ===" -ForegroundColor Cyan

# 1. GitHub CLI
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
  Info "Installation de GitHub CLI (winget)..."
  winget install --id GitHub.cli -e --accept-source-agreements --accept-package-agreements
}
Ensure-Gh
Ok "GitHub CLI présent"

# 2. Connexion au compte GitHub (ouvre le navigateur la première fois)
gh auth status 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) { Run gh @('auth','login','--hostname','github.com','--git-protocol','https','--web') }
Run gh @('auth','setup-git')
$user = (gh api user --jq .login).Trim()
if (-not $user) { Fail "Impossible de lire le compte GitHub." }
Ok "Connecté à GitHub en tant que $user"

# 3. Dépôt Git local
if (-not (Test-Path .git)) { Run git @('init','-b','main') }
if (-not (git config user.email)) {
  git config user.email "$user@users.noreply.github.com"
  git config user.name  "$user"
}
git add -A
git diff --cached --quiet
if ($LASTEXITCODE -ne 0) { Run git @('commit','-q','-m','Tribu : version initiale') }
Ok "Dépôt Git local prêt"

# 4. Dépôts GitHub (publics : GitHub Pages gratuit l'exige ; ils ne contiennent que le code, aucune donnée)
foreach ($r in @(@{ repo='tribu-test'; remote='test' }, @{ repo='tribu'; remote='prod' })) {
  gh repo view "$user/$($r.repo)" 2>$null | Out-Null
  if ($LASTEXITCODE -ne 0) {
    Run gh @('repo','create',$r.repo,'--public','--description',"Tribu - app familiale ($($r.remote))")
  }
  git remote get-url $r.remote 2>$null | Out-Null
  if ($LASTEXITCODE -ne 0) { Run git @('remote','add',$r.remote,"https://github.com/$user/$($r.repo).git") }
  Ok "Dépôt $($r.repo) relié (remote '$($r.remote)')"
}

Write-Host "`nTout est prêt. Étape suivante :" -ForegroundColor Cyan
Write-Host "  .\tools\deploy.ps1 test"
