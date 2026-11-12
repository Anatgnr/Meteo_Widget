# Sources, configuration et conditions d’usage

Vérification des documentations officielles : 12 novembre 2026. Revalider les conditions avant toute distribution commerciale.

| Source | Utilisation actuelle | Conditions / limites |
|---|---|---|
| [Open-Meteo Forecast](https://open-meteo.com/en/docs) | Conditions et prévisions horaires par coordonnées ; Best Match par défaut | API gratuite pour usage non commercial, sans clé et sans SLA. Données CC BY 4.0 avec attribution. [Tarifs et quotas](https://open-meteo.com/en/pricing) : plafond gratuit annoncé de 10 000 appels/jour, 5 000/heure et 600/minute ; une requête complexe peut compter plusieurs unités. |
| [Open-Meteo Geocoding](https://open-meteo.com/en/docs/geocoding-api) | Autocomplétion, GeoNames IDs et fuseau IANA | Même distinction usage non commercial/commercial ; attribution Open-Meteo/GeoNames. Aucune météo chargée pendant la recherche. |
| [Modèles via Open-Meteo](https://open-meteo.com/en/docs) | Météo-France Seamless, ICON Seamless et ECMWF IFS 0.25° en option | Une requête par modèle sélectionné et par actualisation de la ville active ; pas de flux national ni de clé. Les horizons disponibles diffèrent et les absences ne sont pas complétées. Une source absente ne bloque pas les autres. |
| [RainViewer Weather Maps](https://www.rainviewer.com/api/weather-maps-api.html) | Historique radar public et tuiles | Usage personnel/éducatif ; attribution visible obligatoire ; disponibilité et couverture non garanties. [Transition 2026](https://www.rainviewer.com/api/transition-faq.html) : plus de nowcast gratuit, Universal Blue, zoom 7, 100 requêtes/IP/minute. Aucun téléchargement national ni préchargement de séquences entières. |
| [OpenStreetMap](https://operations.osmfoundation.org/policies/tiles/) | Fond de carte Leaflet | Attribution affichée ; pas de préchargement ni téléchargement hors ligne. Pour une diffusion importante, choisir un fournisseur adapté plutôt que le serveur public. |

Les limitations actuelles de RainViewer ont priorité sur les exemples plus anciens qui mentionnent des images futures. La carte exploite uniquement `radar.past`.

## Configuration sans clé

Les URL autorisées sont explicites dans `providers.ts`, `RadarMap.tsx`, la CSP Tauri et `capabilities/default.json`. Aucune variable d’environnement secrète n’est requise. L’application n’appelle pas de fournisseur optionnel payant.

L’ajout d’un fournisseur se fait par l’interface `WeatherProvider` avec normalisation vers `WeatherSnapshot`. Il faut aussi autoriser son domaine dans les permissions natives et la CSP, vérifier couverture/quotas/licence, et conserver son modèle sous-jacent pour la déduplication. Une clé éventuelle devra être stockée dans le coffre local Windows ou un stockage sécurisé natif et utilisée côté Rust ; le frontend et les logs ne doivent pas la contenir.

Les accès directs Météo-France (PIAF, radar, AROME, vigilance) ne sont pas branchés. Aucun jeton ni droit d’accès n’est supposé. Le [produit Météo-France redistribué par Open-Meteo](https://open-meteo.com/en/docs/meteofrance-api) est distinct d’un accès direct PIAF. La connexion à Google Weather, Tomorrow.io, OpenWeather, WeatherAPI, MET Norway, DWD direct et NOAA/NWS reste désactivée et non implémentée ; aucun adaptateur fictif n’est présenté comme opérationnel.

## Attribution et licences applicatives

L’interface crédite Open-Meteo. Les données de localisation proviennent de GeoNames via Open-Meteo ; le radar et le fond de carte affichent leurs attributions sur la carte. Leaflet et Lucide sont distribués selon leurs licences BSD et ISC respectives ; les polices DM Sans et Manrope sont embarquées sous SIL Open Font License. Les licences originales restent présentes dans les paquets npm. Les conditions des API ne sont pas remplacées par celles des bibliothèques.
