# Architecture

## Vue d'ensemble

Trame est une application Electron classique à deux processus. **Toute la logique d'édition vit dans le renderer** (React + Konva + Zustand) ; le processus principal ne fait que ce qui exige Node : ouvrir des dialogues natifs et lire/écrire des fichiers.

```
┌──────────────── Processus principal (Node) ────────────────┐
│ src/main/index.ts                                          │
│  BrowserWindow, dialog.*, fs                               │
└───────────────▲────────────────────────────────────────────┘
                │ ipcMain.handle / ipcRenderer.invoke
┌───────────────┴────────────────────────────────────────────┐
│ Preload (src/preload/index.ts)                             │
│  contextBridge → window.trame  (4 fonctions, voir ci-après)│
└───────────────▲────────────────────────────────────────────┘
                │ window.trame.*
┌───────────────┴────────────────────────────────────────────┐
│ Renderer (Chromium, sandboxé)                              │
│  React ── lit ──▶ Zustand store (doc, sélection, historique)│
│  Konva  ◀─ rend ─ éléments de la page courante             │
└────────────────────────────────────────────────────────────┘
```

### Sécurité

Fenêtre créée avec `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`. Le renderer n'a aucun accès direct à Node : il ne peut que appeler les quatre fonctions du preload. La CSP (`index.html`) n'autorise que `'self'` (+ `data:` pour les images et polices, `'unsafe-inline'` pour les styles) : **aucune ressource externe ne peut être chargée**, ce qui garantit le fonctionnement hors-ligne. Toute nouvelle dépendance doit rester compatible avec cette CSP (pas de CDN, pas de police distante).

### API IPC

| Canal            | Preload                          | Rôle                                                        |
| ---------------- | -------------------------------- | ----------------------------------------------------------- |
| `project:save`   | `saveProject(json, path?, name?)` | Écrit le JSON ; ouvre « Enregistrer sous » (proposant `name`) si pas de chemin. Retourne le chemin, ou `null` si annulé ou en échec (erreur affichée) |
| `project:open`   | `openProject()`                  | Dialogue d'ouverture ; retourne `{ path, json }` ou `null`   |
| `image:pick`     | `pickImage()`                    | Dialogue d'image ; retourne une **data URL** base64          |
| `export:save`    | `saveExport(dataUrl, name)`      | Décode une data URL (PNG, JPG ou PDF) et l'écrit sur disque  |
| `recent:list` / `recent:remove` / `recent:clear` | `listRecents()` / `removeRecent(path)` / `clearRecents()` | Projets récents, persistés dans `recent-projects.json` du dossier de données de l'application (`userData`). `listRecents` ajoute `name`, `dir` (`~` abrégé) et `modified` (`null` si le fichier a disparu) |
| `templates:list` / `templates:save` / `templates:load` / `templates:delete` | `listUserTemplates()` / `saveUserTemplate(meta, json)` / `loadUserTemplate(id)` / `deleteUserTemplate(id)` | Modèles de l'utilisateur (voir ci-dessous). `save` génère l'identifiant côté main ; les identifiants reçus sont validés (`isValidId`) avant de construire un chemin de fichier |
| `dialog:confirm` | `confirm(message, detail, label)` | Confirmation native (suppression d'un modèle) ; `true` si `label` est choisi |
| `project:open-path` | `openPath(path)` | Ouvre un projet **de la liste des récents uniquement** (un renderer compromis ne peut pas lire un fichier arbitraire) ; `null` si introuvable ou non listé |
| `clipboard:write-elements` / `clipboard:read` | `writeClipboardElements(json)` / `readClipboard()` | Presse-papiers système. Les éléments copiés sont écrits au format personnalisé `web application/x-trame-elements` (préfixe `web` exigé par l'API pour les types non standard). `readClipboard` renvoie le contenu le plus récent : `elements`, sinon `image` (PNG/JPEG en data URL), sinon `text` |
| `dialog:unsaved` | `askUnsaved(name, action)`       | Boîte native Enregistrer / Ne pas enregistrer / Annuler ; retourne `'save' \| 'discard' \| 'cancel'` |
| `dialog:error`   | `showError(title, message)`      | Boîte d'erreur native                                        |
| `app:state` (envoi) | `setState({ dirty, path })`   | Le renderer informe le main de l'état du document (garde de fermeture, point « modifié » et icône de document sur macOS) |
| `app:before-close` (réception) / `app:close-confirmed` (envoi) | `onBeforeClose(cb)` / `confirmClose()` | Protocole de fermeture, voir ci-dessous |

Le type de `window.trame` est déclaré dans `types.ts` à partir de `TrameApi` (exporté par le preload). Ajouter un canal = modifier `main/index.ts` **et** `preload/index.ts`.

### Fichiers et modifications non enregistrées

Les actions fichier vivent dans `fileActions.ts` (`saveProject`, `openProject`, `newProject`, `confirmUnsaved`), utilisées par la barre d'outils, les raccourcis (⌘N, ⌘O, ⌘S, ⇧⌘S dans `App.tsx`) et les modèles. Toute action qui remplace ou ferme le document passe par `confirmUnsaved(action)`.

**Fermeture de fenêtre** : le main process connaît seulement l'état `dirty` (reçu par `app:state`). Sur `close` avec modifications, il annule la fermeture et envoie `app:before-close` ; le renderer exécute `confirmUnsaved('fermer')` (qui peut enregistrer) et, si l'utilisateur poursuit, répond `app:close-confirmed`, après quoi le main referme réellement la fenêtre. Ce protocole couvre aussi ⌘Q, avec une subtilité d'Electron : **bloquer la fermeture d'une fenêtre pendant `app.quit()` annule la sortie**. Une fois l'utilisateur décidé, refermer seulement la fenêtre laisserait l'application ouverte sans fenêtre (macOS) ; `closeGuard.ts` (machine à états pure, testée) retient donc si la fermeture bloquée venait d'une sortie et, dans ce cas, `app.quit()` est relancé à la confirmation. Le titre de la fenêtre est `nom du fichier (ou du document) • — Trame`, le `•` indiquant des modifications.

## Modèle de données

Défini dans `types.ts`. Un `TrameDocument` a une taille commune à toutes ses pages (`width`, `height`) et une liste de `TramePage` (`background`, `elements[]`). Un `TrameElement` est une structure plate avec un `type` (`rect | ellipse | text | image | path`) et des champs optionnels selon le type. **L'ordre du tableau `elements` est le z-index** (dernier = au premier plan). Les groupes sont à plat : des éléments partageant un `groupId`. Détail et versions : [FILE_FORMAT.md](FILE_FORMAT.md).

Les coordonnées sont en **pixels de design** (pas en pixels écran). `x, y` est le coin haut-gauche **avant rotation** ; la rotation (degrés) se fait autour de ce coin (comportement de Konva).

## Store (`store/editor.ts`)

Un unique store Zustand contient :

- `doc` : le document courant (objet **immuable**, jamais muté sur place)
- `pageId`, `selectedIds` : page affichée et éléments sélectionnés (hors historique)
- `past[]` / `future[]` : historique, `filePath`, `dirty`

Toutes les modifications passent par les actions du store. Helpers internes importants :

- `mapPage(f)` applique une transformation à la page courante et renvoie le nouveau `doc`.
- `snapshot()` empile le `doc` actuel dans `past` (max 100) et vide `future`.
- `expand(ids)` étend une sélection aux membres des groupes concernés.

### Historique (undo/redo)

L'historique stocke des **instantanés complets du document** (partage structurel grâce à l'immutabilité, donc peu coûteux sauf pour les images, voir limitations). Règle à respecter :

- Action discrète (ajout, suppression, changement de couleur…) → `snapshot()` puis modification : un cran d'historique.
- Geste continu (glisser, redimensionner, curseur) → **un seul** `beginChange()` au début, puis `updateElement(id, patch, false)` à chaque mouvement (`commit=false` : pas de nouveau cran).

Le changement de page (`setPage`) et la sélection ne sont pas dans l'historique. Après un undo/redo, `selectedIds` est filtré pour ne garder que les éléments encore existants, et `pageId` retombe sur la première page si la sienne a disparu.

## Rendu : trois implémentations à garder synchronisées

Un élément est dessiné à **trois endroits**, volontairement distincts :

| Où                         | Technique              | Usage                                              |
| -------------------------- | ---------------------- | -------------------------------------------------- |
| `components/Canvas.tsx`    | react-konva (déclaratif) | Éditeur interactif                               |
| `exportPages.ts` (`renderPage`) | Konva impératif, hors écran | Export PDF (toutes les pages), indépendant de la page affichée |
| `components/PageThumb.tsx` | DOM / SVG statique     | Miniatures (barre de pages, modèles) : bien moins coûteux qu'un Stage par miniature |

⚠️ **Tout nouveau type d'élément ou nouvelle propriété visuelle doit être ajouté aux trois**, sinon l'éditeur, l'export et les miniatures divergeront. Les miniatures sont des approximations (le retour à la ligne du texte peut différer légèrement de Konva).

### Canvas (`Canvas.tsx`)

- Le `Stage` occupe tout l'espace ; le design est dessiné dans un `Group` mis à l'échelle (`scale`) et centré (`offX/offY`) pour tenir dans la fenêtre. Un second `Group` clippé à la taille du design contient les éléments.
- Le `Transformer` Konva est attaché aux nœuds de `selectedIds` (effet `useEffect`).
- **Redimensionnement** : en sélection simple, `onTransform` convertit en direct l'échelle en `width/height` (remet `scale` à 1) pour garder texte et formes nets. En sélection multiple, le Transformer gère l'échelle de chaque nœud et on fige le résultat dans `onTransformEnd`.
- **Déplacement groupé** : au `dragstart`, les positions de départ de toute la sélection sont mémorisées dans un `ref` ; à chaque `dragmove` on applique le même delta à tous via `setPositions` (sans historique).
- **Lasso** : rectangle de sélection en coordonnées de design, intersection testée sur `boundsOf()` (boîte englobante tenant compte de la rotation).
- **Édition de texte** : un `<textarea>` HTML est superposé au canvas pendant l'édition (double-clic) ; la valeur est validée au `blur`.
- **Vue (zoom et déplacement)** : `store/view.ts` (store Zustand séparé du document, hors historique et jamais enregistré) contient `zoom` (relatif à l'ajustement : 1 = la page tient en entier), `panX/panY` (décalage par rapport à la page centrée, en px écran) et les dimensions nécessaires aux calculs, publiées par le canvas (`setLayout`). L'échelle effective est `scale = fit × zoom`. `zoomAround()` (pure, testée) garde fixe le point de design situé sous le curseur ; `clampPan` garantit qu'au moins 80 px de la page restent visibles. Interactions : pincement ou ⌘+molette = zoom autour du curseur, défilement à deux doigts = déplacement, barre d'espace maintenue ou clic molette + glisser = outil main, ⌘+ / ⌘- / ⌘0 (ajuster) / ⌘1 (100 %), boutons `ZoomControls` en bas à droite. Le zoom visuel du navigateur est désactivé (`setVisualZoomLevelLimits(1, 1)`), sinon le pincement zoomerait toute l'interface. La vue est réajustée à l'ouverture d'un autre document.

### Formes vectorielles (`shapes.ts`)

Une forme est un chemin SVG dans un viewBox 100×100, dessiné via un `Konva.Shape` personnalisé : `Path2D` mis en cache + `ctx.scale(width/100, height/100)`. Cela évite de modifier `scaleX/scaleY` du nœud (incompatible avec la conversion échelle→taille du Transformer). `pathSceneFunc` utilise `ctx._context` (le contexte 2D natif de Konva, API non publique, voir limitations) et `boxHitFunc` donne une zone de clic rectangulaire.

### Géométrie (`geometry.ts`)

Fonctions pures et sans dépendance (candidates idéales pour des tests unitaires) : `boundsOf`, `unionBox`, `intersects`, `alignDeltas`, `distributeDeltas`. L'alignement d'un seul élément se fait sur la page, de plusieurs éléments sur la boîte de leur union.

## Projets récents

`main/recents.ts` (logique pure, testée : dédoublonnage, ordre, limite de 12, lecture tolérante d'un fichier corrompu) et lecture/écriture du fichier dans `main/index.ts`. Toute sauvegarde ou ouverture réussie appelle `noteRecent`. Un échec d'écriture de la liste est ignoré : un confort ne doit jamais faire échouer une ouverture ou un enregistrement. Côté interface : onglet « Récents » de la barre latérale (`RecentsPanel.tsx`, sélectionné au démarrage s'il y a des entrées), ouverture via `openRecent` (`fileActions.ts`) qui passe par la même validation (`parseDocument`) et la même confirmation de modifications non enregistrées que « Ouvrir ». Un projet disparu est signalé « Introuvable » ; l'ouvrir affiche une erreur et le retire de la liste.

## Modèles de l'utilisateur

« Enregistrer ce design comme modèle » (onglet Modèles → section « Mes modèles », `UserTemplates.tsx`) conserve **tout le document** (toutes les pages) pour en créer de nouveaux. Stockage dans le dossier de données de l'application (`userData/templates/`) :

- `index.json` : métadonnées légères (nom, dimensions, nombre de pages, **miniature** JPEG de 320 px de la première page), seul fichier lu à l'affichage de la liste ;
- `<id>.json` : le document complet (images en base64 comprises), lu seulement quand on applique le modèle.

La miniature est produite par le rendu hors écran (`renderPage(…, maxSize)`), donc fidèle à l'éditeur. Appliquer un modèle (`userTemplateActions.ts`) : lecture → `parseDocument` (même validation que l'ouverture d'un fichier) → confirmation si modifications non enregistrées → `cloneWithNewIds` (renouvelle les identifiants de pages, d'éléments **et de groupes** : chaque application produit un document indépendant) → nouveau document nommé d'après le modèle, sans chemin de fichier. Logique pure et testée dans `main/userTemplates.ts` (validation de l'identifiant — qui sert de nom de fichier —, du nom, de la miniature ; lecture tolérante de l'index).

## Copier-coller

`clipboardActions.ts` : ⌘C / ⌘X / ⌘V sont interceptés dans `App.tsx` (hors champs de saisie) et passent par le presse-papiers **système** via IPC, ce qui permet de coller entre pages, entre documents (autre fenêtre ou fichier ouvert plus tard) et de coller une capture d'écran ou du texte venant d'une autre application. Écrire dans le presse-papiers remplace tout son contenu : la copie la plus récente l'emporte toujours. `pasteElements` (store) régénère les identifiants et les `groupId`, décale de 30 px tant que la copie se superposerait pile à un élément existant, recentre si tout est hors de la page (format différent), et crée un seul cran d'historique. Image collée : insérée à 60 % de la page au plus ; texte collé : nouveau bloc de texte (5 000 caractères max).

## Export

- **PNG / JPG** : page affichée uniquement, rendue hors écran par `renderPage` à la taille du design (donc indépendante du zoom et du déplacement de la vue). Nom de fichier suffixé `-pageN` s'il y a plusieurs pages.
- **PDF** : `exportPdf(doc)` rend chaque page en PNG via `renderPage`, l'embarque dans un PDF `pdf-lib` dont la page mesure `width×0.75` × `height×0.75` points (px CSS 96 dpi → points). **Le contenu de chaque page est une image raster** (texte non sélectionnable), résolution 1 px de design = 1 px.
- Le résultat est passé au main process sous forme de data URL (`data:application/pdf;base64,…`) via `export:save`.

## Polices

`fonts.ts` importe les CSS `@fontsource/*/latin-*.css` ; Vite copie les `.woff2` dans le build. `loadFonts()` appelle `document.fonts.load` pour chaque famille/graisse/style **avant** de monter React (timeout de 4 s) : Konva mesure le texte au moment du dessin, une police non prête fausserait les mesures. Un document ancien utilisant `SYSTEM_FONT` reste affichable.

## Build

`electron-vite` produit trois bundles dans `out/` : `main/`, `preload/` (CJS, requis par `sandbox: true`) et `renderer/`. `package.json#main` pointe vers `out/main/index.js`. L'alias `@` → `src/renderer/src` est déclaré dans `electron.vite.config.ts` **et** `tsconfig.json` (`paths`). Le packaging macOS (`electron-builder`) est décrit dans [PACKAGING.md](PACKAGING.md). Toutes les bibliothèques du renderer sont bundlées par Vite ; elles sont donc en `devDependencies`.
