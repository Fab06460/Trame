# Trame

Éditeur de design de bureau, **100 % hors-ligne**, inspiré de Canva. Compose des visuels (posts, stories, présentations, affiches) avec du texte, des formes et des images, sur une ou plusieurs pages, et exporte en PNG, JPG ou PDF.

> État : MVP fonctionnel (v0.1.0). Aucune donnée ne quitte la machine : pas de compte, pas de serveur, pas de requête réseau.

## Fonctionnalités

- Éléments : texte, rectangle, ellipse, 12 formes vectorielles, images locales
- Sélection multiple (lasso, Maj+clic, ⌘A), groupes, alignement et répartition, ordre des calques
- Pages multiples (ajout, duplication, suppression, réordonnancement par glisser-déposer)
- 6 modèles de départ, 10 polices embarquées
- Annuler / rétablir (100 niveaux)
- Projets enregistrés en fichiers `.trame` ; export PNG / JPG (page courante) et PDF (toutes les pages)

Raccourcis : `⌘Z` / `⇧⌘Z` annuler / rétablir · `⌘D` dupliquer · `⌘A` tout sélectionner · `⌘G` / `⇧⌘G` grouper / dissocier · `Suppr` supprimer · flèches déplacer (`Maj` = 10 px) · `Échap` désélectionner.
(Sous Windows/Linux, `Ctrl` remplace `⌘`, mais ces plateformes n'ont pas été testées, voir [limitations](docs/LIMITATIONS.md).)

## Démarrage rapide

Prérequis : Node.js récent (développé avec Node 25) et npm.

```bash
npm install
npm run dev        # lance l'appli en mode développement (rechargement à chaud)
```

| Commande            | Rôle                                                              |
| ------------------- | ----------------------------------------------------------------- |
| `npm run dev`       | Électron + serveur Vite, rechargement à chaud du renderer          |
| `npm run build`     | Compile main, preload et renderer dans `out/`                      |
| `npm run preview`   | Lance l'appli à partir du build `out/`                             |
| `npm run typecheck` | Vérification TypeScript (`tsc --noEmit`)                           |
| `npm test`          | Tests unitaires (Vitest) ; `npm run test:watch` en continu         |

### Dépannage

- **`Error: Electron uninstall`** au lancement : le binaire Electron n'a pas été téléchargé pendant `npm install`. Lancer `node node_modules/electron/install.js`, puis relancer.
- **`Port 5173 is in use, trying another one`** : sans gravité, Vite choisit un autre port tout seul.

## Stack

| Rôle                  | Technologie                                           |
| --------------------- | ----------------------------------------------------- |
| Application desktop   | Electron 45                                           |
| Outillage / build     | electron-vite 6, Vite 8                               |
| Interface             | React 19, TypeScript 7                                |
| Canvas                | Konva 10 + react-konva                                |
| État                  | Zustand 5                                             |
| Export PDF            | pdf-lib                                               |
| Tests                 | Vitest 4                                              |
| Polices embarquées    | @fontsource (sous-ensemble latin)                     |
| Identifiants          | nanoid                                                |

## Organisation du dépôt

```
src/
  main/index.ts          Processus principal Electron : fenêtre, dialogues, accès disque (IPC)
  preload/index.ts       Pont sécurisé exposé au renderer : window.trame
  renderer/
    index.html           Point d'entrée + Content-Security-Policy
    src/
      main.tsx           Charge les polices, puis monte React
      App.tsx            Mise en page et raccourcis clavier
      types.ts           Modèle de données (TrameDocument, TramePage, TrameElement)
      store/editor.ts    Store Zustand : document, sélection, historique, toutes les actions
      geometry.ts        Calculs purs : boîtes englobantes, alignement, répartition
      shapes.ts          Bibliothèque de formes vectorielles + dessin Konva
      templates.ts       Modèles de départ
      fonts.ts           Polices embarquées et préchargement
      exportPages.ts     Rendu hors écran d'une page + export PDF
      stageRegistry.ts   Accès au Stage Konva courant (export de la page affichée)
      components/        Canvas, Toolbar, Sidebar, Properties, PageStrip, PageThumb
docs/                    Documentation détaillée (voir ci-dessous)
vitest.config.ts         Configuration des tests (tests à côté du code : `*.test.ts`)
FEATURES.md              Notes de référence sur les fonctionnalités de Canva (pas de la doc technique)
```

## Documentation

- [Architecture](docs/ARCHITECTURE.md) : processus, flux de données, store, historique, rendu
- [Format de fichier `.trame`](docs/FILE_FORMAT.md) : schéma, versions, migration
- [Étendre l'appli](docs/EXTENDING.md) : ajouter un type d'élément, un modèle, une police, une action
- [Limitations connues et dette technique](docs/LIMITATIONS.md) : à lire avant de modifier le code
