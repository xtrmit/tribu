# Archive les photos de Tribu sur le PC : COPIE depuis le serveur n8n, sans doublon.
#   .\tools\photos-archive.ps1           -> archive maintenant (lancé aussi chaque jour par la tâche planifiée)
# Les photos restent 30 jours sur le serveur, puis n8n (« tribu · entretien ») les efface.
# Le PC doit donc lancer ce script au moins une fois tous les 30 jours.
# Rangement : <Dossier>\AAAA-MM\AAAA-MM-JJ_HHmm_Prenom_<id>.jpg  (photos de TEST dans « _TEST (essais) »).
# Réglages personnels (adresse du serveur, prénoms) : fichier tools\archive.local.psd1, jamais envoyé sur GitHub.
param(
  [string]$Dossier = 'D:\Mes images\Tribu-Photos',
  [string]$Serveur = ''
)
$ErrorActionPreference = 'Continue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$Distant = '/root/n8n/data/tribu-photos'
$cfgFile = Join-Path $PSScriptRoot 'archive.local.psd1'
if (-not (Test-Path -LiteralPath $cfgFile)) { Write-Host "[X] Fichier $cfgFile introuvable (adresse du serveur et prénoms)."; exit 1 }
$cfg = Import-PowerShellDataFile -LiteralPath $cfgFile
if (-not $Serveur) { $Serveur = $cfg.Serveur }
$Noms = $cfg.Noms

New-Item -ItemType Directory -Force -Path $Dossier | Out-Null
$journal = Join-Path $Dossier 'archive.log'
function Log([string]$m) {
  $l = '{0:yyyy-MM-dd HH:mm:ss}  {1}' -f (Get-Date), $m
  Write-Host $l
  Add-Content -LiteralPath $journal -Value $l -Encoding UTF8
}
function Depuis-Base36([string]$s) {
  [long]$n = 0
  foreach ($c in $s.ToCharArray()) {
    $v = '0123456789abcdefghijklmnopqrstuvwxyz'.IndexOf($c)
    if ($v -lt 0) { return $null }
    $n = $n * 36 + $v
  }
  return $n
}

if (-not (Get-Command ssh -ErrorAction SilentlyContinue) -or -not (Get-Command scp -ErrorAction SilentlyContinue)) {
  Log '[X] ssh/scp introuvables. Installe OpenSSH : Paramètres > Applications > Fonctionnalités facultatives > Client OpenSSH.'
  exit 1
}

$tmp = Join-Path $env:TEMP 'tribu-photos'
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
$nouvelles = 0; $deja = 0; $erreurs = 0

foreach ($envi in @('prod', 'test')) {
  $liste = & ssh -o BatchMode=yes -o ConnectTimeout=20 $Serveur "ls -1 $Distant/$envi 2>/dev/null; true"
  if ($LASTEXITCODE -ne 0) { Log "[X] Connexion SSH au serveur impossible ($Serveur). Réessai au prochain lancement."; exit 1 }
  $base = if ($envi -eq 'test') { Join-Path $Dossier '_TEST (essais)' } else { $Dossier }

  foreach ($f in @($liste)) {
    if ($f -notmatch '^([a-z0-9]+)_([a-z0-9]{6,30})\.jpg$') { continue }
    $membre = $Matches[1]; $id = $Matches[2]
    if (-not $Noms.ContainsKey($membre)) { continue }

    # Date de la photo, lue dans son identifiant (horodatage en base 36, suivi de 4 caractères aléatoires)
    $date = Get-Date
    $ms = Depuis-Base36 $id.Substring(0, $id.Length - 4)
    if ($ms -and $ms -gt 1700000000000) { $date = [DateTimeOffset]::FromUnixTimeMilliseconds($ms).LocalDateTime }

    $mois = Join-Path $base ($date.ToString('yyyy-MM'))
    $nom = '{0:yyyy-MM-dd_HHmm}_{1}_{2}.jpg' -f $date, $Noms[$membre], $id
    $final = Join-Path $mois $nom
    if (Test-Path -LiteralPath $final) { $deja++; continue }     # déjà archivée : pas de doublon

    New-Item -ItemType Directory -Force -Path $mois | Out-Null
    Push-Location $tmp
    & scp -q -o BatchMode=yes -o ConnectTimeout=20 "${Serveur}:$Distant/$envi/$f" ".\$f"
    $ok = ($LASTEXITCODE -eq 0) -and (Test-Path -LiteralPath (Join-Path $tmp $f))
    Pop-Location
    if (-not $ok) { $erreurs++; Log "  ! Échec de copie : $envi/$f"; continue }

    Move-Item -LiteralPath (Join-Path $tmp $f) -Destination $final -Force
    $it = Get-Item -LiteralPath $final
    $it.CreationTime = $date; $it.LastWriteTime = $date
    $nouvelles++
  }
}

Log ("Archive terminée : {0} nouvelle(s) photo(s), {1} déjà présente(s), {2} erreur(s). Dossier : {3}" -f $nouvelles, $deja, $erreurs, $Dossier)
if ($erreurs -gt 0) { exit 2 }
