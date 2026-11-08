# PoE Price Bot

Bot qui surveille les prix de poe.ninja (PoE1, league challenge softcore trade) toutes les 15 minutes via GitHub Actions. Il envoie une alerte Discord quand un item liquide bouge fortement, et un récap des plus grosses hausses et baisses sur 24 h chaque soir à 19 h (heure de Paris).

## Mise en place

1. Crée un repo GitHub **public** et pousses-y le contenu de ce dossier. En public, les minutes GitHub Actions sont illimitées. En privé, le quota gratuit (2 000 min/mois) ne suffit pas pour un run toutes les 15 min : passe alors le cron à `*/30` dans `.github/workflows/price-bot.yml`. Le webhook reste secret dans les deux cas.
2. Dans Discord : Paramètres du salon → Intégrations → Webhooks → Nouveau webhook → Copier l'URL.
3. Dans le repo : Settings → Secrets and variables → Actions → **New repository secret**, nom `DISCORD_WEBHOOK_URL`, valeur = l'URL copiée.
4. Onglet Actions → « PoE price bot » → **Run workflow** pour un premier test. Les logs indiquent la league détectée et le nombre de lignes récupérées.

Les premières alertes arrivent environ une heure après le premier run, le temps d'avoir un historique. Le premier récap complet arrive le lendemain.

## Changement de league

Par défaut (`LEAGUE` vide ou `auto`), le bot prend la league challenge que poe.ninja liste en premier. Il bascule donc tout seul quand poe.ninja ajoute la nouvelle league, remet son historique à zéro et poste un message sur Discord. Pour forcer une league, crée une variable `LEAGUE` (Settings → Secrets and variables → Actions → onglet Variables) avec le nom exact, puis supprime-la pour revenir en automatique.

Les premières heures d'une league sont très volatiles. Si ça spamme, monte temporairement `MIN_LISTINGS` (par ex. 40) ou `SPIKE_PCT` (par ex. 50).

## Réglages (Variables du repo, toutes optionnelles)

| Variable | Défaut | Rôle |
|---|---|---|
| `LEAGUE` | auto | Nom de la league |
| `SPIKE_PCT` | 30 | Variation minimale (%) pour alerter |
| `SPIKE_WINDOW_MIN` | 60 | Fenêtre de comparaison (minutes) |
| `MIN_CHAOS` | 20 | Prix minimum en chaos |
| `MIN_LISTINGS` | 15 | Nombre minimum d'annonces (liquidité) |
| `ALERT_DROPS` | true | Alerter aussi sur les chutes |
| `RECAP_HOUR` | 19 | Heure du récap (Paris) |

Un item déjà signalé n'est pas re-signalé pendant 6 h, sauf s'il a encore bougé de 25 % depuis l'alerte. Les catégories suivies se trouvent dans `src/config.js`.

## En local

```bash
node src/index.js --dry-run   # affiche les messages au lieu de les envoyer
npm test                      # tests de la logique de détection
```

## Limites connues

- Le bot s'appuie sur l'API publique non documentée de poe.ninja (`/api/data/...`). Si poe.ninja la change, le run échoue avec un message explicite dans les logs d'Actions et GitHub t'envoie un mail.
- GitHub peut retarder les crons de quelques minutes en période de charge, et désactive les workflows planifiés d'un repo public après 60 jours sans commit. Il suffit alors de les réactiver dans l'onglet Actions.
