# Architecture WeatherGlass V3

## Audit et conservation de l’existant

Avant V3, React et Tauri affichaient un compact de 660 × 410, une timeline de douze heures et des modales pour le radar et les paramètres. Les services météo, les annulations, la fusion initiale et SQLite étaient réutilisables. Il n’existait ni contrôleur à quatre états, ni semaine détaillée, ni collecte d’observations ou apprentissage effectif. Les tables correspondantes étaient déjà présentes mais vides.

V3 conserve les adaptateurs, le moteur de fusion, la détection avec hystérésis, la recherche GeoNames, Zustand, Leaflet et le stockage existant. Les ajouts concernent le contrôleur, la présentation horaire et hebdomadaire, la géométrie native, l’évaluation sur observations importées et les réglages Windows. La migration SQL initiale reste idempotente ; aucune table historique n’est recréée ou supprimée lors de la mise à jour.

## Un seul widget

`src/widget/controller.ts` sérialise les états `compact`, `expanding`, `expanded`, `collapsing`. Les clics concurrents sont ramenés à la dernière destination demandée. Une erreur du pilote ramène à l’état stable précédent et permet de réessayer. Le contrôleur conserve la ville, la section et les dernières bornes renvoyées par Rust. React conserve le jour, l’intervalle temporel et la sélection horaire pendant le repli.

Le compact est la vue initiale, y compris après restauration des préférences anciennes. Il s’ouvre au clic ou au clavier. Un déplacement dépassant 6 px déclenche `startDragging` et inhibe l’ouverture. L’en-tête étendu sert également de zone de déplacement. Le bouton Replier reste hors de la zone défilante, présent dans toutes les sections. Paramètres et radar sont des sections internes, sans création d’une autre fenêtre native.

Le repli démonte graphiques et radar. Le scheduler et son abonnement météo restent montés : aucun rafraîchissement ou calcul hebdomadaire n’est déclenché par la transition. Le navigateur utilise le même widget, avec une animation CSS pour la prévisualisation ; seule la version native change une fenêtre Windows.

## Géométrie native et premier plan

`src-tauri/src/widget.rs` fournit `widget_transition`, `widget_screens`, `widget_place`. Les tailles demandées sont validées à la frontière IPC. `geometry.rs` convertit les dimensions logiques selon le DPI et contraint les bornes à l’espace utile du moniteur. Les coordonnées négatives des écrans secondaires sont acceptées. Un écran déconnecté conduit au repli sur un moniteur disponible.

La transition native s’exécute dans un travail bloquant séparé du thread UI, avec une courbe amortie bornée sur 320 ms. Les appels de géométrie ne sont jamais exécutés sous le verrou du widget, pour éviter un blocage avec les événements Windows. La position compacte est mémorisée avant le déploiement et restaurée au repli. Les mouvements du compact mettent à jour cet ancrage. Il est enregistré dans la clé SQLite `widget-bounds` lors des transitions et de la fermeture normale. Une interruption brutale peut perdre le dernier déplacement non encore enregistré.

La fenêtre est initialement cachée pour éviter l’affichage à une ancienne taille ; Rust l’affiche après placement. Si la transition échoue, le frontend tente de l’afficher avec un message d’erreur. Un changement de facteur DPI déclenche une nouvelle configuration. L’animation est désactivée si le système demande de réduire les mouvements.

Le placement permanent inférieur utilise `alwaysOnBottom` dès la création de la fenêtre, puis `set_always_on_top(false)` et `set_always_on_bottom(true)` pendant les transitions. Le déploiement laisse le focus natif inchangé. Les anciennes préférences flottant/hybride migrent vers le mode bureau. Wallpaper Engine est supposé intégré au fond du bureau. Sous Linux, Tao transmet la demande à GTK avec `set_keep_below`. Le gestionnaire de fenêtres et le compositeur déterminent son application, en particulier sous Wayland. « Afficher le Bureau » peut masquer cette fenêtre de premier niveau. Le placement explicite sur un écran et dans un coin est accessible dans Paramètres. Les essais matériels restent à effectuer.

## Transparence

La fenêtre et les racines HTML restent transparentes sous tous les thèmes. Le matériau Windows utilise Acrylic avec une teinte neutre translucide. L’interface ajoute des reflets, une bordure lumineuse et une opacité initiale de 18 %, réglable entre 0 et 60 %. Les cartes internes utilisent une fraction de cette opacité pour limiter l’accumulation des couches. Sous Linux, le flou du bureau exige un effet fourni par le compositeur. Les icônes météo vectorielles partagent les contours cyan et les soleils jaunes de la référence. Les tests navigateur vérifient les racines transparentes, les couleurs et les préférences migrées. Le compositeur et Wallpaper Engine nécessitent des essais natifs. [Documentation Acrylic](https://learn.microsoft.com/en-us/windows/apps/design/style/acrylic).

## Données et graphiques

`providers.ts` demande dix jours et un jour passé en timestamps Unix, puis conserve les heures en UTC et le fuseau IANA de la ville. Les conditions courantes Open-Meteo sont des modèles, pas des observations indépendantes. `issuedAt` reste inconnu ; l’âge affiché est celui de la récupération. Les sources nommées sont Météo-France Seamless, ECMWF IFS 0.25° et ICON Seamless, redistribuées par Open-Meteo. Leurs horizons diffèrent : les heures sans données restent nulles.

`series.ts` regroupe les jours dans le fuseau de la ville, y compris les journées de 23/25 heures. La pluie d’une heure appartient à l’intervalle précédant son timestamp ; un cumul finissant à minuit est donc affecté au jour précédent. Les cumuls partiels sont signalés. `ForecastChart.tsx` trace des segments linéaires entre échantillons contigus, sans relier les trous. Les axes température/vent/humidité/nuages et pluie sont distincts. Certains modèles sont déjà interpolés à l’heure par le fournisseur : l’application n’ajoute pas d’échantillons.

Le survol ou le clavier fixe un timestamp commun au graphique et aux détails : température, ressenti, pluie, probabilité, vent, humidité et nuages. Les points passés sont identifiés comme des données de modèle passées, pas des observations. La semaine offre cartes journalières, détails horaires, éclaircies possibles, changements de conditions et vue continue avec défilement, zoom et intervalle de dates. Changer de jour n’émet pas de requête météo.

## Ville active, cache et horloge

Un abonnement est créé pour la ville affichée après hydratation. Les favoris inactifs ne s’abonnent pas, n’émettent aucune requête et ne font l’objet d’aucune évaluation. Un changement de ville annule les requêtes abandonnées et ignore leurs résultats tardifs. Les appels simultanés sont mutualisés. Le cache TTL est de 10/15/30 minutes, le rafraîchissement manuel respecte un plancher d’une minute et les erreurs déclenchent un backoff de 30 secondes à 30 minutes. Le cache périmé reste affiché hors ligne avec avertissement.

En natif, Rust émet l’unique événement `weather-tick` toutes les 30 secondes. Le scheduler TypeScript vérifie alors les échéances et garde les adaptateurs partagés avec le navigateur. **Adaptation au cahier des charges :** l’horloge est native, mais l’ordonnancement des requêtes et la fusion restent en TypeScript ; ils n’ont pas été dupliqués intégralement en Rust. Le navigateur possède une seule minuterie de même cadence. Focus, retour réseau et visibilité provoquent également une vérification, ce qui couvre la reprise après suspension côté interface. Les mesures CPU système et les essais de veille Windows restent à faire.

Le cache mémoire des villes est borné à douze inactives, le cache SQLite météo à vingt-quatre entrées. La connexion SQLite unique est protégée par mutex ; WAL, foreign keys et busy timeout sont activés. La rétention des prévisions et observations archivées est réglable à 7/30/90 jours. Le navigateur utilise localStorage et peut rencontrer sa limite de quota ; l’erreur ne supprime pas la météo affichée.

## Fusion et apprentissage

Best Match n’est utilisé que sans modèles nommés. La fusion regroupe par validité, déduplique par identifiant de modèle, normalise séparément les variables et ne remplace pas une absence par zéro. Les facteurs initiaux fiabilité/fraîcheur/géographie/horizon restent égaux faute de métadonnées justifiant un bonus. L’heure de récupération ne remplace pas l’heure d’émission du modèle.

`learning.ts` archive les prévisions nommées et compare une seule prévision par modèle, validité et tranche d’horizon à une observation indépendante importée de la même ville et du même instant. Les tranches sont 0–1 h, 1–3 h, 3–24 h, 1–3 jours et au-delà. Les données de modèle courantes, Best Match, les observations futures et les cumuls de durée incompatible ne servent pas à apprendre. L’importateur reste responsable de la provenance réelle de ses mesures.

Les erreurs absolues température/pluie et leurs nombres d’échantillons sont conservés séparément. Avant trente comparaisons par variable et horizon, le poids vaut 1. Ensuite, il décroît avec l’erreur moyenne et reste borné à 0,2. Les autres variables ne réutilisent pas abusivement un score de température. Aucun pourcentage de confiance calibré n’est affiché. Les archives de calcul sont bornées à 3 000 prévisions et 3 000 clés évaluées par ville ; les prévisions en attente antérieures à sept jours sont éliminées. Les tables SQLite `observations`, `source_performance` et `fusion_weights` conservent les mesures, les métriques et le poids température ; l’état JSON conserve aussi le score pluie. La collecte automatique d’observations indépendantes n’est pas branchée.

## Pluie et notifications

La détection conserve les seuils 0,15 mm/h à l’entrée et 0,05 à la sortie, exige deux intervalles secs avant d’annoncer la fin, distingue une éclaircie par les nuages et le jour, et reconnaît reprises intermittentes et intensification. Les trous de données ne deviennent pas des périodes sèches. Avec les données horaires disponibles, les échéances sont des intervalles approximatifs. La neige/grêle peut être incluse dans les précipitations agrégées.

Les plugins officiels Tauri gèrent le démarrage Windows et les notifications, activés uniquement par les réglages de l’utilisateur. Les notifications concernent la ville affichée et une transition start/end proche, avec un délai minimal d’une heure persistant par ville ; aucune notification n’est envoyée à partir d’un cache périmé. Elles cessent lorsque l’application est fermée. Leurs effets Windows restent non validés faute de binaire.

## Radar

Leaflet et ses tuiles ne sont chargés que dans le module visible : aperçu activé explicitement dans Aujourd’hui ou section Radar. La miniature utilise la dernière image. Le module complet propose lecture/pause, sélection horaire, zoom, déplacement et légende. Seul `radar.past` de RainViewer est exploité ; aucune extrapolation n’est présentée comme une observation.

Les métadonnées validées sont conservées cinq minutes en mémoire et dans le stockage local/SQLite. Chaque carte possède une seule couche radar active ; les tuiles utilisent le cache HTTP, sans téléchargement national. La lecture adapte sa cadence au nombre de tuiles visibles et cesse au démontage/repli. Une manipulation manuelle rapide peut encore augmenter les requêtes : un limiteur global strict de tuiles reste à ajouter avant une diffusion importante. Les URL et chemins de tuiles sont validés, les échecs sont signalés et une zone vide ne garantit pas une absence de pluie.

## Validation

Voir [le bilan V3](v3-validation.md), [les sources](sources.md) et `performance.json`. Les fixtures sont exclusivement réservées aux tests. `scripts/measure.mjs` utilise les API réelles. Les mesures navigateur n’établissent ni la RAM totale ni le CPU ni la fluidité de l’application native.
