# Ateliers à son rythme — spécification (phase 1)

Validé par JF le 23/11/2026 (maquettes : scratchpad `ateliers/`). Ce document est le **contrat** entre la base et l'interface.

## Principe

Un quiz devient un **déroulé** : la liste ordonnée `questions` peut contenir des **ateliers** (nouveau type `atelier`) entre les questions collectives. Un seul QR code pour la journée. Apprenants anonymes (pseudo), données supprimées avec la session (90 jours).

Quand le formateur ouvre un atelier (`ouvrir_question`), chaque téléphone passe en mode « à son rythme » : il parcourt les étapes, copie des prompts, dépose des rendus, peut signaler « Je suis bloqué ». L'écran projeté ne montre que des **chiffres collectifs** (répartition par étape, nombre ayant terminé) et, si le formateur le décide, **un rendu projeté sans pseudo**. La vue formateur (non projetée) montre les pseudos, les étapes, les bloqués et les rendus. « Terminer l'atelier » = `fermer_question`.

## Données

### `questions` (existante)
- Nouveau type d'énum `type_question` : `atelier` (ajout seul dans sa propre migration).
- Pour `atelier` : `enonce` = titre de l'atelier (1-300), `choix`/`bonne_reponse`/`bonnes_reponses`/`images_choix` NULL ; `duree_secondes` ignoré ; `explication` = consigne générale facultative.
- `poids_max_question('atelier') = 0` : un atelier ne compte pas dans la jauge.

### `etapes_atelier` (nouvelle) — contenu préparé par le formateur
| colonne | type | règle |
|---|---|---|
| id | uuid pk | |
| question_id | uuid → questions (cascade) | la question doit être de type `atelier` |
| ordre | int | unique (question_id, ordre) différé |
| titre | text | 1-120 |
| consigne | text | ≤ 4000, Markdown simple (paragraphes, listes, **gras**, liens) |
| fichiers | jsonb | `[{ "chemin": "<uuid formateur>/<uuid>.<ext>", "nom": "Modèle.docx", "taille": 12345 }]`, ≤ 10 ; ext ∈ pdf, docx, xlsx, pptx, png, jpg, jpeg, webp, txt, csv |
| liens | jsonb | `[{ "url": "https://…", "libelle": "…" }]`, ≤ 10, `https://` uniquement |
| prompts | jsonb | `[{ "titre": "…", "texte": "…" }]`, ≤ 10, texte ≤ 4000 |
| rendu_attendu | boolean | défaut false |

RLS : comme `questions` (propriétaire actif ou admin). Grants select/insert/update/delete à authenticated.

### Copies de session
- `questions_session` : rien de nouveau (le type `atelier` est copié comme les autres).
- `etapes_session` : copie figée des étapes au lancement (`session_id`, `question_id` → questions_session, mêmes colonnes). Lisible par le formateur de la session et par ses participants (le contenu n'est pas secret).

### Suivi (nouvelles tables, écritures UNIQUEMENT via RPC)
- `progression_atelier` : `session_id`, `question_id` (questions_session), `participant_id`, `etape` int (1 = première), `termine` bool, `bloque_depuis` timestamptz null, `en_route` bool, `maj_le` ; unique (question_id, participant_id).
- `rendus_atelier` : `id`, `session_id`, `etape_id` (etapes_session), `participant_id`, `texte` (1-5000), `cree_le`, `maj_le` ; unique (etape_id, participant_id).
- `sessions.rendu_projete_id` uuid null → rendus_atelier (on delete set null).
- RLS select : formateur de la session ; participant : ses propres lignes. Realtime : ajouter `progression_atelier` et `rendus_atelier` à la publication.

### Stockage
Bucket public `atelier-fichiers` (20 Mo max, types : pdf, docx, xlsx, pptx, png, jpeg, webp, plain, csv), dossiers par formateur, mêmes politiques que `quiz-images`. Fonction `chemin_fichier_valide(text)` (format `<uuid>/<uuid>.<ext autorisée>`).

## RPC

### Participant (vérifient `participe_a`, atelier ouvert = question courante de type atelier et `etat = 'question'`)
- `atelier_aller_a(p_question uuid, p_etape int)` : 1 ≤ p_etape ≤ nb_etapes + 1 ; nb_etapes + 1 ⇒ `termine = true` (sinon false). Crée la ligne au besoin.
- `atelier_rendre(p_etape uuid, p_texte text)` : upsert du rendu (étape de l'atelier courant, `rendu_attendu` vrai).
- `atelier_bloque(p_question uuid, p_bloque boolean)` : `bloque_depuis = now()` / null (et `en_route = false` quand on débloque).

### Formateur (vérifient `verifier_animateur`)
- `atelier_suivi(p_session uuid)` → `{ question_id, etapes: [{id, ordre, titre, rendu_attendu}], participants: [{participant_id, pseudo, etape, termine, bloque_depuis, en_route, maj_le}], rendus: [{id, etape_id, participant_id, pseudo, texte, maj_le}] }` pour l'atelier courant.
- `atelier_en_route(p_participant uuid)` et `atelier_resolu(p_participant uuid)` (résolu = `bloque_depuis` null, `en_route` false).
- `projeter_rendu(p_session uuid, p_rendu uuid)` (null pour arrêter) ; le rendu doit appartenir à la session.

### `etat_session` (ajouts quand la question courante est un atelier)
- `question.etapes` : liste ordonnée des étapes de la session (id, ordre, titre, consigne, fichiers, liens, prompts, rendu_attendu).
- `atelier` : `{ repartition: [n par étape 1..N], ont_termine: n, nb_bloques: n }` (chiffres seulement, pour tous).
- `rendu_projete` : `{ texte, etape_titre }` ou null — JAMAIS de pseudo.
- Participant : `ma_progression: { etape, termine, bloque, en_route }`, `mes_rendus: { <etape_id>: texte }`.
- `ouvrir_question` sur un atelier : `fin_reponses_le = null` (pas de compte à rebours ; le présentateur ne ferme jamais automatiquement un atelier). `fermer_question` : met `rendu_projete_id` à null.
- `lancer_session` copie les étapes ; la duplication de quiz côté appli copie les étapes.

## Interface (résumé, voir maquettes)
- Téléphone : barre d'étapes, consigne Markdown rendue sans HTML brut, fichiers (bouton Télécharger + taille), liens, prompts (Copier / Ouvrir dans ChatGPT `https://chatgpt.com/?q=` / Ouvrir dans Claude `https://claude.ai/new?q=`, texte encodé), rendu (zone de texte, enregistrement explicite + indicateur), « Je suis bloqué » / annuler, rappel « Ne colle pas de données réelles de clients » et « Le formateur peut lire ce que tu colles ici. Il ne l'affichera jamais avec ton pseudo. », écran de fin.
- Écran projeté : titre, rappel QR, barres par étape, « Ont terminé : n », rendu projeté éventuel, bouton « Terminer l'atelier » (télécommande : suivant = terminer, avec double pression comme pour arrêter une question).
- Vue formateur : nouvelle page `/presenter/:sessionId/suivi` (lien depuis l'écran présentateur et la modération), bloqués en tête, J'arrive / Résolu, rendus par étape, Projeter / Arrêter.
- Éditeur : « Ajouter un atelier » dans le déroulé ; édition des étapes (titre, consigne, fichiers, liens, prompts, rendu oui/non), réordonner étapes et éléments du déroulé.

## Hors phase 1
Captures d'écran dans les rendus, minuteur par étape, « on attend tout le monde », création d'ateliers via le connecteur MCP, retour automatique par l'IA.
