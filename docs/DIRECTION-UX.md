# REVOLia Live — direction UX (feedback, progression, célébrations)

Date : 22 novembre 2026. Document de conception pour JF : aucune ligne de l'application n'a été modifiée. Rien de ce qui suit n'est lancé tant que tu n'as pas validé.

Planches avant / A / B (PNG, données fictives) et maquettes HTML : `/tmp/claude-0/-home-user/e3c09dae-f7d4-525e-ad00-99beef587ecb/scratchpad/direction-ux/` (`planche-a.png`, `planche-b.png`, `planche-c.png`, `planche-d.png`, dossier `html/`).

## Cadre respecté (il prime sur le benchmark)

- 100 % coopératif : ni classement, ni podium, ni score affiché publiquement, ni série comparative. Les parties Kahoot et Mentimeter du benchmark ne s'appliquent pas (le benchmark les conditionne lui-même à une validation qui n'existe pas).
- Charte : celle du manuel Studio Pepper (vert `#00824d`, vert foncé `#004d3d`, vert clair `#80bf9e` jamais en fond, bleu violet `#030159`, iBrand pour les titres, Poppins pour le texte).
- **Écart à signaler** : la section 5 du benchmark cite `#B9FF66`, `#8973FF`, `#F8F8F8`. Ce n'est pas la charte de REVOLia Live. Je ne les ai pas utilisées.
- Pas de rouge. Toujours une icône ET un mot, jamais la couleur seule. `prefers-reduced-motion` respecté. Aucune bibliothèque externe pour un effet : du CSS seulement.
- Je n'ajoute ni mode individuel, ni autoévaluation, ni badge : ce qui est nouveau est marqué « proposition à valider ».

## 1. Ce qu'il faut absolument conserver

- Le ton bienveillant : « Pas tout à fait… +1 pour la salle quand même ». C'est le cœur de l'outil.
- Zéro rouge, zéro classement, la jauge collective, les paliers, les mentions, le bilan de salle.
- Un seul point focal par écran sur téléphone, cibles tactiles de 56 px et plus, choix de 64 px.
- L'écran projeté lisible à 10 m (textes de 28 px et plus à 1080 de haut), bouton de pilotage toujours visible, rappel du QR code.
- Le serveur tranche : la bonne réponse ne sort de la base qu'à la fermeture de la question. Le futur bloc « Pourquoi ? » suit la même règle.
- Les polices hébergées chez nous (iBrand et Poppins), aucun service tiers.

## 2. Sept frictions restantes (l'audit précédent est corrigé : on regarde le feedback pédagogique)

| # | Friction | Source du benchmark | Nature |
|---|---|---|---|
| 1 | Après une question, on sait si on a juste, mais **jamais pourquoi**. Pour des débutants, c'est la plus grosse occasion d'apprendre qui est perdue. | Wayground | Fonctionnel |
| 2 | Le téléphone ne dit pas **où on en est** : aucun « Question 3 / 10 ». Le présentateur l'a déjà. | Duolingo, Typeform | Visuel |
| 3 | Le résultat est un paragraphe de texte. On ne **voit** pas côte à côte son choix et la bonne réponse. « Bravo ! » n'a pas d'icône. | Duolingo | Visuel |
| 4 | Sur l'écran projeté, les barres montrent des nombres bruts (2, 1, 9, 1) et une phrase générale. Pas de « 9 personnes sur 13 », pas de pourcentage par choix. | Wooclap | Visuel |
| 5 | Les changements d'écran (question, attente, résultats) sont secs : tout apparaît d'un coup. | Typeform, Brilliant | Visuel |
| 6 | L'écran de fin du téléphone remercie mais ne résume rien : ni ce que la salle a accompli, ni ce qu'on peut revoir. Le 🎉 est un emoji (rendu différent selon le téléphone). | Brilliant | Visuel (+ fonctionnel pour « revoir ») |
| 7 | Une bonne réponse, une mauvaise et un palier se célèbrent presque de la même façon (ou pas du tout). Rien ne hiérarchise les moments. | Brilliant, Design Spells | Visuel |

## 3. Bonnes pratiques retenues, et ce qu'on écarte

**Retenu**

- **Duolingo, feedback** : progression visible, état clair après la réponse, icône + mot. Pas la mascotte, pas les vies.
- **Typeform, une question à la fois** : rien d'autre que la question et les choix pendant la réponse. La progression reste discrète (une fine barre en segments).
- **Wayground, « Pourquoi ? »** : deux ou trois phrases après chaque réponse. Le bouton « Revoir cette notion » est gardé comme proposition à valider (étape 6).
- **Wooclap, barres collectives** : « 9 personnes sur 13 », pourcentages. Jamais de pseudo, jamais de comparaison entre tables.
- **Brilliant, célébrations sobres** : un geste bref et précis (un check qui se trace), une seule fois, uniquement pour les vrais moments (bonne réponse, palier, fin).

**Écarté, et pourquoi**

- Podium, classement, points liés à la vitesse, séries, vies : contraires à la décision coopérative.
- Score final chiffré sur le téléphone (étape 5 du « parcours recommandé » du benchmark) : remplacé par « ce que la salle a fait ensemble » et la mention.
- Mode individuel / autoévaluation : nouvelle fonctionnalité, pas demandée. Hors périmètre.
- Confettis ou animations Lottie : dépendance externe et licence à vérifier. Les éclats sont dessinés en CSS.
- Sons : aucun.

## 4. Le bloc « Pourquoi ? » (proposition clé)

**Ce que voit la salle.** Après la fermeture d'une question, sur le téléphone et sur l'écran projeté : un bloc de 2 à 3 phrases, sous la bonne réponse. Exemple des maquettes : « Une IA peut se tromper avec beaucoup d'assurance. Relire et vérifier prend deux minutes ; corriger une erreur déjà envoyée à un client prend bien plus. La relecture, c'est toi. » Il est affiché que la réponse soit juste ou non, avec le même ton. Si une question n'a pas d'explication, le bloc n'apparaît pas (rien ne casse pour les quiz existants).

**Ce que ça demande (fonctionnel).**

1. Un champ `explication` (texte, facultatif, 400 caractères maximum) sur `questions`, copié dans `questions_session` au lancement, comme le reste.
2. L'explication ne sort de la base qu'avec les résultats, après fermeture (comme `solution`). Elle s'ajoute au retour de `etat_session` quand l'état est « résultats ».
3. Dans l'éditeur : une zone « Pourquoi ? (2 à 3 phrases, affichées après la question) » sous chaque QCM.
4. Dans le générateur de questions (fonction Supabase + API Claude) : Claude propose l'explication avec chaque question, en tutoiement et sans jargon. Tu relis et tu corriges avant de lancer.
5. Quand on le construira : mise à jour de la page Notion concernée et une ligne au « Journal des changements » (règle du projet).

**Indicateur « Question 3 / 10 »** : purement visuel. `etat_session` renvoie déjà le numéro et le nombre de questions. Aucune donnée nouvelle.

## 5. Deux directions (même structure, mouvement différent)

La structure est identique dans A et B : en-tête « Question n / N » avec barre en segments et minuteur, jauge de la salle, choix, puis après fermeture : statut (icône + mot), choix de la personne et bonne réponse, « Pourquoi ? », message d'attente. Sur l'écran projeté : barres avec nombre et pourcentage, étiquette « Bonne réponse » écrite, bloc « Pourquoi ? » à droite, phrase « 9 personnes sur 13 ».

| | **A — Sobre / professionnel** | **B — Ludique mais mature** |
|---|---|---|
| Mouvement | Quasi nul : les barres grandissent (déjà en place), rien d'autre | Quelques gestes brefs (liste ci-dessous) |
| Choix de réponse | Bouton à plat | Bouton légèrement « en relief » (4 px), segment courant plus long |
| « Pourquoi ? » sur téléphone | Carte blanche, filet vert foncé | Carte vert foncé, titre en vert clair (4,6:1, conforme AA) |
| Chip « +3 pour la salle » | Texte | Pastille qui monte vers la jauge |
| Fin de séance | Check fixe | Check tracé + 14 petits éclats une seule fois |

**Animations de B** (toutes en CSS, toutes coupées si l'appareil demande de réduire les animations : on voit alors directement l'état final)

| Moment | Déclencheur | Durée | Effet |
|---|---|---|---|
| Question qui s'ouvre | Ouverture par le formateur | 220 ms par choix, décalage de 60 ms | Les 4 choix apparaissent en glissant de 10 px |
| Appui sur un choix | Toucher | 120 ms | Léger enfoncement du bouton |
| Bonne réponse | Fermeture de la question | 450 ms + 400 ms | Check qui se trace, anneau qui grossit une fois, pastille « +3 » qui monte en 600 ms |
| « Pas tout à fait » | Fermeture de la question | 250 ms | Icône ampoule qui apparaît en fondu. Aucun tremblement, aucun effet punitif |
| Bloc « Pourquoi ? » | 500 ms après le résultat | 400 ms | Fondu et montée de 14 px |
| Écran projeté | Fermeture de la question | 600 ms, après les barres | Le bloc « Pourquoi ? » glisse depuis la droite ; la bonne réponse émet un halo une seule fois (1,2 s) |
| Fin de séance | Passage au bilan | 450 ms + 900 ms | Check tracé, éclats qui s'éloignent et disparaissent, une seule fois |

Dans les PNG, les éclats sont figés à mi-course : ils sont dessinés en vert clair, vert, vert foncé comme petits points sur fond blanc. Comme le vert clair est « jamais en fond », dis-moi si tu préfères les éclats en vert et vert foncé seulement (je le recommande par prudence).

## 6. Feuille de route

Effort : S = quelques heures, M = une demi-journée à une journée, L = plusieurs jours.

| Priorité | Chantier | Effort | Nature |
|---|---|---|---|
| **P0** | « Question n / N » + barre en segments sur le téléphone | S | Visuel |
| **P0** | Écran de résultat téléphone : icône + mot, choix de la personne et bonne réponse côte à côte | S | Visuel |
| **P0** | Écran projeté : « 9 personnes sur 13 », pourcentages, étiquette « Bonne réponse » | S | Visuel |
| **P0** | Champ `explication` en base + affichage du bloc « Pourquoi ? » (téléphone et projeté) | M | Fonctionnel |
| **P0** | Champ « Pourquoi ? » dans l'éditeur | S | Fonctionnel |
| **P1** | Claude propose l'explication dans le générateur de questions | M | Fonctionnel |
| **P1** | Écran de fin téléphone : ce que la salle a fait ensemble, mention sans emoji | S | Visuel |
| **P1** | Mouvement de la direction choisie (si B) : apparition des choix, check tracé, halo unique | M | Visuel |
| **P1** | Tests : clavier, mouvement réduit, petit téléphone (375 × 667), 1366 × 768 | S | Contrôle |
| **P2** | « Revoir 2 notions » sur l'écran de fin (proposition à valider : nécessite de garder les réponses de la personne, visibles d'elle seule) | M | Fonctionnel |
| **P2** | Éclats de fin de séance | S | Visuel |

Ce que je ne propose pas, même en P2 : badges, séries, partage de score, classement.

## 7. Recommandation

**Prendre A comme base, avec trois gestes empruntés à B** : le check qui se trace pour une bonne réponse, le halo unique sur l'écran projeté, et le check de fin de séance. Le reste de B (boutons en relief, éclats, apparitions échelonnées) peut attendre ton retour après une vraie formation.

Pourquoi : tes participants sont des adultes débutants, devant un vidéoprojecteur partagé. Le gain pédagogique vient du « Pourquoi ? » et de la progression, pas du mouvement. A ne coûte presque rien en maintenance. Les trois gestes retenus ne sont déclenchés que pour les vrais moments, une seule fois, et disparaissent si l'appareil réduit les animations.

À valider par toi : (1) le champ `explication` et sa génération par Claude, (2) A ou « A + trois gestes », (3) les éclats en vert clair ou non, (4) « Revoir 2 notions » en P2 ou jamais.
