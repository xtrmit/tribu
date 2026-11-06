# Tribu

Application familiale privée : chat, agenda, rappels, carte, frigo et animal de compagnie partagés entre les membres d'une même famille. C'est une application web installable (PWA), qui marche hors ligne et sans publicité. Les données partagées passent par le serveur privé de la famille, jamais par un service tiers.

Ce dépôt ne contient que le code de l'application : aucune donnée, aucun prénom, aucun secret. Les membres, leurs prénoms et leurs droits sont fournis par le serveur après connexion avec un jeton personnel.

## Les 3 versions

| Version | Où | Rôle | Icône |
|---|---|---|---|
| **LOCAL** | `http://localhost:8080` sur le PC | Développer et tester à chaud | balise LOCAL |
| **TEST** | `https://xtrmit.github.io/tribu-test/` | Valider sur un téléphone | orange, « Tribu T » |
| **PROD** | `https://xtrmit.github.io/tribu/` | Usage réel de la famille | corail, « Tribu » |

Chaque version garde ses propres données et son propre cache. Les workflows n8n sont séparés aussi : `/webhook/tribu-test/…` pour TEST et LOCAL, `/webhook/tribu/…` pour PROD.

## Mise en route (une seule fois)

```powershell
cd F:\TRIBU
.\tools\setup-github.ps1
```

Le script vérifie GitHub CLI et la connexion au compte GitHub, initialise le dépôt Git local, puis crée les dépôts publics `tribu-test` et `tribu`. Ils ne contiennent que du code, jamais de données ni de secret.

## Cycle de travail

1. **Tester sur le PC** : `.\tools\serve.ps1`. Chrome s'ouvre sur la version LOCAL ; F5 pour voir les changements ; F12 puis l'icône téléphone pour simuler un écran de téléphone.
2. **Envoyer en TEST** : `.\tools\deploy.ps1 test`. Le script enregistre les modifications et propose d'augmenter le numéro de version. En ligne 1 à 2 minutes après.
3. **Valider sur le téléphone** avec l'app « Tribu T » (orange), y compris en mode avion.
4. **Publier en PROD** : `.\tools\deploy.ps1 prod`, puis taper `OUI`. Seul le code déjà passé par TEST est accepté.

## Installer sur un téléphone

**Android** : ouvrir l'adresse dans **Chrome**, menu ⋮ → **Ajouter à l'écran d'accueil** → **Installer**.

**iPhone** : ouvrir l'adresse dans **Safari**, bouton **Partager** (carré avec une flèche) → **Sur l'écran d'accueil** → **Ajouter**. Il faut ouvrir Tribu depuis cette icône : c'est indispensable pour les notifications et pour garder les données (iOS 16.4 minimum).

## Mises à jour automatiques

À chaque ouverture avec du réseau, Tribu vérifie s'il existe une nouvelle version, la télécharge en arrière-plan et se recharge toute seule. Un bandeau « Tribu mis à jour (vX.Y.Z) » le confirme. Le déclencheur est le numéro de version dans `version.js`, que `deploy.ps1 test` fait évoluer.

## Sécurité

- Aucune clé ni mot de passe dans le code : les dépôts sont publics.
- Chaque téléphone reçoit son propre jeton (QR code), révocable côté n8n.
- Les clés d'API et la clé privée des notifications restent dans n8n.

## Fichiers

```
index.html                 page de l'app
css/app.css                styles (Corail, clair / sombre, 3 tailles de texte)
js/app.js                  logique
version.js                 numéro de version (déclenche les mises à jour)
sw.js                      service worker : hors ligne, mise à jour, notifications
manifest*.webmanifest      fiches d'installation (PROD / TEST)
fonts/                     polices Fredoka et Nunito (licence OFL), embarquées pour le hors ligne
icons/                     icônes (corail = PROD, orange = TEST)
tools/                     serve.ps1, setup-github.ps1, deploy.ps1
```
