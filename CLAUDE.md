# REVOLia Live — contexte du projet

Lis ce fichier en entier, puis `docs/PLAN.md`, avant d'écrire du code.

## Le produit

Outil de quiz en direct pour les formations présentielles de REVOLia (débutants en IA : PME, indépendants, assistantes…).
Le formateur projette un **écran présentateur** ; les participants rejoignent sur **smartphone** (QR code ou code court, pseudo, aucun compte).

**L'outil est 100 % coopératif. Il n'y a JAMAIS de classement, de rang, de podium ni de comparaison entre personnes ou entre tables.** C'est une décision pédagogique ferme de JF. Toute la gamification passe par :
- une **jauge collective** que toute la salle remplit ensemble (paliers célébrés) ;
- des **mentions individuelles** positives (« a répondu à tout », « plus belle progression », « réponse coup de cœur ») ;
- un **bilan de salle** final.

Personne ne doit se sentir humilié. Une mauvaise réponse n'est jamais affichée en rouge : on montre la bonne réponse avec un message encourageant.

## Qui décide

JF (formateur, propriétaire du produit). Il n'est pas développeur : explique les choix en français simple, n'ajoute pas de dépendance ou de complexité qu'il ne pourra pas maintenir.

## Stack

| | |
|---|---|
| Front | Vite + React + TypeScript + Tailwind CSS |
| Hébergement | Cloudflare Pages (projet `revolia-quiz-pages`), adresse https://quiz.revolia.be (CNAME chez one.com) |
| Données, temps réel, auth | Supabase, région Frankfurt |
| Formateur | Supabase Auth, lien magique |
| Participants | Supabase **anonymous sign-in** (identité invisible, permet la reconnexion) |
| Langue | Français partout : interface, commentaires, noms de tables et de variables métier |

## Règles d'architecture — ne pas les contourner

1. **Le serveur tranche.** Toute écriture sensible passe par une fonction Postgres (RPC) : `rejoindre_session`, `repondre`, et les fonctions de pilotage du formateur. Le client n'écrit jamais directement dans `reponses` ou `sessions`.
2. **La bonne réponse ne quitte jamais la base avant la fermeture de la question.** Elle vit dans `questions_session.solution`, colonne non lisible par les participants. Les résultats sont obtenus via RPC une fois la question fermée.
3. **Une seule horloge : celle du serveur.** Le compte à rebours se calcule à partir de `sessions.fin_reponses_le` et d'un décalage d'horloge mesuré au chargement.
4. **Reconnexion** : à chaque reconnexion (réseau, retour au premier plan), le client recharge l'état complet via `etat_session` puis se réabonne au temps réel. Ne jamais supposer qu'aucun événement n'a été manqué.
5. **Row Level Security sur toutes les tables.**
6. **Thème** : toutes les couleurs et polices viennent de `src/theme.css` (variables CSS) branchées dans Tailwind. Aucune couleur en dur dans les composants.
7. **RGPD** : aucun service tiers côté navigateur (pas d'analytics, pas de Google Fonts — les polices sont hébergées dans `public/fonts`). Les sessions sont supprimées automatiquement après `retention_jours` (90 par défaut).
8. **V2 anticipée** : `participants.profil_id` (nullable) servira à rattacher un participant à un profil durable. Ne pas le supprimer.

## Charte (manuel de marque Studio Pepper)

| Rôle | Valeur |
|---|---|
| Vert | `#00824d` — boutons, texte blanc dessus |
| Vert foncé | `#004d3d` — texte sur blanc, fonds |
| Vert clair | `#80bf9e` — texte/accent sur fond foncé uniquement, **jamais en fond** |
| Bleu violet | `#030159` — fond de l'écran projeté, texte sur blanc |
| Titres | iBrand Regular (`public/fonts`, licence web OK) → repli : Poppins |
| Texte | Poppins |

Écran projeté : fond bleu violet, texte blanc, accent vert clair. Téléphone : fond blanc, texte vert foncé, gros boutons verts.

## Conventions

- Tutoiement, vocabulaire non technique, messages d'erreur qui disent ce qui s'est passé et quoi faire. Jamais de code d'erreur brut.
- Mobile-first pour l'écran participant : cibles tactiles ≥ 56 px, un seul point focal.
- Aucune clé dans le dépôt : voir `.env.example`.

## Documentation (Notion)

La documentation de référence vit dans Notion, base « REVOLia — Documentation interne », propriété **Application = REVOLia Live** (fiche application, guide formateur, générateur, check-list, comptes et services, décisions, maintenance, journal des changements).
**Toute évolution du produit met aussi à jour la page Notion concernée et ajoute une ligne au « Journal des changements ».** Jamais de clé ni de mot de passe dans Notion : on indique seulement où se trouve le réglage.

## Connecteur MCP (Claude / ChatGPT)

- Adresse publique : `https://quiz.revolia.be/mcp` (relais Cloudflare Pages `functions/_middleware.js`, routes limitées par `public/_routes.json`) → fonction Edge `supabase/functions/mcp` (déployée avec `verify_jwt = false`, l'authentification OAuth est faite dans le code).
- Connexion : serveur OAuth 2.1 de Supabase Auth (Authorization Path `/oauth/consent`, page `src/pages/ConsentementOAuth.tsx`) ; retrait des accès : `src/pages/Connexions.tsx`.
- Règles : toujours le jeton de l'utilisateur (RLS), jamais de clé service_role ; formateur actif exigé ; aucun pseudo ne sort ; aucun outil ne supprime un quiz ni ne lance une session.
