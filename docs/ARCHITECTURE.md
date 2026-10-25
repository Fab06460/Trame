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
| `project:save`   | `saveProject(json, path?)`       | Écrit le JSON ; ouvre « Enregistrer sous » si pas de chemin. Retourne le chemin ou `null` si annulé |
| `project:open`   | `openProject()`                  | Dialogue d'ouverture ; retourne `{ path, json }` ou `null`   |
| `image:pick`     | `pickImage()`                    | Dialogue d'image ; retourne une **data URL** base64          |
| `export:save`    | `saveExport(dataUrl, name)`      | Décode une data URL (PNG, JPG ou PDF) et l'écrit sur disque  |

Le type de `window.trame` est déclaré dans `types.ts` à partir de `TrameApi` (exporté par le preload). Ajouter un canal = modifier `main/index.ts` **et** `preload/index.ts`.

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
- `stageRegistry.ts` expose le Stage/Transformer courant pour `exportDataUrl()` (export PNG/JPG de la page affichée, poignées masquées, `pixelRatio = 1/scale` pour sortir à la taille réelle du design).

### Formes vectorielles (`shapes.ts`)

Une forme est un chemin SVG dans un viewBox 100×100, dessiné via un `Konva.Shape` personnalisé : `Path2D` mis en cache + `ctx.scale(width/100, height/100)`. Cela évite de modifier `scaleX/scaleY` du nœud (incompatible avec la conversion échelle→taille du Transformer). `pathSceneFunc` utilise `ctx._context` (le contexte 2D natif de Konva, API non publique, voir limitations) et `boxHitFunc` donne une zone de clic rectangulaire.

### Géométrie (`geometry.ts`)

Fonctions pures et sans dépendance (candidates idéales pour des tests unitaires) : `boundsOf`, `unionBox`, `intersects`, `alignDeltas`, `distributeDeltas`. L'alignement d'un seul élément se fait sur la page, de plusieurs éléments sur la boîte de leur union.

## Export

- **PNG / JPG** : page affichée uniquement, via `stageRegistry.exportDataUrl`. Nom de fichier suffixé `-pageN` s'il y a plusieurs pages.
- **PDF** : `exportPdf(doc)` rend chaque page en PNG via `renderPage`, l'embarque dans un PDF `pdf-lib` dont la page mesure `width×0.75` × `height×0.75` points (px CSS 96 dpi → points). **Le contenu de chaque page est une image raster** (texte non sélectionnable), résolution 1 px de design = 1 px.
- Le résultat est passé au main process sous forme de data URL (`data:application/pdf;base64,…`) via `export:save`.

## Polices

`fonts.ts` importe les CSS `@fontsource/*/latin-*.css` ; Vite copie les `.woff2` dans le build. `loadFonts()` appelle `document.fonts.load` pour chaque famille/graisse/style **avant** de monter React (timeout de 4 s) : Konva mesure le texte au moment du dessin, une police non prête fausserait les mesures. Un document ancien utilisant `SYSTEM_FONT` reste affichable.

## Build

`electron-vite` produit trois bundles dans `out/` : `main/`, `preload/` (CJS, requis par `sandbox: true`) et `renderer/`. `package.json#main` pointe vers `out/main/index.js`. L'alias `@` → `src/renderer/src` est déclaré dans `electron.vite.config.ts` **et** `tsconfig.json` (`paths`). **Il n'y a pas encore de packaging** (pas d'`electron-builder`) : l'appli se lance via `npm run dev` ou `npm run preview`.
