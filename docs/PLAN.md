# REVOLia Live — plan V1

## Décisions validées avec JF

- 100 % coopératif : jauge collective, mentions individuelles, bilan de salle. **Aucun classement, jamais.**
- Mode « par table » optionnel : le participant choisit sa table en rejoignant. Les tables contribuent à la jauge commune, elles ne sont jamais comparées.
- Vite + React + TS + Tailwind, hébergé sur Cloudflare Pages ; Supabase (Frankfurt).
- Données supprimées après 90 jours (réglable par session).

## Étapes

| # | Étape | Statut |
|---|---|---|
| 1 | Schéma SQL, RLS, fonctions serveur, tests SQL | ✅ |
| 2 | Squelette de l'application, thème, pages vides | ✅ |
| 3 | Un QCM de bout en bout (rejoindre → répondre → résultats), testé en vrai par JF | ✅ |
| 4 | Nuage de mots, question ouverte, échelle, jauge, mentions, bilan | ✅ (à tester en vrai) |
| 5 | Création et édition de quiz | ✅ (à tester en vrai) |
| 5b | Proposer des questions à partir d'un PDF (fonction Supabase + API Claude) | |
| 6 | Export CSV, quiz d'exemple, README | |
| 7 | Script de test de charge (100 téléphones simulés) | |

## Cycle de vie d'une session

```
attente ──ouvrir_question──▶ question ──fermer_question──▶ resultats ──ouvrir_question──▶ question …
                                                              │
                                                    passer_au_bilan ──▶ bilan ──terminer_session──▶ terminee
```

Le présentateur appelle `fermer_question` quand le compte à rebours arrive à zéro (ou plus tôt, sur clic du formateur).

## Contrat avec la base (fonctions RPC)

Toutes renvoient du JSON. En cas d'erreur, `error.message` est une phrase en français prête à afficher.

### Participant (connecté en anonyme via `supabase.auth.signInAnonymously()`)

| Fonction | Rôle |
|---|---|
| `infos_session(p_code)` | Avant de rejoindre : titre, mode_tables, liste des tables. |
| `rejoindre_session(p_code, p_pseudo, p_table_id?)` | Inscrit ou réinscrit (même téléphone = même participant). |
| `etat_session(p_session)` | **État complet** : etat, question courante (sans solution), `maintenant` (heure serveur), `a_repondu`, jauge, `resultats` si etat = resultats, `bilan` si etat = bilan. |
| `repondre(p_question, p_valeur)` | `p_valeur` : indice 0-based (qcm), 1 à 5 (echelle), texte (nuage ≤ 30, ouverte ≤ 280). |

### Formateur (connecté par lien magique, présent dans la table `formateurs`)

`lancer_session(p_quiz, p_mode_tables, p_noms_tables)`, `ouvrir_question(p_session, p_question?)`, `fermer_question`, `passer_au_bilan`, `terminer_session`, `basculer_coup_de_coeur(p_reponse)`, `masquer_reponse(p_reponse, p_masquee)`, `exclure_participant(p_participant)`, `export_session(p_session)`.
Le formateur lit et écrit directement les tables `quiz` et `questions` (protégées par RLS).

## Temps réel et reconnexion

- Téléphones : abonnement `postgres_changes` sur la ligne `sessions` (filtre `id=eq.<session>`). À **chaque** événement, rappeler `etat_session` (ne jamais reconstruire l'état à partir de l'événement).
- Présentateur : abonnements sur `sessions`, `participants` et `reponses` (filtre `session_id=eq.<session>`) pour les compteurs en direct.
- Reconnexion : au retour du réseau (`online`), au retour au premier plan (`visibilitychange`) et à la reprise du canal, rappeler `etat_session`. Filet de sécurité : rappel toutes les 10 s si aucun événement reçu.
- Horloge : `decalage = Date.parse(etat.maintenant) - Date.now()` ; temps restant = `fin_reponses_le - (Date.now() + decalage)`.

## Jauge collective

1 point par réponse, +1 par bonne réponse à un QCM. Maximum = participants × somme des poids des questions (2 par QCM, 1 sinon). Paliers par défaut à 40 %, 65 %, 85 %.

## Mentions (calculées au passage au bilan)

- `a_repondu_a_tout` : a répondu à toutes les questions posées.
- `plus_belle_progression` : plus forte hausse du taux de réussite QCM entre la 1re et la 2e moitié (au moins 4 QCM posés, hausse > 0).
- `coup_de_coeur` : choisie par le formateur sur une réponse ouverte.

## Tests

`bash supabase/tests/lancer_tests.sh` rejoue les migrations sur un Postgres local et vérifie le scénario complet (sécurité comprise).
