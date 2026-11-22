# generer-questions

Fonction Supabase Edge : propose des questions de quiz avec Claude (modèle `claude-sonnet-5-5`). Rien n'est écrit en base ; l'éditeur affiche les propositions et le formateur choisit.

Deux modes :
- **Génération** (défaut) : `{ pdf_base64 | texte, nombre (3..20), types, niveau?, consignes? }`. Exactement une source : un PDF (10 Mo max) ou un texte collé (100 000 caractères max, ex. guide d'étude NotebookLM). Renvoie `{ questions, usage }`.
- **Durcir** : `{ mode: 'durcir', question, niveau_cible }`. Appel texte seul (sans PDF) : même notion, difficulté d'un cran au-dessus. Renvoie `{ question, usage }`.

Niveaux : `decouverte` (notions clés, vocabulaire), `intermediaire` (compréhension, cas concrets), `expert` (nuances, pièges, mises en situation). Chaque question renvoyée porte son `niveau`.

## Explication « Pourquoi ? »
Chaque question renvoyée porte une `explication` (texte, 2 à 3 phrases, 800 caractères maximum, `null` si vide), copiée telle quelle dans `questions.explication` quand le formateur ajoute la proposition. Elle est fidèle au document, bienveillante, et pour un QCM elle explique pourquoi la bonne réponse est juste et ce qui rend les distracteurs trompeurs. Le mode **Durcir** la réécrit avec la question. Elle n'est jamais envoyée aux participants avant la fermeture de la question (c'est la base qui tranche).

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
