# Carnet Repas

Appli de recettes de la famille, installable sur iPhone depuis Safari.
Les recettes sont stockées dans Supabase ; le code est hébergé sur GitHub Pages.

## Contenu du dossier

| Fichier | Rôle |
|---|---|
| `index.html`, `styles.css`, `app.js` | L'appli |
| `config.js` | Adresse et clé de votre projet Supabase (à remplir) |
| `manifest.webmanifest`, `icons/` | Nom, icône et affichage plein écran sur l'iPhone |
| `sw.js` | Garde l'appli disponible hors connexion |
| `vendor/` | Bibliothèque Supabase (copie locale, version 2.45.4) |

## 1. Créer la base (Supabase), environ 15 minutes

1. Sur supabase.com, créez un compte puis un nouveau projet nommé `carnet-repas`. Choisissez une région en Europe (Paris si proposée) et notez le mot de passe de la base.
2. Ouvrez **SQL Editor**, puis **New query**. Ouvrez `supabase-setup.sql` (fourni à part, il contient vos adresses e-mail : ne le mettez pas sur GitHub), vérifiez les deux adresses e-mail en haut du fichier, collez tout le contenu et cliquez sur **Run**. Le script peut être relancé sans créer de doublons.
3. Dans **Authentication**, réglages de connexion par e-mail : laissez la connexion par e-mail activée et **désactivez l'inscription libre** (« Allow new users to sign up »). Personne d'autre ne pourra créer de compte.
4. Dans **Authentication > Users**, cliquez sur **Add user > Create new user** pour chacun de vous deux : adresse, mot de passe, et cochez **Auto Confirm User**.
5. Dans **Project Settings > API**, copiez l'**URL du projet** et la clé **anon / publishable** (jamais la clé `service_role` ou secrète). Collez-les dans `config.js`.

Rôles : l'adresse marquée `editeur` peut modifier les recettes, l'adresse `lecteur` peut seulement les consulter. Pour changer un rôle, modifiez la table `membres` dans Supabase.

## 2. Mettre l'appli en ligne (GitHub Pages), environ 10 minutes

1. Sur github.com, créez un dépôt **public** nommé `carnet-repas`.
2. Cliquez sur **Add file > Upload files** et glissez **le contenu** du dossier (pas le dossier lui-même), avec `config.js` déjà rempli. Validez avec **Commit changes**.
3. Dans **Settings > Pages**, choisissez **Deploy from a branch**, branche `main`, dossier `/ (root)`, puis **Save**.
4. Après une ou deux minutes, l'appli est à l'adresse `https://VOTRE-NOM.github.io/carnet-repas/`.

Le dépôt est public : n'y mettez jamais la clé secrète de Supabase. La clé anon est faite pour être publique, ce sont les règles d'accès de la base qui protègent les recettes.

## 3. Installer sur l'iPhone

1. Ouvrez l'adresse dans **Safari** et connectez-vous.
2. Bouton **Partager** > **Sur l'écran d'accueil** > **Ajouter**.
3. Ouvrez l'appli depuis l'icône : elle s'affiche en plein écran et reste connectée.

## 4. Laisser Claude écrire les recettes

Branchez le connecteur **Supabase** dans les réglages de Claude (Connecteurs). Claude pourra alors créer et corriger les recettes et les séances directement dans la base.

Le connecteur donne à Claude un accès large à votre compte Supabase (projets, requêtes SQL). Il ne s'en sert que quand vous le lui demandez, mais ne connectez pas un compte qui contient d'autres projets sensibles.

## Mises à jour du code

1. Remplacez les fichiers modifiés sur GitHub (**Add file > Upload files**).
2. À chaque mise à jour, augmentez le numéro dans `sw.js` (`carnet-v1` devient `carnet-v2`) pour que les téléphones prennent la nouvelle version.
3. Sur l'iPhone, fermez puis rouvrez l'appli.

## Bon à savoir

- **Hors connexion** : l'appli affiche la dernière copie des recettes. Les modifications demandent une connexion.
- **Minuteurs** : ils sonnent tant que l'appli est ouverte au premier plan, pas écran verrouillé.
- **Projet Supabase gratuit** : un projet sans aucune activité pendant une longue période peut être mis en pause par Supabase. Un usage normal l'en empêche ; sinon, on le réactive depuis le tableau de bord, sans perte de données.
- **Sauvegarde** : onglet Compte > Exporter une sauvegarde (fichier JSON).

## Format des données

- `recettes.ingredients` : liste de `{ "q": 1200, "u": "g", "n": "filet de poulet" }` ; `u` vaut `g`, `ml` ou vide (pièces) ; `q` vaut `null` pour « thym » ; `{ "grp": "Sauce" }` ouvre un groupe.
- `recettes.etapes` : liste de `{ "t": "texte", "min": 15 }` (`min` déclenche un minuteur).
- `seances.etapes` : même format, plus `"r": "A" | "B" | "AB"` pour le plat concerné.
