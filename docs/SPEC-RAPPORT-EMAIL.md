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
