# generer-questions

Fonction Supabase Edge : propose des questions de quiz avec Claude (modèle `claude-sonnet-5-5`). Rien n'est écrit en base ; l'éditeur affiche les propositions et le formateur choisit.

Deux modes :
- **Génération** (défaut) : `{ pdf_base64 | texte, nombre (3..20), types, niveau?, consignes? }`. Exactement une source : un PDF (10 Mo max) ou un texte collé (100 000 caractères max, ex. guide d'étude NotebookLM). Renvoie `{ questions, usage }`.
- **Durcir** : `{ mode: 'durcir', question, niveau_cible }`. Appel texte seul (sans PDF) : même notion, difficulté d'un cran au-dessus. Renvoie `{ question, usage }`.

Niveaux : `decouverte` (notions clés, vocabulaire), `intermediaire` (compréhension, cas concrets), `expert` (nuances, pièges, mises en situation). Chaque question renvoyée porte son `niveau`.

## Explication « Pourquoi ? »
Chaque question renvoyée porte une `explication` (texte, 2 à 3 phrases, 800 caractères maximum, `null` si vide), copiée telle quelle dans `questions.explication` quand le formateur ajoute la proposition. Elle est fidèle au document, bienveillante, et pour un QCM elle explique pourquoi la bonne réponse est juste et ce qui rend les distracteurs trompeurs. Le mode **Durcir** la réécrit avec la question. Elle n'est jamais envoyée aux participants avant la fermeture de la question (c'est la base qui tranche).

## Choix multiple à plusieurs bonnes réponses (`qcm_multiple`)
Type proposable en plus de `qcm`, `nuage`, `ouverte`, `echelle`. Schéma : `bonnes_reponses` (tableau d'indices, 0-based) ; convention pour les types non concernés : `bonne_reponse` = -1 sauf pour `qcm`, `bonnes_reponses` = `[]` sauf pour `qcm_multiple`. Consigne : 2 à 3 bonnes réponses parmi 4 à 5 propositions, distracteurs plausibles, explication qui justifie chaque bonne réponse. Revalidation stricte côté serveur (la question est écartée si les indices sont hors bornes, en double, moins de 2, ou si toutes les propositions sont bonnes). La réponse renvoie `bonnes_reponses` (tableau ou `null`) et `annoncer_nombre: true` (l'éditeur le coche par défaut ; le formateur peut le décocher). Le mode **Durcir** garde le type et le nombre de bonnes réponses.

## Règles des distracteurs (QCM)
Elles sont dans la consigne système (`index.ts`) :
- erreurs ou idées reçues réellement fréquentes chez les débutants, adaptées au niveau ;
- même longueur et même forme grammaticale que la bonne réponse ;
- vocabulaire tiré du document ;
- jamais « toutes / aucune de ces réponses » ;
- jamais absurdes ni humoristiques ;
- au niveau expert : distracteurs partiellement vrais.

## Réglages
- Réservée aux formateurs (table `formateurs`).
- **Secret requis** : `ANTHROPIC_API_KEY` (Supabase → Edge Functions → Secrets). `SUPABASE_URL` et `SUPABASE_ANON_KEY` sont fournis automatiquement.
- Déploiement : `supabase functions deploy generer-questions`
