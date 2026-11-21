# REVOLia Live

Outil de quiz en direct pour les formations REVOLia. Le formateur projette un écran ; les participants répondent sur leur smartphone, sans compte ni installation.

L'outil est coopératif : jamais de classement ni de comparaison entre personnes ou tables. On construit une jauge commune, on célèbre des mentions positives et on termine par un bilan de salle.

**Adresse du site** : https://quiz.revolia.be

## Animer une session (pour le formateur)

1. **Se connecter** : ouvre le site, va sur « Espace formateur » et saisis ton adresse email. Tu reçois un lien magique par email : pas de mot de passe.
2. **Créer ou modifier un quiz** : dans « Mes quiz », clique sur « Nouveau quiz » (ou « Créer un quiz de démonstration » pour essayer). « Modifier » ouvre l'éditeur des questions.
3. **Lancer** : sur la carte du quiz, clique sur « Lancer ». Tu peux indiquer des tables (facultatif).
4. **Projeter** : l'écran présentateur s'ouvre. Projette-le en grand.
5. **Faire rejoindre la salle** : les participants scannent le QR code affiché à l'écran, ou entrent le code à six lettres sur la page d'accueil du site, puis choisissent un pseudo.
6. **Piloter** : clique sur « Première question », puis « Arrêter maintenant » ou laisse le compte à rebours finir. Après les résultats, « Question suivante » ou « Voir le bilan ».
7. **Bilan** : le bilan de salle s'affiche. « Terminer » clôt la session.
8. **Exporter** : dans « Mes quiz », clique sur « Mes sessions passées → », puis « Exporter (CSV) » à côté de la session. Le fichier s'ouvre dans Excel (séparateur point-virgule, accents corrects).

## Ajouter un autre formateur

1. La personne se connecte une fois sur le site avec son adresse email (lien magique).
2. Dans le tableau de bord Supabase, ouvre l'**éditeur SQL** et exécute :

   ```sql
   insert into formateurs (id, email) select id, email from auth.users where email = 'adresse@exemple.be';
   ```

   Remplace `adresse@exemple.be` par l'adresse de la personne.
3. Elle peut maintenant accéder à « Mes quiz ». Si elle voit « Accès refusé », c'est que cette ligne n'a pas encore été ajoutée.

## Déploiement

Le site est hébergé sur Cloudflare Pages (projet `revolia-quiz-pages`, adresse `quiz.revolia.be` reliée par une ligne CNAME chez one.com). Chaque envoi (push) sur la branche `main` republie automatiquement le site.

Dans Cloudflare, les deux variables suivantes doivent être renseignées (valeurs prises dans Supabase, rubrique API) :

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Ne les écris jamais dans le dépôt.

## Pour les développeurs

```bash
npm install
cp .env.example .env.local   # puis remplir VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY
npm run dev                  # site local sur http://localhost:5173
npm run typecheck            # vérification des types
npm run build                # construit le site dans dist/
bash supabase/tests/lancer_tests.sh   # tests SQL (Postgres 16 local requis)
```

Les migrations SQL sont dans `supabase/migrations/`. Le fichier `docs/PLAN.md` décrit l'architecture et le cycle d'une session.

## Données personnelles (RGPD)

- Les sessions et les réponses sont supprimées automatiquement après 90 jours.
- Aucun traceur, aucun service d'analyse, aucune police chargée depuis un serveur tiers.
- Les participants ne créent aucun compte : une identité anonyme technique permet seulement de les reconnecter si leur téléphone perd la connexion.
