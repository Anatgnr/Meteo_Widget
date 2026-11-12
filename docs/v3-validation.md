# Bilan de validation V3 — 12 novembre 2026

Le code du widget unique et du contrôleur natif est implémenté. La version Windows installable n’est pas validée ni produite : la chaîne Rust locale est bloquée avant la compilation du code applicatif. Ce bilan ne constitue donc pas une recette native complète.

## Vérifications exécutées

| Vérification | Résultat |
|---|---|
| `npm run build` | Réussi : TypeScript et production Vite |
| `npm test` | 36 tests réussis, 6 fichiers |
| `npm run test:ui` | 3 scénarios Playwright réussis |
| `git diff --check` | Réussi |
| Formatage Rust | Syntaxe acceptée par rustfmt ; ne vaut pas compilation/typecheck |
| `cargo check --manifest-path src-tauri/Cargo.toml --locked` | Bloqué dans la dépendance `cssparser`, E0463 : DLL `cssparser_macros` refusée par Code Integrity |
| Appels météo réels à Bordeaux | Best Match : 264 températures ; Météo-France : 134 ; ECMWF : 264 ; ICON : 206 sur 264 timestamps demandés. Les valeurs absentes restent nulles. |
| `node scripts/measure.mjs` | Réussi avec météo/radar réels, aucune erreur de page |
| Installation après erreur Rollup `EPERM` | Script corrigé : arrêt du Vite de ce projet, autres processus Node conservés, `npm ci` et compilation frontend réussis. La compilation native release reste bloquée par la stratégie de contrôle des applications sur `typeid` (erreur 4551). |

Mesure Chromium/Vite du compact : 3 321 ms jusqu’à la météo, heap JavaScript 6,38 Mio et occupation du thread principal de 0,01 % sur cinq secondes. Il ne s’agit **pas** du CPU Windows ou de la RAM totale de l’application. Une seule requête météo avant et après déploiement ; zéro appel radar fermé. La semaine affiche dix jours ; le radar réel fournit treize images, seize tuiles chargées et aucun avertissement lors de cet essai. Voir [performance.json](performance.json).

## Couverture du cahier des charges

| Cas | Preuve disponible | Limite |
|---|---|---|
| 1–3. Compact, déploiement, repli | Parcours navigateur et pont natif simulé | Fenêtre réelle non testée |
| 4. Animation sans clignotement | Captures des états, animation CSS et code natif amorti | Compositeur Windows non testé |
| 5–7. Dimensions natives, position, moniteurs/DPI | Commandes IPC vérifiées ; tests Rust de géométrie ajoutés | Tests Rust et essais matériels bloqués |
| 8. Widget accessible | Replier hors du défilement ; clavier ; petit écran vérifié | Le mode bureau est une fenêtre normale, masquable par « Afficher le Bureau » |
| 9–10. Ville, cache, requêtes | Recherche/homonymes/favoris, cache et absence de requête à l’ouverture testés | Cache navigateur et SQLite natif utilisent des implémentations distinctes |
| 11–13. Journée, semaine, sélection | 24 points par journée de test, dix cartes, couches, détails, zoom et sélection temporelle | Les horizons réels varient par modèle |
| 14. Radar démarré/arrêté | Lecture/pause puis démontage et absence de nouvelles tuiles après repli | Requêtes déjà en cours non garanties annulées par le navigateur |
| 15–16. Fusion et villes actives | Pondération, déduplication, valeurs absentes, annulations/résultats tardifs, inactivité testés | Pas de flux direct Météo-France/PIAF |
| 17. Hors ligne | Erreur explicite sans météo inventée ; cache périmé couvert en unitaires | Pas de carte hors ligne préchargée |
| 18. Reprise après veille | Échéances périmées et villes actives testées ; réveils focus/réseau/visibilité | Suspension réelle de Windows non testée |
| 19–20. Navigation unique, repli partout | Sections internes ; repli/réouverture et conservation de navigation ; aucune commande de création de fenêtre | Le pont natif est simulé |
| Clics rapides | Test unitaire du contrôleur avec résolution différée des transitions | Pas de manipulation physique native |
| Transparence | Racines transparentes dans les six combinaisons thème/système ; opacité du verre testée | Acrylic et Wallpaper Engine non validés sur bureau réel |
| Apprentissage | Validation d’observations, indépendance, horizons, déduplication et seuil de trente échantillons testés | Import manuel de mesures ; pas de collecte automatique ni de confiance globale calibrée |
| Démarrage et notifications | Plugins et réglages câblés ; anti-répétition testé | Effets Windows non testés |

## Blocage natif et adaptations

Le journal `Microsoft-Windows-CodeIntegrity/Operational` contient les événements 3033/3077 du 12 novembre 2026 à 15 h 50 (Europe/Paris) : `rustc.exe` tente de charger `src-tauri/target/debug/deps/cssparser_macros-10ffaa6ed2e927c4.dll`, refusée par la politique de signature. Smart App Control a aussi bloqué des outils de compilation avec l’erreur 4551. Les protections n’ont pas été désactivées, aucun code n’a été publié ni envoyé à un service de compilation distant.

Le code Rust ajouté n’a pas été compilé ni exécuté. Ses types, son comportement système et les nouveaux chemins SQLite natifs restent donc à vérifier dans un environnement de compilation autorisé. Il faut ensuite exécuter `cargo test`, produire le binaire et tester placement, restauration, DPI, veille, transparence inactive/active, animations rapides, démarrage et notifications. Aucun résultat navigateur n’est présenté comme la preuve de ces comportements.

Adaptations explicites : le bureau utilise le repli en fenêtre normale permis par la demande ; l’horloge est en Rust, tandis que l’ordonnancement HTTP et la fusion restent partagés en TypeScript. L’apprentissage attend des observations indépendantes importées. Ces choix et les limites des données horaires sont détaillés dans [l’architecture](architecture.md).
