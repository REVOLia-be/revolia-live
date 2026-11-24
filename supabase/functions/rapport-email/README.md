# rapport-email et newsletter-confirmer

Deux fonctions Edge pour le rapport de quiz par email.

- `rapport-email` : le téléphone l'appelle après `demander_rapport`. Envoie l'email via Resend. `GET ?etat=1` (admin) dit si Resend et Circle sont configurés. Vérification JWT activée (par défaut).
- `newsletter-confirmer` (dossier voisin) : appelée par la page publique `/newsletter/<jeton>`. Enregistre la confirmation puis ajoute le contact dans Circle (contact non membre + étiquette). Sans vérification JWT.
- `gabarit.ts` : construit l'email (HTML + texte), sans accès réseau.

## Secrets à créer (Supabase, Edge Functions, Secrets)

| Nom | Obligatoire | Rôle |
|---|---|---|
| `RESEND_API_KEY` | oui, pour l'envoi | clé API Resend |
| `RAPPORT_EXPEDITEUR` | oui, pour l'envoi | ex. `REVOLia <quiz@mail.revolia.be>` (domaine vérifié dans Resend) |
| `CIRCLE_API_TOKEN` | non | jeton API Admin v2 de Circle |
| `CIRCLE_TAG_NEWSLETTER_ID` | non | numéro de l'étiquette « Newsletter – REVOLia Live » |
| `SITE_URL` | non | par défaut `https://quiz.revolia.be` |

`SUPABASE_URL`, `SUPABASE_ANON_KEY` et `SUPABASE_SERVICE_ROLE_KEY` sont fournis automatiquement. Sans les secrets d'envoi, la fonction répond 503 et le téléphone affiche le lien direct vers le rapport. Sans Circle, la confirmation est quand même enregistrée.

## Déploiement

```
supabase functions deploy rapport-email
supabase functions deploy newsletter-confirmer --no-verify-jwt
```

Le logo de l'email est chargé depuis `https://quiz.revolia.be/marque/logo-blanc.png` et `logo-vert-pastel.png` : ces deux PNG doivent exister dans `public/marque/` (aujourd'hui il n'y a que des SVG, que Gmail et Outlook n'affichent pas).
