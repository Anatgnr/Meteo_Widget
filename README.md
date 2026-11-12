# WeatherGlass

Widget météo pour Windows 11 : interface Liquid Glass, ville recherchable, prévisions horaires, échéances de pluie et radar observé. Les API sont réelles ; les données fictives existent uniquement dans les tests.

Le livrable cible est un **widget de bureau Tauri**, sans navigateur à ouvrir ni serveur de développement à lancer : fenêtre compacte sans bordure, fond transparent, déplacement sur le bureau, position enregistrée et agrandissement vers la timeline. Le navigateur sert uniquement à développer et tester l'interface. Le mode natif démarre en compact (660 × 410) et ne présente pas l'habillage de tableau de bord de la prévisualisation.

## Essayer maintenant

**Installateur natif :** le point d'entrée **`Installer-WeatherGlass.cmd`** est fourni à la racine. Il prépare et ouvre l'installateur NSIS, une fois la compilation possible. Sur cette machine, les tentatives du 12 novembre 2026 ont été bloquées par Smart App Control : erreur Windows 4551 sur l'exécutable de compilation de `zmij`, puis refus de la DLL de macro Rust `displaydoc`, confirmé dans le journal Code Integrity. Une vérification avec une autre version de dépendance n'a donc pas résolu le blocage ; les versions initiales ont été rétablies. **Aucun `WeatherGlass-Setup.exe` n'a encore été produit.** La protection Windows n'a pas été modifiée.

La compilation et le projet restent locaux, conformément au choix utilisateur. Aucun dépôt distant ni envoi de code n'est nécessaire à l'utilisation finale du widget. Le blocage de la chaîne de compilation locale doit être résolu dans l'environnement Windows avant de pouvoir tester et livrer le binaire natif.

Le `.cmd` utilise `release\WeatherGlass-Setup.exe` s'il existe. Sinon, il détecte Node.js portable dans `.tools`, prépare les dépendances, compile l'application et ouvre l'assistant d'installation. Il ne modifie pas la politique PowerShell globale ni le PATH permanent. Une fois installée, l'application native ne nécessite ni npm, ni Rust, ni serveur Vite ; WebView2 est pris en charge par l'installateur.

Pour la prévisualisation dans le navigateur :

Depuis ce dossier, avec le Node.js portable préparé dans `.tools` :

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\dev.ps1
```

Ouvrir **http://127.0.0.1:1420**. Avec Node.js 24 LTS installé normalement :

```powershell
npm.cmd ci
npm.cmd run dev
```

Choisir une ville en cliquant sur Bordeaux. La recherche distingue les villes homonymes par région et pays. L’étoile ajoute un favori sans récupérer sa météo. Le bouton de réduction du widget passe en mode compact ; les réglages sont accessibles en haut à droite. Aucune clé payante ni localisation automatique ne sont nécessaires.

Captures avec les API réelles : [widget](docs/screenshots/live-desktop.png) · [radar de Bordeaux](docs/screenshots/live-radar.png).

## Application Windows et installateur

Prérequis : **Node.js 24 LTS**, **Rust stable MSVC**, **Visual Studio Build Tools** avec « Développement Desktop en C++ » et Windows SDK, **WebView2**. Voir les [prérequis officiels Tauri](https://v2.tauri.app/start/prerequisites/).

```powershell
npm.cmd ci
npm.cmd run tauri dev
```

Ou, avec Node portable : `powershell -ExecutionPolicy Bypass -File .\scripts\dev.ps1 -Desktop`.

```powershell
Installer-WeatherGlass.cmd -BuildOnly -Rebuild
```

Depuis PowerShell, préfixer la commande précédente par `.\`. `-BuildOnly` produit l'installateur sans l'ouvrir ; `-Rebuild` force sa reconstruction. L'équivalent sans `.cmd` est `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install.ps1 -BuildOnly -Rebuild`.

L'installateur NSIS original est généré dans `src-tauri/target/release/bundle/nsis/`, puis copié dans **`release/WeatherGlass-Setup.exe`**. La configuration française et les icônes sont fournies. Le workflow `.github/workflows/windows.yml` permet aussi de compiler et récupérer cet installateur sur un runner Windows disposant de MSVC. Aucun dépôt distant n’a été créé ni publié.

L'installateur prévu cible Windows x64 et n'est pas signé numériquement. Le journal `Microsoft-Windows-CodeIntegrity/Operational` confirme le blocage local d'un outil Rust par la stratégie de contrôle d'applications ; le registre indique Smart App Control actif. Aucun certificat de signature de code disponible avec clé privée n'a été trouvé dans le magasin personnel du compte courant. Une compilation sur un runner Windows autorisé peut produire le fichier, mais son exécution sur un PC protégé peut également nécessiter une signature reconnue. L'effet Mica et le fonctionnement complet sur le bureau restent à vérifier dans l'application installée.

## Fonctionnalités livrées

- React 19, TypeScript, Vite, Zustand ; polices embarquées, icônes SVG et animations discrètes avec respect du mouvement réduit.
- Conditions courantes Open-Meteo, 12 heures de timeline interactive, détails par heure, données absentes affichées « — ».
- Début/fin de pluie estimés sur des créneaux horaires, hystérésis et confirmation de deux intervalles secs ; éclaircies dépendant des nuages et du jour.
- Recherche Open-Meteo/GeoNames, favoris persistants, changement de ville et annulation des requêtes inutiles.
- Ordonnanceur météo partagé, déduplication par ville, cache TTL, reprise au retour réseau/au focus/après veille et backoff exponentiel. Aucun préchargement des favoris.
- Radar Leaflet chargé à l’ouverture : observations historiques RainViewer, lecture/pause, curseur, zoom/déplacement, légende, attribution et gestion des erreurs.
- Option de fusion expérimentale **ICON Seamless + ECMWF IFS 0.25°**, sans additionner Best Match et ses modèles sous-jacents. Pondération initiale égale, configurable dans le module de fusion, aucune confiance chiffrée inventée.
- Thèmes sombre/clair/système, opacité, flou CSS, accent et fréquence. Dans Tauri : déplacement, mémorisation de position, fenêtre compacte et premier plan.
- SQLite natif via Rust : migration versionnée, préférences, cache, historique des prévisions originales sur 30 jours et suppression des données. Le navigateur utilise localStorage pour la prévisualisation.

## Tests

```powershell
npm test
npm run build
npx playwright install chromium
npm run test:ui
cargo test --manifest-path src-tauri/Cargo.toml
```

Le dernier nécessite les prérequis natifs. Les tests couvrent les valeurs absentes, villes homonymes, annulations et résultats tardifs, favoris inactifs, déduplication, cache et backoff, reprise après veille, fuseaux et changement d’heure, fusion de modèles, épisodes de pluie et migration SQL. Les parcours Playwright vérifient la recherche, les favoris, le compact, les thèmes persistants, le radar à la demande, le mobile et l’absence de réseau.

Avec le serveur démarré : `node scripts/measure.mjs` vérifie aussi les API réelles et produit `docs/performance.json` et une capture dans `docs/screenshots`. Ces chiffres concernent Chromium/Vite ; la RAM totale, le CPU et le démarrage du binaire Windows restent à mesurer.

## Documentation et limites

Voir [l’architecture](docs/architecture.md) et [les sources et licences](docs/sources.md).

La phase 1 est implémentée côté interface, services et persistance. Les phases suivantes avancent avec le radar, la détection d’événements et une fusion testable. L’accès direct Météo-France/PIAF, la vigilance, la collecte d’observations indépendantes, l’apprentissage adaptatif, les notifications, le démarrage automatique et l’ancrage à la couche bureau Windows restent à implémenter. L’option « premier plan » n’est pas un ancrage derrière les fenêtres.

Les conditions « actuelles » d’Open-Meteo sont des données de modèles ; elles ne servent pas d’observations indépendantes pour apprendre. La mention « À jour » concerne l’âge de récupération, pas l’heure de production inconnue du modèle. Une prévision horaire n’autorise pas de promesse « pluie dans 12 minutes ».
