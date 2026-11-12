# WeatherGlass

Widget météo pour Windows 11 et Linux avec interface Liquid Glass, ville recherchable, prévisions horaires, échéances de pluie et radar observé. Les API sont réelles. Les données fictives existent uniquement dans les tests.

WeatherGlass V3 est un **seul widget Tauri dépliable** : 320 × 180 au démarrage, puis un centre météo de 1 000 × 790 par défaut. Un clic ouvre le centre ; « Replier » le referme depuis chaque section. La navigation et la sélection du jour restent en mémoire. Le déplacement du compact exige un mouvement de 6 px et ne déclenche pas l’ouverture. Le navigateur prévisualise le même widget ; le binaire Windows fonctionne sans navigateur ni serveur Vite.

Le verre utilise une teinte neutre transparente, des reflets et des contours lumineux. L’opacité initiale est de 18 % et se règle de 0 à 60 %. Les anciennes opacités supérieures à 60 % reviennent à 18 %. Les icônes météo reprennent les nuages cyan et les soleils jaunes de la référence. Windows fournit le flou du bureau avec Acrylic. Sous Linux, la transparence est native et le flou derrière la fenêtre exige un compositeur configuré pour cet effet.

Le widget demande un placement permanent en arrière-plan avec `alwaysOnBottom`, dans ses états compact et déplié. Les anciens modes flottant et hybride migrent vers ce placement bureau. Wallpaper Engine est supposé fonctionner comme fond d’écran intégré au bureau Windows. Sa fenêtre de réglages reste une application ordinaire. Le rendu et l’ordre réels avec Wallpaper Engine restent à valider dans le binaire Windows. Sous X11, le gestionnaire de fenêtres applique la demande de placement inférieur. Sous Wayland, le compositeur peut l’ignorer et nécessiter une règle de fenêtre pour WeatherGlass.

## Essayer maintenant

**Installateur natif :** le point d’entrée **`Installer-WeatherGlass.cmd`** prépare l’installateur NSIS. La compilation locale reste bloquée par Smart App Control : le 12 novembre 2026, `rustc` ne peut pas charger `cssparser_macros-10ffaa6ed2e927c4.dll` (erreur E0463 ; refus confirmé par les événements Code Integrity 3033/3077). Des tentatives précédentes avaient rencontré l’erreur Windows 4551 sur des outils Rust. **Aucun `WeatherGlass-Setup.exe` V3 n’a été produit.** Les protections Windows n’ont pas été modifiées ; le contrôleur natif n’a donc pas encore été compilé ni testé sur un bureau réel.

La compilation et le projet restent locaux, conformément au choix utilisateur. Aucun dépôt distant ni envoi de code n'est nécessaire à l'utilisation finale du widget. Le blocage de la chaîne de compilation locale doit être résolu dans l'environnement Windows avant de pouvoir tester et livrer le binaire natif.

Le `.cmd` utilise `release\WeatherGlass-Setup.exe` s'il existe. Sinon, il détecte Node.js portable dans `.tools`, prépare les dépendances, compile l'application et ouvre l'assistant d'installation. Il ne modifie pas la politique PowerShell globale ni le PATH permanent. Une fois installée, l'application native ne nécessite ni npm, ni Rust, ni serveur Vite ; WebView2 est pris en charge par l'installateur.

Avant `npm ci`, le script arrête les prévisualisations Vite dont la commande pointe vers `node_modules` de ce projet : cela libère le module natif Rollup et évite l’erreur Windows `EPERM / unlink` pendant la réinstallation. Les autres processus Node ne sont pas arrêtés. Si un autre outil du projet (par exemple Vitest) conserve le fichier ouvert, le message demande de fermer cette session avant de relancer. Vérification du 12 novembre 2026 : réinstallation des 113 paquets et compilation frontend réussies ; la compilation Rust release atteint ensuite un blocage distinct, erreur Windows 4551 sur l’outil de compilation de `typeid`.

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

Cliquer sur le compact, puis sur Bordeaux pour rechercher une ville. Les homonymes sont distingués par région et pays. L’étoile ajoute un favori sans récupérer sa météo. Les réglages sont dans la section Paramètres. Aucune clé payante ni localisation automatique ne sont nécessaires.

Captures navigateur avec les API réelles : [compact](docs/screenshots/live-compact.png) · [centre météo](docs/screenshots/live-desktop.png) · [semaine](docs/screenshots/live-week.png) · [radar de Bordeaux](docs/screenshots/live-radar.png). Elles ne prouvent pas le rendu du compositeur Windows.

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

L'installateur prévu cible Windows x64 et n'est pas signé numériquement. Le journal `Microsoft-Windows-CodeIntegrity/Operational` confirme le blocage local d'un outil Rust par la stratégie de contrôle d'applications ; le registre indique Smart App Control actif. Aucun certificat de signature de code disponible avec clé privée n'a été trouvé dans le magasin personnel du compte courant. Une compilation sur un runner Windows autorisé peut produire le fichier, mais son exécution sur un PC protégé peut également nécessiter une signature reconnue. L'effet Acrylic et le fonctionnement complet sur le bureau restent à vérifier dans l'application installée.

## Installation Linux

Depuis les sources, installer Node.js 24 LTS, Rust stable et les dépendances natives. Pour Ubuntu 22.04 et versions suivantes ou Debian 12 et versions suivantes, utiliser les prérequis [officiels Tauri](https://v2.tauri.app/start/prerequisites/#linux).

```bash
sudo apt-get update
sudo apt-get install -y libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libayatana-appindicator3-dev librsvg2-dev patchelf pkg-config
bash Installer-WeatherGlass.sh
```

Le script compile les paquets Debian et AppImage, les copie dans `release/WeatherGlass.deb` et `release/WeatherGlass.AppImage`, puis installe le paquet Debian avec apt sur les distributions compatibles. Sur les autres distributions, il installe l’AppImage dans le dossier de données utilisateur et crée une entrée dans le menu des applications. L’exécution de l’AppImage nécessite FUSE 2, fourni par `libfuse2` sur Ubuntu 22.04 ou `libfuse2t64` sur Ubuntu 24.04. Les distributions autres que Debian/Ubuntu doivent fournir les dépendances natives équivalentes pour compiler.

```bash
bash Installer-WeatherGlass.sh --build-only --rebuild
```

`--build-only` produit les deux paquets. `--rebuild` force leur reconstruction. Les paquets déjà présents dans `release/` sont réutilisés par défaut. Pour installer un paquet Debian déjà compilé, exécuter `sudo apt install ./release/WeatherGlass.deb`. Le workflow `.github/workflows/linux.yml` construit les paquets sur Ubuntu 22.04 et expose l’artefact `WeatherGlass-Linux` lorsqu’il est exécuté dans un dépôt GitHub. Aucune publication distante n’a été effectuée.

La compilation et l’installation Linux restent à vérifier sur Linux. Cette machine Windows ne dispose pas de WSL installé. Sous Wayland, le positionnement absolu et le placement inférieur dépendent du compositeur. Une session X11 permet la validation des demandes de placement utilisées ici.

## Fonctionnalités livrées

- React 19, TypeScript, Vite, Zustand ; polices embarquées, icônes SVG et animations discrètes avec respect du mouvement réduit.
- Conditions courantes, journée locale complète et prévisions horaires jusqu’à 10 jours selon les sources. Température, ressenti, pluie avec axe distinct, vent, humidité et nébulosité ; curseur commun aux détails. Les données manquantes restent « — » et les trous ne sont pas reliés.
- Début/fin de pluie estimés sur des créneaux horaires, hystérésis et confirmation de deux intervalles secs ; éclaircies dépendant des nuages et du jour.
- Recherche Open-Meteo/GeoNames, favoris persistants, changement de ville et annulation des requêtes inutiles.
- Ordonnanceur météo partagé, déduplication par ville, cache TTL, reprise au retour réseau/au focus/après veille et backoff exponentiel. Aucun préchargement des favoris.
- Radar Leaflet chargé à l’ouverture : observations historiques RainViewer, lecture/pause, curseur, zoom/déplacement, légende, attribution et gestion des erreurs.
- Sources sélectionnables : **Météo-France Seamless, ECMWF IFS 0.25° et ICON Seamless**, distribuées par Open-Meteo. Sans sélection : Best Match. Ce choix automatique n’est jamais additionné aux modèles nommés.
- Cartes journalières avec min/max, cumul et probabilité ; journée détaillée, périodes d’éclaircie, vue continue, zoom, défilement et sélection d’un intervalle de dates, sans requête au changement de jour.
- Contrôleur compact/expanding/expanded/collapsing sérialisé. Côté Rust : animation amortie de 320 ms, dimensions physiques, DPI, limites de l’espace utile, retour à la position compacte et stockage SQLite. Horloge Rust unique ; seuls le navigateur de développement et le radar ouvert utilisent leurs propres mécanismes de réveil.
- Thèmes, opacité, flou CSS, accent, tailles et fréquence. Réglages natifs pour l’écran et le coin, le démarrage avec la session et les notifications facultatives de la ville active. Le placement inférieur est activé dès la création de la fenêtre et maintenu pendant les transitions.
- SQLite : historique original avec rétention 7/30/90 jours, observations importées, scores par modèle/horizon, poids appris, métadonnées radar et position. L’apprentissage exige des observations indépendantes importées ; il n’invente aucun échantillon et n’ajuste les poids qu’après 30 comparaisons par variable et horizon. Le navigateur utilise localStorage.

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

La validation native reste bloquée : fluidité réelle de l’Acrylic/Wallpaper Engine, absence de clignotement, déplacement, restauration de position, multi-écrans, DPI, mise en veille, démarrage Windows et notifications nécessitent encore un binaire compilé et des essais Windows 11. Les tests du pont natif Playwright enregistrent les commandes ; ils ne reproduisent pas le compositeur ou la géométrie des moniteurs.

Les accès directs Météo-France/PIAF, la vigilance et la collecte automatique d’observations indépendantes ne sont pas branchés. La source Météo-France disponible ici est sa redistribution Open-Meteo. Le placement inférieur conserve une fenêtre de premier niveau. « Afficher le Bureau » peut donc masquer le widget. Les notifications s’arrêtent à la fermeture de l’application.

Pour l’apprentissage, Paramètres accepte un tableau JSON d’observations horaires de la ville affichée. Chaque entrée comporte `kind: "observation"`, `cityId`, `source`, `validAt` (ISO avec fuseau), `temperatureC` et/ou `precipitationMm` (autre valeur à `null`), `intervalMinutes: 60`. La provenance et l’indépendance des mesures importées restent à la charge de l’importateur. Sans mesures appropriées, les poids restent initiaux. Les erreurs de température et de pluie sont évaluées séparément ; elles ne calibrent pas une probabilité de confiance globale.

Les conditions « actuelles » d’Open-Meteo sont des données de modèles ; elles ne servent pas d’observations indépendantes pour apprendre. La mention « À jour » concerne l’âge de récupération, pas l’heure de production inconnue du modèle. Une prévision horaire n’autorise pas de promesse « pluie dans 12 minutes ».
