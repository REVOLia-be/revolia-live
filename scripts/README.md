# Test de charge

Simule N téléphones participants pendant que tu pilotes l'écran présentateur à la main.

## Lancer un test

1. Lance une session depuis l'écran formateur et note le **code** affiché.
2. Dans le dossier du projet : `node scripts/test-charge.mjs ABCD 100 --etalement=30`
   (code, nombre de téléphones, durée d'arrivée en secondes ; `--sans-reponse` pour tester seulement l'arrivée).
   Les clés sont lues dans `.env.local` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).
3. Pendant l'arrivée, regarde le compteur de participants sur l'écran présentateur.
4. Ouvre des questions comme en vrai (au moins une de chaque type) ; les faux téléphones répondent après 1 à 8 s.
5. Passe au bilan : le script s'arrête seul et affiche le résumé (ou Ctrl+C à tout moment).

## Lire les chiffres

| Mesure | Objectif | Si ce n'est pas bon |
|---|---|---|
| Inscriptions réussies | 100 % | Regarde les erreurs groupées : des « 429 trop de requêtes » signalent les limites d'authentification anonyme de Supabase à relever. |
| Événement temps réel (p95) | < 2 s | Salle trop lente à être prévenue : vérifie les quotas Realtime du projet Supabase. |
| `repondre` (p95) | < 1 s | Base surchargée : vérifie la taille de l'offre Supabase. |
| Canaux en erreur | 0 | Limite de connexions simultanées Realtime atteinte. |

Les « réponses refusées » sont normales si la question s'est fermée avant la réponse d'un faux téléphone.
Les délais utilisent l'horloge de ton ordinateur : garde-la à l'heure (synchro automatique).
Les identités anonymes créées sont purgées automatiquement par la base.
