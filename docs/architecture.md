# Architecture et décisions

## Répartition

`src/components` affiche les données ; `src/store.ts` conserve les préférences ; `src/weather/providers.ts` collecte et normalise ; `fusion.ts` combine les variables ; `events.ts` en déduit les événements ; `scheduler.ts` gère les consommateurs actifs. `src/services/storage.ts` sélectionne SQLite natif ou localStorage dans le navigateur.

Le backend Rust (`src-tauri`) possède la connexion SQLite, les migrations et les commandes paramétrées. Le plugin HTTP Tauri exécute les requêtes via Rust et respecte AbortSignal. Ses permissions limitent les accès aux trois API publiques utilisées. Les tuiles cartographiques passent par WebView2 et la politique CSP. Aucune clé API, aucun serveur métier et aucun composant Python.

**Adaptation au plan initial :** l’ordonnanceur et les calculs météo partagent une implémentation TypeScript entre Tauri et le navigateur. Cela permet de tester les règles critiques sans Rust installé et évite deux moteurs divergents. Rust assure les entrées/sorties natives. Cette version n’exécute pas de surveillance lorsque l’application est fermée.

## Cycle d’une ville

Un abonnement est créé pour la ville affichée après hydratation des préférences. Chaque ville possède un ensemble de consommateurs, un dernier accès, un état, un appel en vol et un backoff. Une seule minuterie à 30 secondes vérifie les échéances de toutes les villes actives. Elle disparaît lorsqu’aucun abonnement n’existe. L’affichage de favoris ne crée aucun abonnement. Les appels se mutualisent par identifiant GeoNames ; les requêtes utilisent latitude et longitude.

Au changement de ville, la dernière désinscription annule les requêtes et empêche les résultats tardifs d’être fusionnés ou affichés. Un cache de moins de 10 minutes (15 ou 30 selon réglage) évite l’appel réseau. Au-delà, il reste affiché avec un indicateur d’ancienneté pendant la tentative de mise à jour. Les erreurs espacent les tentatives de 30 secondes à 30 minutes. Le rafraîchissement manuel conserve une limite d’une minute. Au retour de veille, focus et visibilité déclenchent une vérification ; la minuterie reprend aussi après la suspension du système.

Il n’y a aucun abonnement de surveillance ni notification dans cette version. Le champ `monitoringEnabled` de l’ordonnanceur reste désactivé. Il faudra exposer explicitement ce choix avant d’actualiser une ville non affichée.

## Données et précision

Tous les timestamps internes sont UTC, fournis en secondes Unix et convertis en ISO. Le fuseau IANA de la ville sert uniquement à l’affichage. Les valeurs inconnues restent `null`. `issuedAt` reste inconnu : `generationtime_ms` de l’API est un temps de calcul HTTP, pas une date de production. Les requêtes sont limitées à 24 heures ; la timeline et les événements couvrent les 12 prochaines heures. Un événement de demain n’est ainsi pas présenté comme une échéance d’aujourd’hui sans sa date.

Open-Meteo indique les précipitations comme le cumul de l’heure **précédant** la date de validité. La timeline l’indique au survol, et les événements utilisent cet intervalle. Le seuil d’entrée est 0,15 mm/h et le seuil de sortie 0,05 mm/h ; deux intervalles secs consécutifs confirment la fin. Les trous de données ne sont pas remplis. Une éclaircie nécessite une nébulosité de 35 % maximum, une faible pluie et une échéance de jour. Il s’agit d’une heuristique expérimentale, pas d’un nowcast calibré.

La détection ne sépare pas encore toutes les formes de précipitations (neige, grêle). Les messages se réfèrent aux précipitations agrégées et doivent être affinés avant des notifications de pluie hivernale.

## Fusion

Le mode gratuit par défaut utilise le produit Best Match d’Open-Meteo. Le modèle exact de ce produit n’étant pas identifié dans la réponse, il ne participe pas à la fusion avec des modèles nommés. L’option de comparaison demande deux modèles explicites et indépendants : `icon_seamless` et `ecmwf_ifs025`.

Le moteur groupe par date de validité, déduplique par `modelId`, puis normalise les poids séparément pour chaque variable disponible. Il refuse de combiner deux villes et n’interpole pas les dates absentes. Les quatre facteurs (fiabilité, fraîcheur, géographie et horizon) sont configurables dans `WeightFactors`. Ils valent initialement 1 ; faute d’heure d’émission et d’historique observé, aucun bonus artificiel de fraîcheur ou de fiabilité n’est appliqué. Le résultat est identifié comme une fusion et les points originaux sont archivés séparément. Les métriques d’évaluation et l’adaptation des poids ne sont pas encore implémentées.

## Stockage

La base se trouve dans le dossier applicatif local retourné par Tauri : `%LOCALAPPDATA%/fr.weatherglass.desktop/weatherglass.db`. Connexion unique protégée par Mutex, mode WAL, requêtes paramétrées, migration idempotente `001_initial.sql` et `user_version=1`.

Les préférences et le cache JSON sont dans `settings`, les favoris dans `cities`, les prévisions sources originales dans `forecasts`. Ces dernières sont purgées au-delà de 30 jours et le cache persistant est limité à 24 entrées. Les tables `observations`, `rain_events`, `source_performance`, `fusion_weights` et `radar_cache_metadata` préparent les phases suivantes ; elles ne sont pas remplies avec des observations simulées. Les suppressions sont transactionnelles.

## Radar et performances

Le composant et Leaflet sont importés à l’ouverture. La ville affichée centre la carte ; seules les tuiles visibles sont demandées, avec une seule couche radar active. Les métadonnées sont conservées cinq minutes en mémoire et réactualisées à la réouverture. La lecture utilise requestAnimationFrame, adapte sa cadence au nombre de tuiles visibles pour rester sous le quota pendant la lecture automatique, et cesse à la fermeture. Un déplacement rapide ou des manipulations manuelles répétées peuvent toutefois augmenter les appels : un limiteur global de tuiles reste à ajouter avant une diffusion à grande échelle. Aucun téléchargement radar n’a lieu lorsque la carte est fermée. La carte utilise le cache HTTP du navigateur ; une politique LRU disque explicite n’est pas encore implémentée.

RainViewer fournit uniquement le passé, limité au zoom 7. Une tuile vide peut correspondre à une absence de pluie **ou** à une absence de couverture ; le widget ne prétend pas les distinguer sans masque. Les erreurs de tuiles sont signalées. La légende décrit la réflectivité relative, sans inventer une conversion en mm/h.

Les tests Playwright utilisent des fixtures explicitement réservées aux tests. La mesure live de `scripts/measure.mjs` ne les utilise pas. Les performances natives et la fluidité du Mica nécessitent une compilation et une mesure sur Windows 11.
