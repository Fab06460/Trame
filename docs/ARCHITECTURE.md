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
| `brand:load` / `brand:save` | `loadBrandKit()` / `saveBrandKit(json)` | Kit de marque : JSON brut dans `brand-kit.json` (`userData`, 40 Mo max). Le contenu est validé côté interface (`parseBrandKit`) |
| `recent:list` / `recent:remove` / `recent:clear` | `listRecents()` / `removeRecent(path)` / `clearRecents()` | Projets récents, persistés dans `recent-projects.json` du dossier de données de l'application (`userData`). `listRecents` ajoute `name`, `dir` (`~` abrégé) et `modified` (`null` si le fichier a disparu) |
| `templates:rename` / `templates:hidden` / `templates:hide` / `templates:unhide-all` | `renameUserTemplate(id, name)` / `listHiddenTemplates()` / `hideBuiltinTemplate(id)` / `unhideAllTemplates()` | Renommer un modèle personnel ; gérer la liste des modèles **intégrés masqués** (`templates/hidden.json`). Les identifiants sont validés (`isValidId` pour les modèles personnels, `isBuiltinId` pour les intégrés) |
| `templates:list` / `templates:save` / `templates:load` / `templates:delete` | `listUserTemplates()` / `saveUserTemplate(meta, json, replaceId?)` / `loadUserTemplate(id)` / `deleteUserTemplate(id)` | Modèles de l'utilisateur (voir ci-dessous). `save` génère l'identifiant côté main ; les identifiants reçus sont validés (`isValidId`) avant de construire un chemin de fichier |
| `dialog:info` | `showInfo(message, detail)` | Boîte d'information native (un bouton OK) ; en mode test (`TRAME_TEST_EXPORT_DIR`), le message est écrit dans `dialog-info.txt` au lieu d'être affiché |
| `dialog:confirm` | `confirm(message, detail, label)` | Confirmation native (suppression d'un modèle) ; `true` si `label` est choisi |
| `project:open-path` | `openPath(path)` | Ouvre un projet **de la liste des récents uniquement** (un renderer compromis ne peut pas lire un fichier arbitraire) ; `null` si introuvable ou non listé |
| `app:open-file` (réception) / `app:renderer-ready` | `onOpenFile(cb)` / `rendererReady()` | Fichiers ouverts depuis le système (Finder, Dock) : voir « Fichiers ouverts depuis le système » |
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

## Rendu : quatre implémentations à garder synchronisées

Un élément est dessiné à **quatre endroits**, volontairement distincts :

| Où                         | Technique              | Usage                                              |
| -------------------------- | ---------------------- | -------------------------------------------------- |
| `components/Canvas.tsx`    | react-konva (déclaratif) | Éditeur interactif                               |
| `exportPages.ts` (`renderPage`) | Konva impératif, hors écran | Export PNG/JPG et miniatures des modèles personnels, indépendant de la page affichée |
| `pdfExport.ts` (`exportPdf`) | Opérateurs PDF (pdf-lib) | Export PDF vectoriel (formes, texte réel) |
| `components/PageThumb.tsx` | DOM / SVG statique     | Miniatures (barre de pages, modèles) : bien moins coûteux qu'un Stage par miniature |

⚠️ **Tout nouveau type d'élément ou nouvelle propriété visuelle doit être ajouté aux quatre**, sinon l'éditeur, les exports et les miniatures divergeront. Les miniatures sont des approximations (le retour à la ligne du texte peut différer légèrement de Konva). La création du nœud de texte Konva est partagée (`createTextNode`) : éditeur, export image et export PDF mesurent donc le texte de la même façon.

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

## Fichiers ouverts depuis le système

macOS envoie `open-file` à l'application pour un double-clic sur un `.trame`, un glisser-déposer sur son icône ou « Ouvrir récent » du Dock. L'événement peut arriver **avant** que l'application soit prête, voire avant qu'une fenêtre existe (lancement déclenché par le fichier) ; `main/index.ts` enregistre donc le listener dès le chargement du module. `openFromSystem` attend `app.whenReady()`, lit le fichier **dans le processus principal** (le renderer ne reçoit jamais un chemin à lire lui-même), l'ajoute aux récents (`noteRecent` appelle aussi `app.addRecentDocument` pour le Dock), crée une fenêtre si besoin (application ouverte sans fenêtre) et le confie à `fileInbox.ts`. Cette petite machine à états (testée) retient le dernier fichier tant que le renderer n'a pas appelé `rendererReady()` — appelé par `App.tsx` après avoir branché `onOpenFile` — puis envoie directement `app:open-file`. Le renderer passe alors par le même `openFile` que « Ouvrir » (validation `parseDocument`, confirmation si modifications non enregistrées). Le rechargement de la page remet l'inbox en attente (`did-start-loading`). Plusieurs fichiers reçus d'un coup : seul le dernier s'ouvre.

## Projets récents

`main/recents.ts` (logique pure, testée : dédoublonnage, ordre, limite de 12, lecture tolérante d'un fichier corrompu) et lecture/écriture du fichier dans `main/index.ts`. Toute sauvegarde ou ouverture réussie appelle `noteRecent`. Un échec d'écriture de la liste est ignoré : un confort ne doit jamais faire échouer une ouverture ou un enregistrement. Côté interface : onglet « Récents » de la barre latérale (`RecentsPanel.tsx`, sélectionné au démarrage s'il y a des entrées), ouverture via `openRecent` (`fileActions.ts`) qui passe par la même validation (`parseDocument`) et la même confirmation de modifications non enregistrées que « Ouvrir ». Un projet disparu est signalé « Introuvable » ; l'ouvrir affiche une erreur et le retire de la liste.

## Modèles de l'utilisateur

« Enregistrer ce design comme modèle » (onglet Modèles → section « Mes modèles », `UserTemplates.tsx`) conserve **tout le document** (toutes les pages) pour en créer de nouveaux. Stockage dans le dossier de données de l'application (`userData/templates/`) :

- `index.json` : métadonnées légères (nom, dimensions, nombre de pages, **miniature** JPEG de 320 px de la première page), seul fichier lu à l'affichage de la liste ;
- `<id>.json` : le document complet (images en base64 comprises), lu seulement quand on applique le modèle.

La miniature est produite par le rendu hors écran (`renderPage(…, maxSize)`), donc fidèle à l'éditeur. Appliquer un modèle (`userTemplateActions.ts`) : lecture → `parseDocument` (même validation que l'ouverture d'un fichier) → confirmation si modifications non enregistrées → `cloneWithNewIds` (renouvelle les identifiants de pages, d'éléments **et de groupes** : chaque application produit un document indépendant) → nouveau document nommé d'après le modèle, sans chemin de fichier. Logique pure et testée dans `main/userTemplates.ts` (validation de l'identifiant — qui sert de nom de fichier —, du nom, de la miniature ; lecture tolérante de l'index).

### Modifier, renommer, supprimer les modèles

Les modèles intégrés sont **du code** (`templates.ts`) : on ne les modifie ni ne les supprime sur le disque, on les **masque** ou on les **remplace par une version personnelle**. Toutes les opérations sont non destructives et réversibles :

| Action | Modèle personnel | Modèle intégré |
| --- | --- | --- |
| **Supprimer** | supprimé définitivement (confirmation) | **masqué** (`hidden.json`) ; « Restaurer les modèles masqués » le fait réapparaître |
| **Renommer** (✎, sur place) | l'index est mis à jour | crée **votre version** (même contenu, nouveau nom) qui prend sa place |
| **Modifier le contenu** | appliquer → retoucher → « Enregistrer comme modèle » → **Remplacer** (même identifiant, même date de création) | idem : crée votre version qui remplace l'original |
| **Rétablir l'original** | — | supprimer votre version (↺) : l'original revient |

Une *version personnelle* d'un modèle intégré est un modèle personnel dont `basedOn` vaut l'identifiant de l'intégré. Règle d'affichage (`visibleBuiltins`, testée) : un modèle intégré est montré s'il n'est ni masqué ni remplacé par un modèle personnel de `basedOn` égal ; la version personnelle apparaît dans « Mes modèles » avec l'étiquette « personnalisé ». **Les identifiants des modèles intégrés sont donc persistants** (`hidden.json`, `basedOn`) : ne jamais les renommer ni les réutiliser pour un autre modèle.

Le formulaire « Enregistrer comme modèle » propose **Remplacer « X »** quand le document vient du modèle X (`templateOrigin` dans le store : posé quand on applique un modèle, remis à zéro par « Nouveau », « Ouvrir » ou le chargement d'un fichier ; **en mémoire seulement**, perdu à la fermeture). Le choix par défaut est toujours **Nouveau modèle** (non destructif). Après un enregistrement, l'origine devient le modèle enregistré : on peut retoucher et remplacer de nouveau sans créer de doublon. `templates:save` avec `replaceId` écrase le fichier du modèle et ré-écrit l'index en conservant identité, date de création et `basedOn`. `store/templates.ts` partage la liste personnelle et la liste des masqués entre les deux sections de l'onglet. Le mode test de `dialog:confirm` répond « oui » automatiquement (comme `dialog:info`).

## Copier-coller

`clipboardActions.ts` : ⌘C / ⌘X / ⌘V sont interceptés dans `App.tsx` (hors champs de saisie) et passent par le presse-papiers **système** via IPC, ce qui permet de coller entre pages, entre documents (autre fenêtre ou fichier ouvert plus tard) et de coller une capture d'écran ou du texte venant d'une autre application. Écrire dans le presse-papiers remplace tout son contenu : la copie la plus récente l'emporte toujours. `pasteElements` (store) régénère les identifiants et les `groupId`, décale de 30 px tant que la copie se superposerait pile à un élément existant, recentre si tout est hors de la page (format différent), et crée un seul cran d'historique. Image collée : insérée à 60 % de la page au plus ; texte collé : nouveau bloc de texte (5 000 caractères max).

## Export PowerPoint (.pptx)

Bouton « Export PPTX » → `pptxExport.ts` (bibliothèque `pptxgenjs`, MIT) : une diapositive par page, au format du document (px ÷ 96 = pouces ; polices en px × 0,75 = points). **Objets modifiables** : rectangles (arrondis compris), ellipses (remplissage, opacité, contour, tirets, ombre), zones de texte (police, taille, gras/italique, couleur, alignement, interlettrage, interligne ÷ 1,2 car PowerPoint le mesure sur la hauteur naturelle de la ligne, souligné, barré, majuscules appliquées, listes à puces et numérotées en vraies puces PowerPoint, ombre), images PNG/JPEG (opacité). **Repli en image** (`renderElementImage`, partagé avec le PDF, `elementImage.ts`) à la même place : dégradés, formes vectorielles, images retouchées ou dans un autre format, images avec contour ou ombre. L'utilisateur en est informé après l'enregistrement (nombre et causes). PowerPoint pivote autour du **centre** (Trame, autour du coin haut-gauche) : `centredBox` recale la boîte. La hauteur d'un texte est celle que Konva mesure. Pas de contour de lettres. Les polices de Trame ne sont pas embarquées dans le fichier (PowerPoint ne sait embarquer que des polices obfusquées) : sans elles installées, PowerPoint les remplace — le message d'export le rappelle. Contrôle : le smoke test ouvre le ZIP (`jszip`) et vérifie les objets ; `npm run fidelity` produit aussi un `.pptx` par document pour une inspection à l'œil (Quick Look / Keynote), sans mesure pixel à pixel.

## Connecteurs en ligne : photos libres de droits (Openverse)

Principe : **Trame fonctionne entièrement hors ligne ; un connecteur n'ajoute du contenu que sur demande**. L'onglet « Photos » n'émet aucune requête avant la première recherche ; il dit à qui la requête est envoyée ; sans réseau il affiche un message et le reste de l'appli n'est pas affecté ; ce qui est inséré est **copié dans le document** (il reste utilisable hors ligne).
- **Tout le réseau est dans le processus principal** (`index.ts`, `photos.ts` pur et testé) : la CSP de l'interface (`default-src 'self'`) lui interdit tout site tiers. `photos:search` interroge `GET /v1/images/?q=&page=&page_size=20&license_type=commercial,modification&mature=false` (usage commercial et modification autorisés : on recadre, filtre et exporte), lit la réponse **de façon tolérante** (`parseSearch` : entrée sans identifiant ou sans adresse https ignorée) et télécharge les **miniatures** (6 à la fois, ≤ 2 Mo) qu'il renvoie en data URL ; l'interface ne contacte jamais le site d'une image. `photos:import(id)` ne télécharge que des adresses **issues de la dernière recherche** (jamais une adresse fournie par l'interface) : l'original, sinon la miniature de l'API (≤ 30 Mo, type image vérifié sur l'en-tête, https seulement, délai 20 s, `User-Agent: Trame/<version>`).
- Erreurs : `offline` (réseau, DNS, délai), `rate-limit` (HTTP 429 : Openverse limite les requêtes anonymes), `unavailable` (autre). Les messages sont en français et indiquent que Trame reste utilisable hors ligne.
- Côté interface (`PhotosPanel.tsx`) : photo insérée réduite à 2 400 px de côté au plus (`photoImport.ts`), nommée d'après son titre, avec un **crédit** (`credit` : « titre » par auteur (licence) — page d'origine) affiché dans les propriétés de l'image (« Copier le crédit ») et agrégé par « Copier les crédits » (tout le document). Licences possibles : CC0, domaine public, CC BY, CC BY-SA ; seules les deux dernières exigent une mention.
- Tests : `photos.test.ts` (adresses, licences, lecture tolérante, crédits) ; le smoke test lance un **faux serveur Openverse** local (variable `TRAME_OPENVERSE_URL`, qui autorise aussi `http://127.0.0.1`) : requête et licences demandées, miniatures, insertion, repli sur la miniature quand l'original répond 404, pagination, 429, service injoignable, aucune requête avant la première recherche.
- ⚠️ **Non vérifié contre le vrai service** : le développement a eu lieu depuis un environnement qui ne joignait pas `api.openverse.org` (délais dépassés). Les noms de paramètres et de champs (`license_type`, `thumbnail`, `foreign_landing_url`, `license_version`…) viennent de la documentation connue de l'API et de ses clients, pas d'un échange réel ; en cas de différence, seul `searchUrl` / `parseSearch` est à ajuster.

## Import PowerPoint (.pptx)

Bouton « Importer PPTX » → nouveau document (confirmation si le document courant est modifié) → résumé de ce qui n'a pas été repris. Un `.pptx` est un ZIP de XML : `importPptx.ts` (JSZip + `DOMParser`) lit `presentation.xml` (taille de diapositive en EMU ÷ 9 525 = pixels, liste des diapositives), le **thème** (`colors.ts` : couleurs `srgbClr` / `schemeClr` / `sysClr`, modificateurs `lumMod`, `lumOff`, `tint`, `shade`, `satMod`, `alpha`, correspondance `bg1`/`tx1` du masque ; polices `+mj-lt` / `+mn-lt`), puis, pour chaque diapositive, son **masque**, sa **disposition** et ses images (relations `.rels`). `slide.ts` est **pur** (XML en entrée, éléments en sortie, testé avec @xmldom/xmldom) :
- **Formes** : rectangle, rectangle arrondi (rayon = fraction `adj` du plus petit côté), ellipse, formes prédéfinies connues (triangle, losange, étoile, cœur, flèche…) → formes Trame ; formes libres (`custGeom`, hors arcs) → chemin 100 × 100 ; remplissage uni, dégradé (premier et dernier arrêts ; angle OOXML + 90° = angle CSS), contour (épaisseur, tirets), ombre portée ; traits horizontaux et verticaux → rectangles minces. Une forme à style de thème sans remplissage propre (`p:style`) prend la couleur du style. Sans remplissage mais avec contour, la forme est peinte de la couleur du fond (Trame n'a pas de « sans remplissage »).
- **Texte** : une forme avec texte donne la forme (si visible) **puis** un texte au-dessus. Style pris sur le premier passage non vide (un seul style par bloc dans Trame), hérité du masque (`txStyles`) puis de l'espace réservé puis de la forme ; taille (÷ 100 × 96/72, réduite par `normAutofit`), gras, italique, souligné, barré, majuscules, interlettrage, interligne (× 1,2 : inverse de l'export), alignement, puces (`buChar` / `buAutoNum`). La **position** est calculée après mesure Konva de la hauteur (`finalizeText`) : marges de la forme, ancrage haut / centre / bas, autour du centre pour une forme pivotée (PowerPoint pivote autour du centre, Trame du coin haut-gauche).
- **Images** : PNG, JPEG, GIF, WebP (data URL ; 25 Mo max chacune) avec recadrage `srcRect`, miroirs, transparence, rotation ; image utilisée comme remplissage de forme → image. **Groupes** : transformation d'échelle et de décalage composée, membres réunis par un `groupId`. Fond de diapositive : couleur → fond de page ; dégradé ou image → élément pleine page verrouillé. Formes du masque et de la disposition (hors espaces réservés) reprises en éléments verrouillés.
- **Non repris, signalés** : tableaux, graphiques, schémas SmartArt, objets intégrés, traits diagonaux, images SVG / EMF, formes à arcs, rotation de groupe, notes et animations. Au plus 100 diapositives, 150 Mo. Les polices absentes sont remplacées comme pour l'import PDF (`matchFont`) et listées.
- Tests : 26 tests unitaires du parseur ; le smoke test importe un deck produit par pptxgenjs (autre logiciel) puis fait l'**aller-retour** avec notre propre export ; `npm run fidelity` ré-importe chaque `.pptx` exporté et rend le résultat (`*-pptx-roundtrip-n.png`) pour inspection.

## Import d'un PDF

Bouton « Importer PDF » → fenêtre d'options (`PdfImportDialog`) → un **nouveau document** (confirmation si le document courant est modifié). Moteur : pdf.js (`pdfjs-dist`, Apache-2.0 ; worker chargé par `?url`, CSP inchangée), dans `pdfImport/`. Chaque page PDF devient une page Trame : une **image de fond verrouillée** (PNG, ×2 la taille de design, 4096 px max) puis les éléments reconstruits. Le format du document est celui de la première page (points × 96/72) ; une page de format différent est ajustée sans déformation. Limite : 50 pages, 150 Mo.
- **Mode « page en image »** : le fond seul ; on annote par-dessus.
- **Mode « texte modifiable »** : (1) la page est rendue deux fois, avec et **sans** texte — pdf.js écrit chaque glyphe par `ctx.fillText`, neutralisé *sur cette instance de contexte* quand la transformation est droite (le texte pivoté ou miroité reste dans l'image) ; (2) `getTextContent` donne les fragments, que `layout.ts` (pur, testé) regroupe en lignes puis en paragraphes (même police et taille à 10 % près, interligne ≤ 1,8, alignement gauche/centre/droite commun, colonnes séparées) ; (3) `matchFont` associe la police du PDF à une police embarquée (même famille si on l'a, sinon même nature : mono, serif, manuscrite, sans ; gras et italique conservés si la police les possède) ; (4) la **couleur** vient de la comparaison des images avec et sans texte sur la boîte du paragraphe (pixels les plus éloignés du fond) ; (5) un paragraphe dont le texte **n'a pas disparu** de l'image sans texte (dessiné en tracés, pas par `fillText`) n'est pas reconstruit — il resterait en double — et est signalé « laissé dans l'image ». Les sauts de ligne d'origine sont conservés (retours à la ligne durs) ; la largeur du bloc est au moins celle du même texte dans notre police, pour éviter tout retour à la ligne indésirable. La position verticale inverse la formule de Konva (ligne de base = haut + (ascendante − descendante)/2 + interligne/2).
- **Annotation vectorielle** (mode « page en image » seulement : le fond y contient le texte, sinon il serait en double). Le PDF d'origine est conservé **dans le document** (`sources[id]`, base64, ≤ 55 M caractères ; les fonds portent `pdfSource: { id, page }`). À l'export, `embedSourcePage` charge la source (une fois), intègre la page d'origine avec `embedPage` (boîte = CropBox, comme pdf.js) et la dessine dans la boîte de l'élément : texte et vecteurs d'origine intacts, vos ajouts par-dessus. Retombent sur l'image de fond : page tournée (`/Rotate`), source absente (élément collé dans un autre document), source illisible, fond retouché (recadrage, filtres, miroir). `pruneSources` retire à l'enregistrement les sources que plus aucun élément ne référence ; `sanitizeSources` nettoie à la lecture.
- Un résumé final indique le nombre de blocs, les polices remplacées et les blocs laissés dans l'image.
- Test de bout en bout : le processus principal lit `pick-import.pdf` du dossier de test à la place du sélecteur.

## Kit de marque

Onglet « Marque » (`BrandPanel.tsx`). Le kit (`brandKit.ts`, pur et testé : couleurs `#rrggbb`, polices = familles de `FONTS`, logos = data URL d'image ≤ 3 M caractères ; limites 24 / 8 / 12) est **hors des documents**, dans `userData/brand-kit.json` via IPC ; `parseBrandKit` écarte tout ce qui est invalide à la lecture. `store/brand.ts` le garde en mémoire et le réécrit à chaque changement. Les **couleurs récentes** (12 max) sont dans `localStorage` (`trame.recentColors`) : seul un confort, jamais critique. `brandActions.ts` : `applyColor` (sélection hors images, sinon fond de la page, un seul cran d'historique), `applyFont` (textes sélectionnés, sinon crée un texte), `pickScreenColor` (pipette `EyeDropper`, absente = bouton masqué). Un logo se place avec `insertImage`.

## Listes à puces et numérotées

`list: 'bullet' | 'number'` sur un texte ; **un paragraphe (ligne saisie) = un élément**, les paragraphes vides n'ont ni marqueur ni numéro. Konva n'a pas de listes : un texte-liste reste **un seul nœud** (sélection, transformation, ombre, export inchangés) que `listText.ts` (`patchListText`, appliqué à l'instance par `createTextNode` et par la ref du `<Text>` de l'éditeur) modifie en surchargeant `_setTextData` (mise en page dans `largeur − retrait`, et calcul de la première ligne de chaque paragraphe, `listMarkers`) et `_sceneFunc` (texte décalé du retrait, puis colonne de marqueurs dessinée comme un second texte aux lignes vides partout ailleurs : mêmes lignes de base). Le retrait vaut `1,4 × taille de police` (`listStyle.ts`). ⚠️ Dépend de ces deux méthodes internes de Konva : un changement de version de Konva doit repasser par `npm run fidelity` (page 7).
- **PDF** : `drawTextVector` écrit le corps (lignes de `textArr`, décalées du retrait) et les marqueurs (à `x = 0` sur la ligne de base de leur ligne) dans le même bloc `BT`/`ET` ; soulignement et barré ne concernent que le corps. `checkText` ajoute les caractères des marqueurs (« • », chiffres, « . ») à ceux que la police doit posséder.
- **Miniatures** : une rangée flex par paragraphe (colonne de marqueur + texte).

## Magic Resize

`magicResize.ts` (pur, testé) : `adaptDocument(doc, w, h)` renvoie un nouveau document, appelé par l'action `resizeDocument(w, h, adapt)` (un cran d'historique ; sans `adapt`, seule la taille de la page change). Règles : (1) toutes les tailles en pixels (boîte, police, interlettrage, contour, arrondi, ombre, flou) sont multipliées par l'échelle **uniforme** `min(sx, sy)` — aucune déformation ; (2) les **centres** sont multipliés par `sx` / `sy`, ce qui étale la mise en page sur le nouveau format ; (3) un groupe est traité comme un bloc (centre du bloc déplacé, écarts internes mis à l'échelle) ; (4) un élément non pivoté couvrant ≥ 97 % d'une dimension (fond, bandeau) couvre la même dimension du nouveau format ; (5) un bloc est ramené dans la page s'il y tient ; (6) les repères suivent leur axe. Les dimensions sont bornées à 16–8000 px. Limite : la hauteur d'un texte est celle enregistrée (le texte se réagence à la largeur mise à l'échelle) et deux éléments voisins peuvent se chevaucher après un changement de proportions très marqué.

## Retouches d'image (recadrage, miroirs, filtres)

`imageStyle.ts` (pur, testé) : modèle, bornes, `cssFilter`, `recrop`, nettoyage. `imageRender.ts` : **la seule fabrication des retouches**. `editedImage(el)` rend l'image d'origine si l'élément n'a aucune retouche, sinon un canvas contenant la zone recadrée, retournée (échelle négative) et filtrée (`ctx.filter` avec la même chaîne CSS que `cssFilter`), plafonné à 4096 px. Les quatre rendus l'utilisent : `ImageNode` (hook `useEditedImage`), `createNode` (export image et replis du PDF), le PDF (`editedPng` → `embedPng` ; une image sans retouche garde son PNG/JPEG d'origine, sans perte) et les miniatures (`ThumbImage` : canvas réduit). Les retouches étant cuites dans un même canvas, écran, PNG et PDF ne peuvent pas diverger.

- **Recadrer garde le contenu en place** : `recrop` conserve l'échelle de l'image, redimensionne la boîte et déplace son coin haut-gauche le long des axes *tournés* de l'élément.
- **Flou** : réglé en pixels de design, converti en pixels du rendu (`w / el.width`) ; il fait partie de la clé de cache. Les bords s'estompent (le flou lit du transparent au-delà de l'image).
- **Cache** : deux petits LRU (images décodées, canvas retouchés) pour que bouger un curseur ne redécode pas l'image.
- Test de bout en bout : le processus principal lit `pick-image.png` du dossier de test à la place du dialogue « Image ».

## Ombres et lueurs

`shadow` (`{ color, blur, offsetX, offsetY, opacity }`, tous types ; la lueur est une ombre sans décalage, `shadowStyle.ts` : préréglages, `hasShadow`, `shadowProps`, `shadowMargin`, `cssShadow`, nettoyage). Konva l'applique lui-même (propriétés `shadow*`, flou et décalages en pixels de design, corrigés de l'échelle de la vue). ⚠️ **Konva 10 applique l'ombre au contexte *avant* d'appeler une fonction de dessin personnalisée** (et, pour fond + contour + ombre, à la copie d'un tampon) : les formes dessinées en natif (`pathSceneFunc`) en héritent sans rien faire. Y réappliquer l'ombre la **doublerait** (pixel à 63 au lieu de 127 mesuré lors de la mise au point) ; un contrôle de bout en bout le garde.

**PDF : l'ombre est une image placée *sous* l'élément, qui reste vectoriel** (le texte reste du vrai texte). Un PDF n'a pas de flou : l'ombre est rendue par Konva dans une image PNG (`renderToImage`, mode `shadow`), puis le corps de l'élément y est effacé (composition `destination-out`) pour ne garder que ce qui déborde ; le vrai élément est peint par-dessus. Points délicats :
- **Axes de la page.** Konva garde le décalage d'une ombre dans les axes de la page même quand l'élément pivote. L'image est donc rendue dans la boîte englobante de l'élément (`boundsOf`, rotation comprise, plus `shadowMargin` = 1,5 × flou + décalage + 2) et posée **sans** la matrice de rotation de l'élément. Même principe pour tous les replis en image (`renderToImage`, mode `full`).
- **Opacité.** Les nœuds sont rendus à la **vraie opacité** de l'élément : l'ombre s'atténue comme lui et laisse la part d'ombre que Konva laisserait voir sous un corps translucide. Un élément non textuel à opacité < 1 avec **contour ou ombre** est rendu en entier dans une image à sa vraie opacité (Konva compose lui-même fond, contour et ombre).
- **Netteté.** ×2 pour une ombre floue, ×3 pour une ombre nette (flou < 6).
- **Ordre de décision** dans `drawElement` : (1) cas entièrement en image ; (2) texte non écrivable en vrai texte → repli (décidé *avant* l'ombre pour ne jamais la dessiner deux fois) ; (3) image d'ombre ; (4) élément vectoriel.

Miniatures : `filter: drop-shadow(...)` (même convention de flou), approximation (le décalage y pivote avec l'élément).

## Dégradés

`gradient` (`{ type: 'linear' | 'radial', from, to, angle }`) sur les rectangles, ellipses et formes ; il remplace `fill`. **Une seule définition de la géométrie** (`gradient.ts`, pure et testée) pour les quatre rendus : `linearGradientLine` reproduit CSS `linear-gradient(<angle>deg)` (ligne par le centre, longueur telle que les coins extrêmes tombent exactement sur la première et la dernière couleur, quelles que soient les proportions de la boîte) et `radialGradientCircle` le cercle « coin le plus éloigné ».

- **Éditeur et export image** : propriétés Konva (`fillLinearGradient…`, `fillRadialGradient…`, `fillPriority`) pour le rectangle et l'ellipse ; pour les formes, dont le dessin est natif, `pathSceneFunc` fabrique un `CanvasGradient` à partir de l'attribut `trameGradient` du nœud.
- **Miniatures** : CSS `linear-gradient` / `radial-gradient` ; SVG pour les formes (le cercle réel devient une ellipse dans le viewBox 100 × 100 étiré, d'où `gradientTransform`).
- **PDF** : objet **« shading » natif** (type 2 axial ou 3 radial, deux couleurs par une fonction d'interpolation, prolongé au-delà des extrémités), peint par l'opérateur `sh` **dans le détourage de la forme** (`W n`). Le chemin est converti par `svgPathToSegments` (commandes absolues M L H V C Q Z ; Q devient une cubique), écrit dans le repère SVG puis le repère est rétabli — le détourage reste acquis. Le shading est enregistré dans les ressources de la page (`/Shading`). Pas d'API pdf-lib pour cela : tout est construit à la main. L'opacité passe par l'état graphique (`ca`, qui s'applique aux shadings). Si le chemin n'est pas convertible, la couleur unie `fill` est peinte à la place.
- ⚠️ Piège de pdf-lib : `drawSvgPath` sans couleur ni bordure **trace quand même** le chemin avec un trait fin par défaut ; quand seul le dégradé est peint, on n'appelle donc pas `drawSvgPath`.

## Contour

`stroke` / `strokeWidth` / `strokeDashed` sur tous les types d'élément (`strokeStyle.ts` : `hasStroke`, `strokeProps` pour Konva, `dashPattern`, nettoyage à la lecture). Le trait est **centré sur le bord**. Konva l'applique tel quel ; l'export PDF le reproduit avec les options de bordure de `drawSvgPath` (rectangles, ellipses, formes, image : un rectangle sans remplissage tracé après l'image) et, pour un texte, avec le mode de rendu « remplissage + contour » (`Tr 2`), même ordre que Konva. Tirets : motif `[3 × épaisseur, 2 × épaisseur]` partout.

**Formes étirées.** Une forme vit dans un viewBox 100 × 100 étiré à la taille de l'élément. Étirer le *contexte de dessin* déformerait l'épaisseur du trait (plus fin d'un côté que de l'autre) : on étire donc les **coordonnées du tracé** (`DOMMatrix` appliquée à un `Path2D` dans l'éditeur, `scalePath` — pur, testé — pour le PDF). `scalePath` renvoie `null` pour une commande qu'il ne sait pas étirer (arcs) ; l'export retombe alors sur l'ancienne matrice (trait déformé, cas absent des formes intégrées).

**Opacité < 1 avec contour.** Konva compose fond et contour d'un bloc puis applique l'opacité à l'ensemble ; un PDF qui peindrait le fond puis le trait mélangerait la moitié intérieure du trait avec le fond (bande plus sombre). Dans ce cas (hors texte) l'export rend donc l'élément en **image haute résolution** (`drawElementImage`, qui généralise le repli des textes ; `createNode` est le nœud Konva unique de l'éditeur, de l'export image et de ce repli). Ce repli n'est pas signalé à l'utilisateur : il reste net (×3), seule la nature « vecteur » est perdue pour cet élément.

## Typographie

Champs de texte : `letterSpacing`, `lineHeight`, `underline`, `strike`, `uppercase` (voir `FILE_FORMAT.md`). `textStyle.ts` regroupe la logique **commune aux quatre rendus** : `displayText` (les majuscules ne changent que l'affichage, jamais le texte saisi), `decorationOf`, `decorationGeometry` et le nettoyage à la lecture. `createTextNode` (nœud Konva partagé par l'éditeur, l'export image et l'export PDF) les applique, donc les lignes, les retours à la ligne et les largeurs sont identiques partout.

Particularités de Konva, reproduites telles quelles dans le PDF (c'est ce que mesure `npm run fidelity`, page 2 du document d'essai) :
- avec un **interlettrage non nul**, Konva dessine **lettre par lettre** : plus de crénage ni de ligatures. L'export fait de même (une mise en page `fontkit` par caractère, sans correction `TJ`) et porte l'espacement par l'opérateur `Tc` ;
- **souligné et barré** : traits de `taille / 15` d'épaisseur, à `round(taille / 4)` sous (souligné) ou au-dessus (barré) de la ligne de base, d'une longueur égale à la largeur arrondie de la ligne ; dessinés par l'export comme des rectangles pleins ;
- **interligne** : multiple de la taille, repris dans la position de la ligne de base (`baselineY`) ;
- **majuscules** : `toLocaleUpperCase('fr')` ; l'avertissement « texte exporté en image » et le contrôle des glyphes portent sur le texte **affiché** (les majuscules demandent d'autres glyphes).

La taille et les espacements se saisissent dans des champs numériques validés à la sortie (un cran d'historique par modification).

## Calques

`components/LayersPanel.tsx` (onglet « Calques » de la barre latérale) liste les éléments de la page **du premier plan à l'arrière-plan** (le tableau `elements` est dans l'ordre de superposition, dernier = devant ; `layers.ts` convertit les indices : `displayToIndex`, `dropIndex`). Chaque ligne : œil (masquer), glyphe du type, nom (double-clic pour renommer ; `layerLabel` : nom choisi, sinon début du texte, sinon type), repères « groupe » et « ⚠ exporté en image », cadenas (verrouiller). Le réordonnancement par glisser-déposer HTML5 appelle `reorderElement` (un cran d'historique, aucun si rien ne change).

- **Masqué** (`hidden`) : l'élément n'est ni dessiné dans l'éditeur, ni exporté (PNG/JPG, PDF), ni affiché dans les miniatures, ni cible d'aimantation, ni pris par le lasso ou « tout sélectionner », et son éventuel avertissement de PDF disparaît. La règle est appliquée aux **quatre rendus** (voir plus haut) ; elle est vérifiée de bout en bout par l'export d'un PNG dont on lit un pixel et par l'inspection du flux du PDF.
- **Verrouillé** (`locked`) : la **position** est verrouillée, pas le style. L'élément ne se glisse plus (`draggable` faux ; dans une sélection mixte, les verrouillés restent en place), n'a plus de poignées (cadre en pointillés), ne s'aligne ni ne se répartit, ne se déplace plus au clavier ni par les champs X/Y/L/H/rotation, et ne se supprime plus (il reste sélectionné). Les gardes sont **dans le store** (`movable()` : `nudgeSelected`, `align`, `distribute`, `removeSelected`), pas seulement dans l'interface, pour qu'aucun raccourci ne les contourne. Couleur, police, opacité et contenu du texte restent modifiables. ⌘L (ou le bouton « Verrouiller ») bascule la sélection ; `setLayerFlag` retire la clé du fichier quand l'indicateur est levé.

## Règles, repères et aimantation

**Repères** (`page.guides`) : lignes d'alignement posées par l'utilisateur, **dans le document** (donc enregistrées, annulables, propres à chaque page, copiées avec la page). Modifiés par `updateGuides(f, commit?)` (même règle d'historique que le reste : `beginChange()` puis `commit=false` pour un geste continu).

**Règles et repères à l'écran** (`components/Rulers.tsx`) : une couche HTML au-dessus du canvas (pas dans Konva), calculée à partir du seul store de vue (`décalage + position × échelle`). Les règles sont deux `<canvas>` 2D (la gauche est dessinée comme la règle du haut puis tournée de 90° par CSS, d'où sa ligne de base inversée) ; les graduations viennent de `rulerMath.ts` (`rulerTicks`, pure : pas « agréable » 1/2/5/10/25/50/100…, libellés espacés d'au moins 70 px écran). Glisser depuis une règle crée un repère (un seul cran d'historique pour tout le geste), le relâcher sur la règle correspondante ou hors du canvas le supprime, un double-clic aussi. Un repère est un `div` à zone de saisie de 9 px. Réglages **mémorisés** dans `localStorage` (`trame.view` : règles, repères, aimantation) ; raccourcis ⇧R, ⇧G, ⇧A.

**Aimantation** (`geometry.ts`, fonctions pures et testées) :
- `snapBox(box, cibles, options)` : au **déplacement**, les bords et le centre de la boîte englobante de la sélection (rotation comprise) s'accrochent aux bords et centres des autres éléments, de la page et aux repères visibles. Les deux axes sont indépendants ; la plus petite correction dans le seuil l'emporte ; les lignes affichées sont toutes celles sur lesquelles on est accroché, étendues jusqu'à leur cible. Le seuil est de **6 px écran** (donc `6 ÷ échelle` pixels de design : constant à l'écran quel que soit le zoom).
- `snapEdges(box, bordsDéplacés, cibles, options)` : au **redimensionnement**, seuls les bords déplacés s'accrochent ; taille minimale 1 px.
- Dans `Canvas.tsx` : `onDragMove` calcule la boîte de la sélection à sa position brute, applique `snapBox`, puis écrit les positions corrigées dans le store ; `boundBoxFunc` du `Transformer` applique `snapEdges` (poignées de côté, sans rotation). Les lignes roses sont des `Line` Konva en coordonnées écran, **propres à l'éditeur** (absentes des exports).
- Modificateurs : **⌘ / Ctrl** suspend l'aimantation, **Maj** pendant le glisser bloque l'axe dominant (et ne corrige pas l'axe bloqué), **Alt** au début du glisser laisse une copie (`cloneSelectedInPlace` : un seul cran d'historique).
- Poignées « à la Canva » : `keepRatio` (les coins gardent les proportions, les côtés étirent librement), un texte ne s'étire qu'en largeur, rotation aimantée tous les 45° à 5° près.

**Position et taille numériques** (`PositionPanel.tsx`, `NumberField.tsx`) : X / Y de la **boîte visible** (comme l'alignement), L / H / rotation de l'élément, proportions verrouillables (par défaut pour une image). Le champ n'applique la valeur qu'à la validation (Entrée ou sortie) : un cran d'historique par saisie. ⚠️ **Zustand 5 exige des sélecteurs à résultat stable** : `useEditor((s) => s.x.filter(...))` boucle à l'infini (l'interface plante). Lire la valeur brute puis filtrer au rendu.

## Export

- **PNG / JPG** : page affichée uniquement, rendue hors écran par `renderPage` à la taille du design (donc indépendante du zoom et du déplacement de la vue). Nom de fichier suffixé `-pageN` s'il y a plusieurs pages.
- Le résultat est passé au main process sous forme de data URL (`data:…;base64,…`) via `export:save`. Variable d'environnement `TRAME_TEST_EXPORT_DIR` : si elle est définie, les exports sont écrits directement dans ce dossier sans boîte de dialogue (réservée au test de fumée, qui ne peut pas piloter un dialogue natif).

### PDF vectoriel (`pdfExport.ts`)

`exportPdf(doc)` produit un vrai PDF : page = `width × 0.75` × `height × 0.75` points (px CSS à 96 dpi → points), fond de page, puis chaque élément **dans l'ordre de superposition** :

- Chaque élément est dessiné dans un **repère local** posé par `concatTransformationMatrix(elementMatrix(el))` (`pdfMath.ts`) : origine au coin haut-gauche de l'élément, unités en pixels de design, axe y vers le haut (l'élément occupe y ∈ [−hauteur, 0]), rotation horaire autour de ce coin comme Konva. Les rotations, l'échelle et l'inversion de l'axe y du PDF sont ainsi traitées en un seul endroit.
- **Rectangles, ellipses, formes** : chemins vectoriels (`drawSvgPath`) ; les formes du viewBox 100×100 sont étirées par une matrice non uniforme. L'opacité passe par un état graphique PDF.
- **Images** : PNG et JPEG sont intégrés tels quels (résolution d'origine) ; les autres formats sont décodés par le navigateur puis ré-encodés en PNG.
- **Texte** : du **vrai texte PDF** (sélectionnable, net à tout zoom) avec la police embarquée en sous-ensemble (`fontkit` + `pdf-lib`). La mise en page n'est pas recalculée : **Konva fournit les lignes** (`textArr`, donc les mêmes retours à la ligne qu'à l'écran) et les métriques de police (`measureSize('M')` → ascent/descent, donc la même ligne de base). Chaque ligne est composée glyphe par glyphe d'après la mise en page `fontkit` (ligatures, crénage), et le **crénage est reporté avec l'opérateur `TJ`** (le PDF avance de la largeur nominale du glyphe, la correction rétablit l'avance réelle). L'opérateur `Tf` est émis explicitement : `pdf-lib` ne le fait que dans `drawText`, que l'on n'utilise pas ici.
- **Replis en image** (le texte reste visible, mais n'est pas sélectionnable) pour un élément de texte dont (cause enregistrée : `unknown-font`, `missing-variant`, `missing-glyph` ou `font-unreadable`) : la police est système ou inconnue ; la graisse/le style n'existe pas dans la famille (le navigateur le simule, pas le PDF) ; un caractère n'est pas dans le sous-ensemble latin de la police ; un glyphe n'a pas de caractère d'origine. L'élément seul est rendu par Konva sur fond transparent (×3, avec une marge pour les jambages et italiques) puis placé avec la même matrice. **Chaque repli est rapporté** : `exportPdf` renvoie `{ dataUrl, fallbacks }` (page, début du texte, cause, détail) et la barre d'outils affiche, **après** l'enregistrement du fichier, une boîte d'information native qui liste les textes concernés, leur cause et ce qu'il faut faire (`pdfFallbacks.ts` : `describeFallbacks`, testé ; `diagnoseFont` dans `pdfFonts.ts` distingue police inconnue et variante absente). La liste affichée est limitée à 6 entrées (« … et N autres »).

### Avertissement en direct (éditeur)

L'éditeur prévient **avant** l'export qu'un texte sera écrit en image. La décision « vrai texte ou image » est définie **une seule fois**, dans `pdfTextCheck.ts` (`checkText` : police connue → variante présente → tous les caractères dans la police), et utilisée à la fois par l'export et par l'éditeur : ils ne peuvent pas se contredire. `store/pdfIssues.ts` recalcule, après chaque modification du document (délai de 250 ms, annulé si le document change entre-temps), les avertissements de **tous** les textes de **toutes** les pages. Le verdict ne dépend que de (police, style, texte) : il est mis en cache, donc déplacer un élément ne relance aucun calcul ; la couverture des caractères se lit dans la vraie police (fontkit), lue une fois par variante. Le store n'est mis à jour que si le résultat a changé. Trois affichages :

- **panneau « Propriétés »** : encart orange avec la cause et, quand c'est possible, un bouton de **correction en un clic** (`suggestFix`) : police inconnue → Inter en gardant le style ; gras/italique absent → le style le plus proche que la famille possède. Un caractère absent n'a pas de correction automatique ;
- **canvas** : pastille orange « ! » au coin supérieur droit du texte concerné (décalée vers l'extérieur pour ne pas masquer la poignée), propre à l'éditeur (absente des exports et des miniatures) ;
- **bouton « Export PDF »** : compteur `⚠ N` et info-bulle.

Les polices sont chargées à la demande (`pdfFonts.ts`, `import.meta.glob` en `?inline` : un petit module JS par police, donc rien au démarrage). Pas de `fetch` : une page chargée depuis `file://` ne peut pas lire d'autres `file://`, et la CSP interdit `data:` en connexion. `fontkit.ts` absorbe la différence d'import de ce module CommonJS entre outils de build (espace de noms ou `default`).

**Fidélité** : `npm run fidelity` (macOS) exporte des documents de test (formes, rotations, opacité, crénage, ligatures, alignements, replis, image, et tous les modèles intégrés), rastérise chaque PDF avec PDFKit et le compare pixel à pixel à l'image Konva. Mesuré : 0,2–0,9 % de pixels « très différents » (> 64/255), uniquement du lissage de contours entre deux moteurs de rendu ; recalage optimal à (0, 0) pixel pour le texte. Les seuils d'échec sont **par page** (1 % par défaut, plus serrés pour le document d'essai ; un décalage volontaire de 6 px donne 3–4 %, un trait déformé 1,4 % contre 0,55 %). Il vérifie aussi que le texte est extractible du PDF et que le **nombre de replis en image est celui attendu** : 0 pour chaque modèle intégré (un modèle qui dégraderait son texte en image fait échouer l'outil), 2 pour le document d'essai.

## Polices

`fonts.ts` importe les CSS `@fontsource/*/latin-*.css` ; Vite copie les `.woff2` dans le build. `loadFonts()` appelle `document.fonts.load` pour chaque famille/graisse/style **avant** de monter React (timeout de 4 s) : Konva mesure le texte au moment du dessin, une police non prête fausserait les mesures. Un document ancien utilisant `SYSTEM_FONT` reste affichable.

## Build

`electron-vite` produit trois bundles dans `out/` : `main/`, `preload/` (CJS, requis par `sandbox: true`) et `renderer/`. `package.json#main` pointe vers `out/main/index.js`. L'alias `@` → `src/renderer/src` est déclaré dans `electron.vite.config.ts` **et** `tsconfig.json` (`paths`). Le packaging macOS (`electron-builder`) est décrit dans [PACKAGING.md](PACKAGING.md). Toutes les bibliothèques du renderer sont bundlées par Vite ; elles sont donc en `devDependencies`.
