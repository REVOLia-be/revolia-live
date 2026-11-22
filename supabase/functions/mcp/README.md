# mcp

Serveur MCP distant de REVOLia Live (Edge Function Supabase). Il permet à Claude ou ChatGPT (connecteur personnalisé) de créer et gérer les quiz d'un formateur, et de relire les résultats agrégés de ses sessions.

- URL publique : `https://igwnzxyraxxyaprdkkvu.supabase.co/functions/v1/mcp`
- Transport : « Streamable HTTP », mode sans état (une instance par requête, réponses JSON).
- Bibliothèque : SDK officiel `@modelcontextprotocol/sdk` 1.32.2 (version figée) + `zod` 3.25.76.
- Fichiers : `index.ts` (serveur, authentification, outils), `validation.ts` (règles de validation, identiques aux contraintes SQL).

## Déploiement

La fonction fait son authentification elle-même : elle doit être déployée **sans** vérification JWT automatique.

```
supabase functions deploy mcp --no-verify-jwt
```

`SUPABASE_URL` et `SUPABASE_ANON_KEY` sont fournis automatiquement. Aucun secret à ajouter. Aucune clé `service_role` n'est utilisée.

## Configuration OAuth côté Supabase (obligatoire)

1. Tableau de bord Supabase → Authentication → OAuth Server : activer le serveur OAuth 2.1 (inscription dynamique des clients activée : Claude et ChatGPT s'enregistrent tout seuls).
2. Authentication → URL Configuration → **Authorization Path** : chemin de la page de consentement de l'application (celle du front, `https://quiz.revolia.be/...`). Sans elle, la connexion échoue après l'identification.
3. Le formateur se connecte par lien magique, puis autorise l'accès sur cette page.

Métadonnées du serveur d'autorisation : `https://igwnzxyraxxyaprdkkvu.supabase.co/.well-known/oauth-authorization-server/auth/v1`.

## Comment ça marche

- `GET .../mcp/.well-known/oauth-protected-resource` (et la variante suffixée `.../oauth-protected-resource/functions/v1/mcp`) : métadonnées RFC 9728, publiques.
- Toute autre requête MCP sans jeton, ou avec un jeton invalide : `401` + `WWW-Authenticate: Bearer resource_metadata="..."`. Le client découvre alors le serveur d'autorisation tout seul.
- Le jeton est vérifié par `auth.getUser(jeton)`. Les jetons de comptes **anonymes** (participants) sont refusés.
- Les données sont lues et écrites avec le jeton de l'utilisateur : la RLS s'applique. Chaque outil exige en plus un formateur actif (`formateurs.actif`), sinon : « Ce compte n'est pas un formateur actif de REVOLia Live. »
- Les requêtes filtrent explicitement sur `formateur_id = utilisateur` (un admin ne voit ici que ses propres quiz et sessions).

## Outils

| Outil | Rôle |
|---|---|
| `lister_mes_quiz` | Mes quiz : id, titre, nb de questions, types, date, lien d'édition |
| `lire_quiz` | Un quiz complet (questions numérotées, célébrations) |
| `creer_quiz` | Crée quiz + questions en une fois ; tout est validé avant écriture ; annulation du quiz si l'insertion des questions échoue |
| `ajouter_questions` | Ajoute à la fin ou à une position |
| `modifier_question` | Modifie des champs d'une question (par numéro ou id) |
| `supprimer_question` | Supprime une question, renumérote (annotation « destructif ») |
| `reordonner_questions` | Nouvel ordre, en une seule requête (contrainte d'unicité différée) |
| `modifier_quiz` | Titre, description, célébrations |
| `lister_mes_sessions` | Sessions du formateur (état, nb de participants) |
| `resultats_session` | Résultats agrégés par question (via `resultats_question`) + chiffres globaux (via `etat_session`, qui vérifie que tu animes la session ; sans pseudos) |

Il n'existe **aucun outil pour supprimer un quiz** ni pour lancer une session. Les photos ne sont pas gérées : l'IA crée le quiz, le formateur ajoute les photos dans l'éditeur.

Format d'une question : `{ type, enonce, choix?, bonnes_reponses?, annoncer_nombre?, libelle_min?, libelle_max?, duree_secondes?, explication? }`. `bonnes_reponses` = indices en base 0 (exactement 1 pour `qcm`, au moins 2 et pas toutes pour `qcm_multiple`). Propositions limitées à 100 caractères (confort d'affichage ; la base n'impose pas cette limite).

## Confidentialité

`resultats_session` ne renvoie jamais de pseudo : la liste `mentions` du bilan est écartée (liste blanche des champs globaux), les réponses ouvertes sont des textes sans auteur.

## Ajouter le connecteur

- **Claude** (claude.ai ou application) : Paramètres → Connecteurs → Ajouter un connecteur personnalisé → coller l'URL publique ci-dessus → se connecter avec son compte formateur et autoriser.
- **ChatGPT** : Paramètres → Applications / Connecteurs → mode développeur → créer un connecteur MCP → URL ci-dessus, authentification OAuth → se connecter et autoriser. (Le libellé exact des menus change selon l'offre ChatGPT.)

## Tester en local

```
SUPABASE_URL=... SUPABASE_ANON_KEY=... deno run -A index.ts
```
Dans ce dépôt (qui contient un `package.json`), ajouter `--node-modules-dir=none` à `deno run` / `deno check`.
