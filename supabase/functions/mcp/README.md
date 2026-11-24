> **Adresse à utiliser dans Claude / ChatGPT : `https://quiz.revolia.be/mcp`** (relais Cloudflare Pages, `functions/_middleware.js`, vers l'adresse Supabase ci-dessous, qui reste utilisable).

# mcp

Serveur MCP distant de REVOLia Live (Edge Function Supabase). Il permet à Claude ou ChatGPT (connecteur personnalisé) de créer et gérer les quiz d'un formateur, et de relire les résultats agrégés de ses sessions.

- URL publique : `https://igwnzxyraxxyaprdkkvu.supabase.co/functions/v1/mcp`
- Transport : « Streamable HTTP », mode sans état (une instance par requête, réponses JSON).
- Bibliothèque : SDK officiel `@modelcontextprotocol/sdk` 1.32.2 (version figée) + `zod` 3.25.76.
- Photos : codecs `@jsquash/jpeg` 1.6.0, `@jsquash/png` 3.1.1, `@jsquash/webp` 1.5.0 (WebAssembly, versions figées).
- Fichiers : `index.ts` (serveur, authentification, outils), `validation.ts` (règles de validation, identiques aux contraintes SQL), `photos.ts` (téléchargement sécurisé, contrôle et réduction des photos).

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
| `ajouter_photo_question` | Photo de la question (remplace l'ancienne) |
| `retirer_photo_question` | Retire la photo de la question |
| `definir_photos_propositions` | Une photo par proposition (QCM / QCM multiple, toutes ou aucune), légendes facultatives |
| `retirer_photos_propositions` | Retire les photos des propositions |
| `lister_mes_sessions` | Sessions du formateur (état, nb de participants) |
| `resultats_session` | Résultats agrégés par question (via `resultats_question`) + chiffres globaux (via `etat_session`, qui vérifie que tu animes la session ; sans pseudos) |

Il n'existe **aucun outil pour supprimer un quiz** ni pour lancer une session.

Format d'une question : `{ type, enonce, choix?, bonnes_reponses?, annoncer_nombre?, libelle_min?, libelle_max?, duree_secondes?, explication? }`. `bonnes_reponses` = indices en base 0 (exactement 1 pour `qcm`, au moins 2 et pas toutes pour `qcm_multiple`). Propositions limitées à 100 caractères (confort d'affichage ; la base n'impose pas cette limite).

## Photos

L'IA crée d'abord le quiz, puis ajoute les photos question par question. `source` = **exactement un** de `{ url: "https://…" }` ou `{ base64: "…", type_mime: "image/jpeg" | "image/png" | "image/webp" }`. Rappel donné à l'IA : uniquement des images libres de droits ou fournies par le formateur, aucune personne reconnaissable sans son accord.

| Règle | Valeur |
|---|---|
| Entrée par adresse | `https` seulement, 5 Mo maximum (lecture en flux, coupée au-delà), 10 s en tout |
| Entrée base64 | 1,5 Mo décodés par photo, 6 Mo au total par appel |
| Formats | JPEG, PNG, WebP, **vérifiés sur les octets** (le type annoncé doit correspondre) ; GIF, SVG, HEIC, PDF refusés |
| Taille d'origine | 16 millions de pixels au plus (lu dans l'en-tête avant de décoder) |
| Photo de question | 1280 px de plus grand côté, 250 Ko au plus |
| Photo de proposition | 640 px de plus grand côté, 80 Ko au plus |
| Sortie | WebP (transparence conservée), qualité 0,75 puis 0,65, 0,55, 0,5 ; encore trop lourd après 0,5 → refus avec un message clair. Repli en JPEG (fond blanc) si le codec WebP échoue |
| Orientation EXIF | lue dans les JPEG et appliquée (les 8 cas) |
| Légendes | 200 caractères maximum, remplacent le texte des propositions |

Écriture : la photo est déposée dans le bucket `quiz-images` à `<id du formateur>/<uuid>.<ext>` **avec le jeton de l'utilisateur** (politiques de stockage, jamais `service_role`), puis la question est mise à jour (RLS). Si la mise à jour échoue, le fichier envoyé est supprimé. Pour plusieurs propositions, tout est préparé avant d'écrire : une photo refusée n'enregistre rien. La base ne garde que le chemin.

Ancienne photo remplacée ou retirée : supprimée du stockage seulement si elle est dans le dossier du formateur **et** qu'aucune question ni aucune session déjà lancée ne l'utilise encore (les sessions gardent une copie du chemin) ; au moindre doute, elle est conservée.

**Sécurité du téléchargement (anti-SSRF)** : adresses `https` seulement, sans identifiant, port 443 uniquement ; refus de `localhost`, des adresses IP (IPv4 sous toutes ses écritures, IPv6), des noms en `.local` / `.internal` et des noms sans point ; `redirect: 'manual'`, 3 redirections au plus, chacune revalidée avec les mêmes règles ; le nom de domaine est aussi résolu en DNS et refusé s'il pointe vers une adresse privée ou réservée (au mieux : si la résolution DNS n'est pas permise dans l'environnement, les règles de nom restent seules).

**Limites** : une résolution DNS différente entre le contrôle et le téléchargement (« DNS rebinding ») n'est pas exclue à 100 %. Les Edge Functions limitent le temps de calcul : une photo de 16 millions de pixels prend environ une seconde ; pour un QCM de 6 propositions, envoyer des photos déjà petites ou en plusieurs appels. Le HEIC (iPhone) n'est pas accepté : demander un JPEG. Les modules WebAssembly des codecs sont chargés depuis le paquet npm : à vérifier au premier déploiement (une photo de test).

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
