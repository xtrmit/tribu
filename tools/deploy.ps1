# Déploiement de Tribu.
#   .\tools\deploy.ps1 test   -> envoie la version courante sur le site TEST
#   .\tools\deploy.ps1 prod   -> envoie EXACTEMENT ce qui est en TEST sur le site PROD (téléphones)
# Garde-fous : la prod n'accepte que du code déjà déployé en test ; chaque envoi en test
# exige un nouveau numéro de version (c'est lui qui déclenche la mise à jour sur les téléphones).
param([Parameter(Mandatory=$true)][ValidateSet('test','prod')][string]$Cible)
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

Ensure-Gh
$user = (gh api user --jq .login 2>$null)
if (-not $user) { Fail "Pas connecté à GitHub. Lance .\tools\setup-github.ps1" }
$user = $user.Trim()
foreach ($rem in 'test','prod') { git remote get-url $rem 2>$null | Out-Null; if ($LASTEXITCODE -ne 0) { Fail "Remote '$rem' absent. Lance .\tools\setup-github.ps1" } }
git fetch --quiet test 2>$null
git fetch --quiet prod 2>$null

$version = Get-Version (Get-Content version.js -Raw -Encoding UTF8)
if (-not $version) { Fail "Numéro de version introuvable dans version.js" }

if ($Cible -eq 'test') {
  Write-Host "=== Déploiement TEST ===" -ForegroundColor Cyan

  # Modifications non enregistrées -> proposer un commit
  if (git status --porcelain) {
    git status --short
    $msg = Read-Host "Des modifications ne sont pas enregistrées. Décris-les en quelques mots (vide = annuler)"
    if (-not $msg) { Fail "Annulé." }
    git add -A; Run git @('commit','-q','-m',$msg)
  }

  $remoteText = (git show test/main:version.js 2>$null) -join "`n"
  if ($LASTEXITCODE -eq 0) {
    $changed = git diff --name-only test/main HEAD
    if (-not $changed) { Ok "TEST est déjà à jour (v$version)."; exit 0 }
    if ((Get-Version $remoteText) -eq $version) {
      $next = Next-Version $version
      $ans = Read-Host "La v$version est déjà en TEST. Passer en v$next ? (O/n)"
      if ($ans -and $ans -notmatch '^[oOyY]') { Fail "Annulé. Change la version dans version.js puis relance." }
      $txt = (Get-Content version.js -Raw -Encoding UTF8) -replace "TRIBU_VERSION\s*=\s*'[^']+'", "TRIBU_VERSION = '$next'"
      [IO.File]::WriteAllText((Resolve-Path version.js), $txt, (New-Object System.Text.UTF8Encoding($false)))
      git add version.js; Run git @('commit','-q','-m',"Version $next")
      $version = $next
    }
  }

  Run git @('push','-q','test','HEAD:main')
  Ensure-Pages $user 'tribu-test'
  Ok "Tribu v$version envoyée en TEST"
  Write-Host "  En ligne d'ici 1 à 2 minutes : https://$user.github.io/tribu-test/"
  Write-Host "  Une fois validée : .\tools\deploy.ps1 prod"
  exit 0
}

# ---------- PROD ----------
Write-Host "=== Déploiement PRODUCTION ===" -ForegroundColor Cyan
if (git status --porcelain) { Fail "Des modifications ne sont pas encore passées par TEST. Lance d'abord .\tools\deploy.ps1 test" }
git rev-parse --verify --quiet test/main 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) { Fail "Rien n'a encore été déployé en TEST." }
$head = (git rev-parse HEAD).Trim()
$testHead = (git rev-parse test/main).Trim()
if ($head -ne $testHead) { Fail "Le code actuel n'est pas celui qui est en TEST. Lance d'abord .\tools\deploy.ps1 test, puis valide sur le téléphone." }

git rev-parse --verify --quiet prod/main 2>$null | Out-Null
if ($LASTEXITCODE -eq 0 -and (git rev-parse prod/main).Trim() -eq $head) { Ok "PROD est déjà en v$version."; exit 0 }

$prodText = (git show prod/main:version.js 2>$null) -join "`n"
$prodVer = if ($LASTEXITCODE -eq 0) { Get-Version $prodText } else { '(aucune)' }
Write-Host "  Version actuelle en PROD : $prodVer"
Write-Host "  Nouvelle version         : $version (validée en TEST)"
$ans = Read-Host "Publier Tribu v$version sur les téléphones ? Tape OUI pour confirmer"
if ($ans -cne 'OUI') { Fail "Annulé." }

Run git @('push','-q','prod','HEAD:main')
git rev-parse --verify --quiet "refs/tags/v$version" 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) { Run git @('tag','-a',"v$version",'-m',"Production v$version") }
git push -q prod "v$version" 2>$null | Out-Null
Ensure-Pages $user 'tribu'
Ok "Tribu v$version publiée en PRODUCTION"
Write-Host "  Site : https://$user.github.io/tribu/"
Write-Host "  Les téléphones se mettront à jour à la prochaine ouverture de l'app avec du réseau."
