# Rapport de quiz par email + inscription newsletter — spécification

Validé par JF le 24/11/2026 (choix : Resend pour l'envoi, Circle pour la newsletter, email + page web, contenu = réponses/corrections + prochaines étapes REVOLia, envoi immédiat).

## Parcours
1. **Fin de quiz (bilan/terminée), téléphone du participant** : encart « Veux-tu recevoir le rapport de ton quiz par email ? » — champ email, bouton « M'envoyer mon rapport », lien « Confidentialité » (politique REVOLia, URL fournie par JF), mention « Ton email sert uniquement à t'envoyer ce rapport. Il est supprimé avec les données du quiz après 90 jours. » Facultatif (« Non merci »).
2. **Envoi immédiat** d'un email aux couleurs REVOLia (expéditeur `REVOLia <quiz@…>` via Resend) : titre du quiz, date, un résumé chaleureux, bouton **« Voir mon rapport complet »** → page web, puis bloc **« Prochaines étapes »** (REVOLia Campus + liens fournis par JF), puis bouton **« Je veux continuer à recevoir les nouvelles de REVOLia »** (double consentement). Pied : qui envoie, pourquoi la personne reçoit cet email, lien confidentialité.
3. **Page du rapport** `https://quiz.revolia.be/rapport/<jeton>` (sans connexion, jeton secret aléatoire) : document soigné, imprimable / « Enregistrer en PDF » : en-tête REVOLia, titre du quiz, date, formateur ; pour chaque question : énoncé (et photo éventuelle), **sa réponse**, la bonne réponse (jamais de rouge, ton encourageant), le « Pourquoi ? » ; questions sans bonne réponse : sa réponse seulement ; ateliers : titres des étapes et ses rendus ; bloc « Prochaines étapes » ; pied REVOLia. Disponible tant que la session existe (90 jours).
4. **Confirmation newsletter** `https://quiz.revolia.be/newsletter/<jeton>` : page « Merci, c'est confirmé ! » ; ajoute la personne dans Circle comme **contact non membre** avec l'étiquette « Newsletter – REVOLia Live » (si l'email existe déjà dans Circle : considéré comme déjà inscrit, message aimable). Usage unique.

## Données (purgées avec la session)
Table `demandes_rapport` : `id`, `session_id` (cascade), `participant_id` (cascade), `email` (normalisé, ≤ 254, format vérifié), `jeton_rapport` (uuid aléatoire, unique), `jeton_newsletter` (uuid aléatoire, unique), `envoye_le`, `nb_envois` (≤ 3 par participant), `newsletter_confirmee_le`, `cree_le`. RLS activée, aucune lecture directe par les clients (tout passe par RPC / fonction).

## Serveur
- RPC `demander_rapport(p_session, p_email)` (participant de la session, session en `bilan`/`terminee`) → crée/met à jour la demande, renvoie l'id ; refus clairs (email invalide, trop d'envois).
- RPC `rapport_par_jeton(p_jeton)` **appelable sans connexion** (anon) → contenu du rapport de CE participant uniquement (jamais d'autres participants, jamais de pseudo d'autrui, aucune bonne réponse d'une question non fermée).
- RPC interne (non exposée) pour la fonction d'envoi et la confirmation newsletter.
- Fonction Edge `rapport-email` (verify_jwt = true) : appelée par le téléphone après `demander_rapport` ; vérifie que l'appelant est bien le participant de la demande ; construit l'email HTML (tableaux + styles en ligne, compatible Gmail/Outlook, version texte) et l'envoie via l'API Resend (secret `RESEND_API_KEY`, expéditeur `RAPPORT_EXPEDITEUR`) ; marque `envoye_le`.
- Fonction Edge `newsletter-confirmer` (verify_jwt = false, appelée par la page de confirmation avec le jeton) : vérifie le jeton (usage unique), crée le contact Circle via l'API Admin v2 (secret `CIRCLE_API_TOKEN`, id d'étiquette `CIRCLE_TAG_NEWSLETTER_ID`), marque `newsletter_confirmee_le`.
- Jamais de clé service_role côté navigateur ; secrets uniquement dans Supabase.

## Actions de JF (guidées)
- Compte Resend ; domaine d'envoi (sous-domaine conseillé, ex. `mail.revolia.be`) ; enregistrements DNS chez one.com (SPF/DKIM) ; clé API → secret Supabase `RESEND_API_KEY`.
- Circle : jeton API Admin v2 → secret `CIRCLE_API_TOKEN` ; étiquette « Newsletter – REVOLia Live » (créable via l'API).
- Liens : politique de confidentialité ; liens « Prochaines étapes » (REVOLia Campus + autres).

## Réglages — console d'administration UNIQUEMENT (ajout validé par JF le 24/11/2026)

Les formateurs ne voient ni ne modifient ces réglages. Tout est **désactivé par défaut**.

### Tables (lecture et écriture : admin uniquement, RLS ; les fonctions serveur les lisent en security definer)
- `parametres_generaux` (une seule ligne, id = 1) : `rapport_actif` bool (défaut false), `newsletter_active` bool (défaut false), `liens_suivi` jsonb (liens par défaut, voir format), `url_confidentialite` text (https), `maj_le`.
- `formateurs.rapport_autorise` bool défaut true (colonne réglable par l'admin uniquement : via RPC admin, pas par la politique de mise à jour existante — la table formateurs n'est de toute façon pas modifiable par les formateurs).
- `reglages_quiz` : `quiz_id` (pk, → quiz, cascade), `rapport` text ∈ {'herite','actif','inactif'} défaut 'herite', `newsletter` text même domaine, `liens_suivi` jsonb NULL (NULL = utiliser les liens généraux ; non NULL = les REMPLACE, `[]` = aucun lien), `maj_le`. Pas de ligne = tout hérité.
- Format `liens_suivi` : `[{ "titre": "Rejoins REVOLia Campus", "texte": "Une phrase qui donne envie", "url": "https://…", "bouton": "Découvrir REVOLia Campus" }]`, 0 à 5 liens, titre ≤ 80, texte ≤ 200, bouton ≤ 40, url https.

### Règles effectives (calculées par le serveur)
- Rapport proposé = `parametres_generaux.rapport_actif` ET `formateurs.rapport_autorise` (formateur de la session) ET (`reglages_quiz.rapport` ≠ 'inactif') — 'actif' sur un quiz ne contourne PAS un interrupteur général ou formateur éteint (l'admin garde le dernier mot à chaque niveau ; 'herite' et 'actif' sont donc équivalents tant que les niveaux supérieurs sont allumés).
- Newsletter proposée = rapport proposé ET `parametres_generaux.newsletter_active` ET (`reglages_quiz.newsletter` ≠ 'inactif').
- Liens = `reglages_quiz.liens_suivi` s'il n'est pas NULL, sinon `parametres_generaux.liens_suivi`.
- Si la session n'a plus de quiz (quiz supprimé) : réglages généraux + formateur.
- `etat_session` (vue participant, état bilan/terminée) expose `rapport_propose` (bool) et `url_confidentialite`. `demander_rapport` refuse si non proposé.

### RPC admin (vérifient `est_admin`)
`admin_lire_parametres()`, `admin_modifier_parametres(...)`, `admin_lire_reglages_quiz(p_quiz)`, `admin_modifier_reglages_quiz(p_quiz, p_rapport, p_newsletter, p_liens)`, `admin_autoriser_rapport_formateur(p_formateur, p_autorise)` ; `admin_liste_formateurs` renvoie aussi `rapport_autorise`.

### Interface admin
- Nouvel onglet « Rapport & suivi » : interrupteurs généraux (rapport, newsletter), URL de confidentialité, éditeur des liens par défaut (ajouter/retirer/réordonner, aperçu de la carte), état de configuration de l'envoi (« Envoi d'emails configuré : oui/non » — via une RPC qui indique seulement si les secrets existent côté fonction, sans les révéler).
- Onglet « Formateurs » : colonne « Rapport autorisé » (interrupteur).
- Onglet « Tous les quiz » : action « Rapport & liens » par quiz : rapport (hérité/activé/désactivé), newsletter (idem), liens propres (case « Utiliser des liens propres à ce quiz » + éditeur ; sinon affichage des liens généraux hérités), aperçu du bloc « Prochaines étapes » tel que le participant le verra.
