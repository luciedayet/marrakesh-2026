# Carnet de voyage — Marrakech

Carnet de voyage privé (vols, logement, budget…) protégé par code d'accès à 4
chiffres, installable comme application (PWA), déployé sur Vercel.

## Pourquoi ce n'est plus un simple fichier HTML

Le fichier d'origine intégrait la liste des codes PIN et tous les montants
(budget, remboursements…) directement dans le JavaScript de la page : le
masquage des prix pour les invités n'était qu'un flou CSS, contournable en un
clic dans les outils de développement, et n'importe qui consultant le code
source de la page — avant même de taper un code — pouvait lire tous les PIN
et tous les montants.

Ce projet corrige ça en déplaçant la vérification côté serveur :

- Les codes d'accès vivent uniquement dans la variable d'environnement
  `ACCESS_CODES` (jamais dans le dépôt Git).
- `GET /` est une fonction serverless (`api/index.js`) qui ne renvoie **que**
  l'écran de code tant qu'aucune session valide n'est présente — aucune
  donnée du voyage n'est présente dans le HTML envoyé au navigateur avant
  connexion.
- `POST /api/login` vérifie le code côté serveur et pose un cookie de
  session signé (HMAC, `HttpOnly`, `Secure`, `SameSite=Lax`) — le code n'est
  jamais renvoyé ni stocké côté client.
- Pour les codes marqués `fullAccess: false`, les montants (`price-field`) et
  les sections Budget / Suivi financier sont **retirés côté serveur** — pas
  seulement cachés en CSS — avant l'envoi de la page.
- Un limiteur de tentatives protège `/api/login` contre le bruteforce.

## Structure

```
api/index.js     → GET /  : rend la page (écran de code ou carnet, selon la session)
api/login.js     → POST /api/login : vérifie le code, pose le cookie de session
api/logout.js    → POST /api/logout : efface le cookie
lib/session.js   → signature/vérification du cookie de session (HMAC)
lib/accessCodes.js → lecture des codes depuis ACCESS_CODES (env)
lib/renderPage.js  → construit le HTML envoyé (masquage des prix, sections restreintes, tags PWA)
server/template.html → le carnet d'origine, gabarit **serveur uniquement** (jamais servi tel quel)
public/          → manifest.json, icônes, service worker, page hors-ligne (statique, non sensible)
```

## Configuration (variables d'environnement)

À définir dans **Vercel → Project Settings → Environment Variables** (pas
dans le dépôt) :

| Variable | Description |
|---|---|
| `SESSION_SECRET` | Chaîne aléatoire longue (≥32 caractères) qui signe les cookies de session. Générer avec `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. |
| `ACCESS_CODES` | JSON `{ "PIN": { "name": "Prénom", "fullAccess": true\|false } }`. `fullAccess:true` voit les montants ; `false` voit tout le reste mais montants et onglets Budget/Finances masqués. |
| `SESSION_MAX_AGE_DAYS` | Optionnel, durée de connexion en jours (défaut 60). |

Voir `.env.example` pour le format exact (valeurs factices — à remplacer).
Pour le développement local avec `vercel dev`, copiez `.env.example` en
`.env` et mettez vos vraies valeurs (ce fichier est ignoré par Git).

## Déploiement sur Vercel

1. Pousser ce dépôt sur GitHub (déjà fait si vous lisez ceci depuis le repo).
2. Sur [vercel.com](https://vercel.com), **Add New → Project**, importer ce
   dépôt.
3. Dans les réglages du projet, ajouter les variables d'environnement
   `SESSION_SECRET` et `ACCESS_CODES` (ci-dessus) pour l'environnement
   **Production** (et Preview si besoin).
4. Déployer. Vercel détecte automatiquement les fonctions dans `api/` et sert
   `public/` en statique.

Aucune base de données n'est nécessaire.

## PWA

- `public/manifest.json` + icônes (`public/icons/`) permettent l'installation
  sur l'écran d'accueil (Android : bannière automatique ; iOS : Partager →
  « Sur l'écran d'accueil »).
- `public/sw.js` met en cache uniquement les fichiers statiques (icônes,
  manifest, page hors-ligne) — jamais la page `/` ni les réponses `/api/*`,
  qui dépendent de la session et peuvent contenir des données privées.
- Hors connexion, une page `public/offline.html` (sans donnée du voyage)
  s'affiche si le carnet ne peut pas être chargé.

## Limites connues

- Le limiteur de tentatives sur `/api/login` est en mémoire par instance
  serverless : c'est une protection raisonnable contre le bruteforce
  occasionnel, pas une garantie absolue (il se réinitialise si l'instance
  redémarre). Pour un renforcement supplémentaire, envisager Vercel
  Firewall/Rate Limiting ou un captcha si le carnet devient public.
- Les codes restent des PIN à 4 chiffres : suffisant pour un usage familial
  privé avec limiteur de tentatives, mais pas un mot de passe fort — évitez
  de partager le lien du site publiquement.
