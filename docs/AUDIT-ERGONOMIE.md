# Audit d'ergonomie — REVOLia Live

Date : 21 novembre 2026. Audit en lecture seule : aucune ligne de l'application n'a été modifiée.

Comment j'ai fait : lecture de toutes les pages et composants, puis captures de la vraie application avec un faux serveur (mêmes écrans, états fictifs réalistes), sur iPhone SE (375×667), iPhone 14 (390×844), 1920×1080 et 1366×768. Les captures sont dans `/tmp/claude-0/-home-user/e3c09dae-f7d4-525e-ad00-99beef587ecb/scratchpad/audit/` (elles ne sont pas dans le dépôt). Dans le tableau, la colonne « Capture » donne le nom du fichier. Les formats : `-se` et `-14` pour le téléphone, `-1920x1080` et `-1366x768` pour l'ordinateur.

## Résumé en 5 lignes

1. Le fond est très bon : ton bienveillant, aucun rouge, aucun classement, aucune cible tactile sous 56 px côté participant, code de salle sans caractères ambigus, rejoindre = 1 écran depuis le QR code.
2. Le plus gros défaut est côté présentateur : sur l'écran des résultats QCM, le bouton « Question suivante » est **hors de l'écran** (1080 px de haut, bouton à 1125 px) et les libellés des mauvaises réponses sont **illisibles**.
3. Deux situations de panne ne se voient pas : une erreur quand on clique (message tout en bas, hors écran) et la perte de réseau sur téléphone (petite ligne grise de 14 px).
4. Le code et le QR disparaissent dès la première question : un retardataire ne peut plus rejoindre, et l'écran d'attente n'explique pas quoi faire avec le QR.
5. Le reste (21 points) est du confort ou de la finition : contrastes des champs, repères « Question 2 sur 6 », fin de parcours formateur (bilan → export), page d'édition très longue.

## Ce qui fonctionne bien (à ne pas toucher)

- Aucune couleur d'erreur rouge ; une mauvaise réponse devient « Pas tout à fait… +1 pour la salle quand même ». Parfait pour des débutants.
- Côté participant, **aucune cible tactile sous 56 px** (mesuré sur les 20 écrans) ; pas de défilement horizontal ; un seul point focal par écran.
- Le code se met en majuscules tout seul ; la liste des participants à l'écran d'attente reste dans son cadre jusqu'à 40 personnes sur 1366×768 et le bouton n'est jamais recouvert.
- Les messages d'erreur du serveur sont en français clair et disent quoi faire.
- Le présentateur ferme tout seul la question à zéro : le formateur n'a rien à surveiller.
- Contrastes : blanc sur bleu violet 18:1, vert clair sur bleu violet 8,6:1, vert sur blanc 4,9:1 (tous conformes AA).

## Recommandations

Effort : S = quelques heures, M = une demi-journée à une journée, L = plusieurs jours.

### P1 — gêne réelle en formation (les 7 points sont traités ✅, le 21 novembre 2026)

Corrections : tous les écrans présentateur utilisent désormais des zones fixes (`ZonesEcran` + `MiseEnPagePresentateur` en mode `plein`) avec le bouton et l'erreur de pilotage dans un pied de page fixe ; rappel « Rejoindre : adresse · code » avec mini QR en coin (#4) ; consigne en gros sur l'écran d'attente (#5) ; libellés des barres QCM au-dessus de la barre (#2) ; côté téléphone, erreur d'envoi sous la question avec défilement automatique (#6) et bandeau « Connexion perdue » en 18 px, boutons grisés (#7).

| # | Écran | Problème constaté | Proposition concrète | Effort | Capture |
|---|---|---|---|---|---|
| 1 ✅ | Présentateur, résultats d'un QCM | Le bouton « Question suivante » (ou « Voir le bilan ») est sous le bas de l'écran : à 1125 px sur 1080 en 1920×1080, à 825 px sur 768 en 1366×768. La phrase « 69 % de bonnes réponses » est coupée. JF doit faire défiler la page en plein cours. Même chose, en moins grave, sur les réponses ouvertes en 1366×768. | Faire tenir tout l'écran de résultats dans la hauteur (titre un peu plus petit, barres moins hautes), ou fixer le bouton en bas de l'écran comme sur l'écran d'attente. | S | `presentateur-r-qcm-1920x1080.png`, `presentateur-r-qcm-1366x768.png` |
| 2 ✅ | Présentateur, résultats d'un QCM | Le texte de chaque réponse est écrit **dans** la barre. Pour les mauvaises réponses la barre est blanche et le texte est blanc : « La copier telle quelle… » devient invisible quand la barre est courte (A, B, D sur la capture). La salle ne voit pas quelles réponses ont été choisies. | Écrire le texte au-dessus ou à côté de la barre, toujours en blanc sur fond bleu violet, et garder la barre seule pour la mesure. Au passage, la barre de la bonne réponse porte du texte blanc sur vert clair (2,1:1, et la charte interdit le vert clair en fond) : texte bleu violet ou barre verte `#00824d`. | S | `presentateur-r-qcm-faible-1920x1080.png`, `presentateur-palier-celebre-1920x1080.png` |
| 3 ✅ | Présentateur, tous les boutons de pilotage | Si un clic échoue (« Question suivante », « Terminer »…), le message d'erreur s'affiche tout en bas, sous le bouton, souvent hors écran. Le formateur voit un bouton qui « ne répond pas ». | Afficher l'erreur juste au-dessus du bouton, dans un cadre visible, avec la consigne « Clique encore une fois ». | S | `presentateur-erreur-action-1366x768.png` |
| 4 ✅ | Présentateur, pendant les questions | Le QR code et le code disparaissent dès la première question. Une personne qui arrive en retard (courant dans une journée de formation) ne peut plus rejoindre sans que JF revienne en arrière, ce qui est impossible. | Garder en permanence un petit rappel en bas de l'écran : mini QR + « revolia… / code K7M2QX ». Il doit rester discret (un seul point focal). | M | `presentateur-q-qcm-1366x768.png`, `presentateur-r-nuage-1920x1080.png` |
| 5 ✅ | Présentateur, écran d'attente | Aucune phrase ne dit quoi faire (« Scanne le QR code avec l'appareil photo de ton téléphone »). L'adresse écrite sous le QR fait environ 24 px à 1080 de haut (2 % de l'écran) : illisible à 10 m pour quelqu'un qui ne peut pas scanner. | Ajouter une consigne en gros (« Scanne le QR code, ou va sur revolia… et tape le code ») et agrandir l'adresse au niveau du code. | S | `presentateur-attente-0-1920x1080.png`, `presentateur-attente-1366x768.png` |
| 6 ✅ | Participant, question QCM (petit téléphone) | Quand l'envoi échoue, le message (« Cette question est déjà fermée… ») s'affiche sous les quatre choix. Sur iPhone SE il est coupé en bas : la personne tape, rien ne se passe, elle retape. | Afficher l'erreur juste sous la question (en haut de la zone), et faire défiler automatiquement jusqu'à elle. | S | `participant-qcm-erreur-envoi-se.png` |
| 7 ✅ | Participant, perte de réseau | Seule une ligne de 14 px, « Connexion perdue. On réessaie… », apparaît sous la jauge. Les boutons de réponse restent actifs et rien n'explique si la réponse partira. Un réseau de salle moyen rend ce cas fréquent. | Bandeau pleine largeur, texte 18 px : « Ton téléphone n'a plus de réseau. Attends quelques secondes avant de répondre. » Griser les boutons tant que la connexion est perdue. | S | `participant-connexion-perdue-se.png` |

### P2 — confort (les 13 points sont traités ✅)

| # | Écran | Problème constaté | Proposition concrète | Effort | Capture |
|---|---|---|---|---|---|
| 8 ✅ | Participant, après une réponse QCM | Un seul toucher envoie la réponse, sans possibilité de corriger, et l'écran « Réponse envoyée ✓ » ne rappelle pas ce qui a été choisi. Un doigt qui glisse est possible chez des débutants. | Rappeler le choix : « Tu as répondu : C — La relire… ». (Garder l'envoi en un geste : c'est ce qui rend l'outil rapide.) | S | `participant-envoyee-se.png` |
| 9 ✅ | Participant, rejoindre | Le champ pseudo n'a pas de curseur au chargement : un toucher de plus. Avec le mode par table, la page dépasse l'écran sur iPhone SE (692 px sur 667) et le clavier cache le choix de table. | Mettre le curseur dans le pseudo à l'arrivée ; en mode table, demander la table d'abord (4 gros boutons), puis le pseudo. | S | `participant-rejoindre-pseudo-se.png`, `participant-rejoindre-tables-se.png` |
| 10 ✅ | Participant, accueil et rejoindre | Le texte d'exemple « ABC123 » est en vert clair sur blanc (2,1:1) et ressemble à un vrai code déjà tapé. Le bouton « Rejoindre » désactivé est du blanc sur vert pâle (2,1:1) : on ne lit presque pas le mot. La charte réserve le vert clair aux fonds foncés. | Exemple en gris-vert foncé à 60 % (3,4:1 minimum) et écrit « Ex. K7M2QX » ; bouton désactivé en vert foncé à fort contraste plutôt qu'à moitié transparent. | S | `participant-accueil-se.png`, `participant-accueil-saisie-se.png` |
| 11 ✅ | Participant, question longue | Le chronomètre est à côté du titre : quand la question est longue (4 lignes + 4 réponses longues), il défile hors de l'écran avec le contenu, et la page dépasse l'iPhone SE (899 px sur 667). | Placer le chronomètre dans le bandeau fixe en haut, à côté de la jauge. | S | `participant-qcm-long-se.png` |
| 12 ✅ | Présentateur, questions ouvertes, nuage, échelle (en cours) | Écran presque vide : le titre, un compte à rebours, « 6 / 14 réponses ». Rien ne dit « Réponds sur ton téléphone ». | Ajouter une ligne fixe « Réponds sur ton téléphone » sous le titre, et le rappel du code (voir #4). | S | `presentateur-q-nuage-1920x1080.png`, `presentateur-q-echelle-1920x1080.png` |
| 13 ✅ | Présentateur, pilotage | Le bouton « Arrêter maintenant » fait penser à l'arrêt du quiz. Il n'y a aucun repère « Question 2 sur 6 », ni pour la salle ni pour JF. | Renommer en « Voir les résultats maintenant ». Afficher « Question 2 sur 6 » en petit à côté du titre. | S | `presentateur-q-qcm-1366x768.png` |
| 14 ✅ | Présentateur, réponses ouvertes | Le cœur (♡) et « Masquer » font 22 à 37 px de haut, sont à 60 % d'opacité et sans explication. JF ne sait pas que le cœur désigne la mention « Réponse coup de cœur ». « Masquer » est lisible par toute la salle. | Libeller « ♡ Coup de cœur » et ajouter une ligne d'aide discrète « Clique sur ♡ pour mettre une réponse à l'honneur au bilan ». Agrandir à 44 px minimum. | S | `presentateur-r-ouverte-1366x768.png` |
| 15 ✅ | Présentateur, bilan | Le bilan défile tout seul toutes les 4 secondes. JF ne peut ni arrêter ni revenir en arrière : s'il commente la jauge, l'écran change. | Passage automatique désactivé par défaut (ou stoppé au premier clic), boutons « Précédent » / « Suite ». | M | `presentateur-bilan-jauge-1920x1080.png`, `presentateur-bilan-chiffres-1366x768.png` |
| 16 ✅ | Formateur, fin de parcours (bilan → export) | Après « Terminer » : « Retour à mes quiz » → petit lien « Mes sessions passées → » (24 px) → « Exporter (CSV) » : 3 étapes, et le lien est discret. JF peut oublier l'export. | Sur l'écran final, ajouter le bouton « Exporter les résultats (CSV) ». Dans « Mes sessions passées », afficher le code et le nombre de participants. | M | `presentateur-terminee-1366x768.png`, `formateur-sessions-1366x768.png` |
| 17 ✅ | Formateur, « Mes quiz » | « Lancer » ne dit pas qu'il ouvre l'écran à projeter ni qu'il faut le mettre sur le vidéoprojecteur. « Mode par table » n'est pas expliqué. « Supprimer » a le même poids que « Modifier ». | Phrase d'aide sous « Lancer » : « Ouvre l'écran à projeter. Mets-le sur le vidéoprojecteur (F11 pour le plein écran). » Explication d'une ligne du mode par table. Supprimer en lien simple. | S | `formateur-mes-quiz-1366x768.png`, `formateur-mes-quiz-tables-1366x768.png` |
| 18 ✅ | Formateur, édition d'un quiz | Page très longue (2950 px pour 3 questions, 3800 px avec le panneau Claude). Le panneau « Proposer des questions » est tout en bas ; pendant l'analyse du PDF, le message « 30 à 60 secondes » apparaît encore plus bas, loin du bouton cliqué. | Replier les questions (titre + clic pour ouvrir), mettre le panneau Claude en haut, afficher le message d'attente à la place du bouton et bien en vue. | M | `formateur-edition-1366x768.png`, `formateur-edition-ia-attente-1366x768.png` |
| 19 ✅ | Participant et formateur, champs | Texte d'exemple en vert clair sur blanc (2,1:1) dans connexion formateur, noms de tables, consignes, aperçu de l'éditeur. Anneau de focus des champs en vert clair (peu visible) ; les boutons de réponse n'ont que le trait noir par défaut du navigateur. | Un seul style de focus pour toute l'appli : anneau vert foncé 3 px. Textes d'exemple en gris-vert foncé. | S | `participant-focus-qcm-14.png`, `formateur-mes-quiz-tables-1366x768.png` |
| 20 ✅ | Présentateur, connexion perdue | Message de 16-19 px, gris à 80 %, sous la jauge : invisible depuis le fond de la salle, mais JF est devant son écran. | Bandeau visible au-dessus du bouton « Connexion perdue, tes participants peuvent ne plus recevoir les questions. On réessaie. » | S | `presentateur-connexion-perdue-1920x1080.png` |

### P3 — finition (les 5 points sont traités ✅)

| # | Écran | Problème constaté | Proposition concrète | Effort | Capture |
|---|---|---|---|---|---|
| 21 ✅ | Présentateur, palier | La célébration d'un palier est une ligne de ~30 px en haut à droite pendant 6 s ; les téléphones n'en savent rien. C'est le moment fort de l'outil. | Grand message central de 2 s (« La salle débloque le palier 2 ! ») et même phrase sur les téléphones. | M | `presentateur-palier-celebre-1920x1080.png`, `participant-res-bravo-se.png` |
| 22 ✅ | Présentateur, lisibilité à 10 m | Petits textes : numéros de paliers (15 px en 1366×768), libellés « Pas du tout / Très à l'aise » (24 px), « Jauge de la salle ». | Passer à 28 px minimum à 1080 de haut (≈ 2,6 % de la hauteur) pour tout ce qui doit être lu par la salle. | S | `presentateur-r-echelle-1366x768.png` |
| 23 ✅ | Présentateur, bilan | Sur le premier écran, la jauge apparaît deux fois (en haut et en grand). Les confettis passent devant les textes. | Cacher la jauge du haut pendant le bilan ; confettis derrière le texte et coupés si l'ordinateur demande « moins d'animations ». | S | `presentateur-bilan-jauge-1920x1080.png`, `presentateur-bilan-mentions-1920x1080.png` |
| 24 ✅ | Présentateur, modération | La croix pour exclure un pseudo n'apparaît qu'au survol, seulement à l'écran d'attente. Un pseudo déplacé qui arrive après le début, ou qui s'affiche dans « Bravo à… », ne peut plus être retiré. | Ajouter un petit menu « Modération » accessible pendant toute la séance (liste des pseudos avec « Exclure »). | M | `presentateur-attente-1920x1080.png` |
| 25 ✅ | Participant et sessions, textes | « Tu es dans la salle, Marie-/Claire ! » : le pseudo se coupe sur le tiret. « Créée le … · Terminée · terminée le … » répète « terminée ». Les compteurs et la jauge du téléphone n'ont pas de légende pour un débutant. Les chronomètres et la jauge n'ont pas d'étiquette pour les lecteurs d'écran. | Empêcher la coupure dans le pseudo, nettoyer la phrase de la session, légende « La salle » sous la jauge fine, ajouter les étiquettes d'accessibilité manquantes. | S | `participant-attente-se.png`, `formateur-sessions-1366x768.png` |

## Notes sur les corrections P2 et P3

- Pas de changement de base de données. À vérifier en vrai : l'écran « Mes sessions passées » lit maintenant le nombre de participants (`participants(count)`) ; si la lecture était refusée par la sécurité de la base, le nombre n'apparaît simplement pas (le code reste affiché).
- #8 : le rappel du choix n'est montré que si la réponse est envoyée depuis cet écran (pas après un rechargement de la page, la base ne renvoie pas le choix).
- #15 : le bilan ne défile plus tout seul ; boutons « Précédent » / « Suite ».
- #19 : les couleurs atténuées (`discret`, `inactif`) sont dans `src/theme.css`, car Tailwind ne sait pas appliquer « /60 » à une variable CSS ; les anciens `border-vertClair/60` des cartes sont sans effet (bordure grise par défaut), à reprendre si JF veut un liseré vert clair.
- #24 : menu « Modération » en haut à droite de l'écran présentateur, pendant toute la séance.

## Mesures utilisées

- Cibles tactiles participant : aucune sous 56 px sur les écrans testés (boutons 56 à 72 px, choix QCM 64 px).
- Contrastes calculés : vert `#00824d` sur blanc 4,9:1 ; vert clair `#80bf9e` sur blanc 2,1:1 (échec) ; vert clair sur bleu violet `#030159` 8,6:1 ; texte blanc sur barre vert clair 2,1:1 (échec) ; blanc sur bleu violet 18:1.
- Gain à vérifier en vrai : le clavier du téléphone (non reproductible ici) et le wifi lent. Les trois points à tester sur un vrai téléphone : #7 (coupure réseau), #9 (clavier + choix de table) et #6 (erreur d'envoi).

## Limites de l'audit

Les captures utilisent un faux serveur : les écrans sont ceux de la vraie application, mais les chiffres (14 participants, résultats) sont inventés. Le clavier mobile, un vrai wifi lent et la lecture à 10 m dans une salle n'ont pas été testés en réel.
