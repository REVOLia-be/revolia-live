# Code permanent par quiz + réponses multiples aux questions ouvertes — spécification

Validé par JF le 24/11/2026. Contrat entre la base et l'interface.

## A. Code (et QR code) permanent par quiz

- `quiz.code` : texte unique, `^[A-Z0-9]{4,10}$` (majuscules et chiffres ; saisie insensible à la casse, espaces retirés). Valeur par défaut générée (6 caractères sans ambiguïté, comme `generer_code`), unique parmi les codes de quiz ET les codes de sessions non terminées. Les quiz existants reçoivent un code généré. La duplication d'un quiz (appli ou MCP) ne copie jamais le code : la copie en reçoit un nouveau.
- Le formateur peut choisir son code (ex. `IABASES`) dans l'éditeur. Refus clair si déjà pris : « Ce code est déjà utilisé par un autre quiz. Choisis-en un autre. »
- `lancer_session(p_quiz)` : la nouvelle session prend `code = quiz.code`. Toute session non terminée du même quiz est d'abord **archivée** (`etat = 'terminee'`, `terminee_le = now()`, mentions calculées comme `terminer_session`). Une seule session non terminée par code : l'unicité de `sessions.code` devient un index unique partiel `where etat <> 'terminee'`.
- `infos_session(p_code)` / `rejoindre_session(...)` : trouvent la session non terminée portant ce code. Si aucune mais qu'un quiz porte ce code : erreur « Le quiz n'a pas encore commencé. Attends le signal de ton formateur, puis réessaie. » (code d'erreur `P0001` distinct de « code inconnu » `P0002`).
- Les sessions existantes gardent leur ancien code jusqu'à leur fin.
- RPC `archiver_session(p_session)` = `terminer_session` (alias explicite pour le bouton « Archiver ») — formateur animateur ou admin.

### Interface
- Éditeur : bloc « Code permanent » : code affiché en grand + QR code (`https://quiz.revolia.be/rejoindre/<CODE>`), champ pour le modifier, boutons « Télécharger le QR code » (PNG haute définition, pour l'imprimer sur les supports) et « Copier le lien ».
- Mes quiz (carte et liste) : code visible.
- Téléphone : `/rejoindre/<CODE>` et `/jouer/<CODE>` doivent toujours viser la session ACTUELLE du code. Si l'identifiant de session mémorisé dans le navigateur ne correspond plus à la session actuelle (ancienne formation), on l'oublie et on repasse par « Rejoindre » (nouveau pseudo). Message aimable si le quiz n'a pas encore commencé, avec bouton « Réessayer » (et nouvel essai automatique toutes les 10 s).
- Mes sessions / admin : bouton « Archiver » sur une session non terminée (confirmation). Le lancement d'un quiz dont une session est en cours prévient : « Une session de ce quiz est en cours (lancée le …). La lancer à nouveau l'archivera. Continuer ? »

## B. Question ouverte : plusieurs réponses par participant

- `questions.max_reponses` smallint, défaut 1, de 1 à 10 ; autorisé > 1 seulement pour le type `ouverte`. Copié dans `questions_session.max_reponses`.
- `reponses` : nouvelle colonne `rang` smallint (défaut 1) ; l'unicité `(question_id, participant_id)` devient `(question_id, participant_id, rang)`.
- `repondre` pour une question ouverte : si le participant a déjà `max_reponses` réponses → « Tu as déjà envoyé tes N réponses. » ; sinon insertion avec `rang = nombre actuel + 1`. Les autres types gardent « Tu as déjà répondu à cette question. ».
- Comptages à corriger pour qu'une personne ne compte qu'une fois par question : jauge (`jauge_session` : participation = paires distinctes question/participant ; bonnes réponses inchangées), mention « a répondu à tout » (questions distinctes), `mon_score` (`reponses_donnees` et `contribution` par question distincte), `nb_reponses` de l'état de la question pendant la question (nombre de participants ayant répondu) — `resultats_question.nb_reponses` (ouverte) reste le nombre total de réponses, et ajoute `nb_participants_ayant_repondu`.
- `etat_session` (participant, question ouverte en cours) : `a_repondu` = a atteint le maximum ; ajoute `mes_reponses` (tableau de ses textes dans l'ordre) et `question.max_reponses`.
- `resultats_question` (participant) : `ma_reponse` = première réponse (compatibilité) + `mes_reponses` (tableau).
- Export CSV : une ligne par réponse (inchangé).

### Interface
- Éditeur (question ouverte) : « Nombre de réponses par participant » (1 à 10, défaut 1).
- Téléphone : si `max_reponses > 1` : consigne « Tu peux envoyer jusqu'à N réponses, une par une. » ; après chaque envoi, la réponse s'ajoute à « Tes réponses » (liste) et le champ se vide pour la suivante ; compteur « 2 / 5 » ; quand le maximum est atteint : « Merci ! Tu as envoyé tes N réponses. » ; bouton « J'ai terminé » pour passer à l'écran d'attente avant le maximum.
- Écran projeté : pendant la question, « X personnes ont répondu · Y réponses » ; résultats : mur de cartes (déjà existant) avec toutes les réponses, sans pseudo ; l'ajustement automatique doit tenir avec beaucoup de cartes (jusqu'à ~200 courtes réponses : réduire, puis afficher « + N autres » avec possibilité de faire défiler par le formateur).
