# Étendre Trame

Recettes pour les évolutions les plus courantes. Lire d'abord [ARCHITECTURE.md](ARCHITECTURE.md).

## Ajouter un type d'élément

1. **`types.ts`** : ajouter le type à `ElementType` et les champs optionnels nécessaires.
2. **`store/editor.ts`** : ajouter ses valeurs par défaut dans `defaults`.
3. **Quatre rendus à tenir synchronisés** :
   - `components/Canvas.tsx` : ajouter la branche dans le `map` des éléments (réutiliser `commonProps(el)` pour la sélection, le déplacement et la transformation).
   - `exportPages.ts` (`renderPage`) : même rendu en Konva impératif.
   - `pdfExport.ts` (`drawElement`) : version vectorielle PDF dans le repère local de l'élément (voir [ARCHITECTURE.md](ARCHITECTURE.md)) ; à défaut, un type d'élément n'apparaît pas dans le PDF. Ajouter l'élément à `scripts/pdf-fidelity/documents.ts` et lancer `npm run fidelity`.
   - `components/PageThumb.tsx` : version DOM/SVG.
4. **`components/Properties.tsx`** : titre dans la table des libellés + contrôles spécifiques.
5. **`components/Sidebar.tsx`** : bouton d'ajout (onglet « Éléments »).
6. **`docs/FILE_FORMAT.md`** : documenter les champs.

## Ajouter une forme vectorielle

Ajouter une entrée à `SHAPES` dans `shapes.ts` : `{ id, name, path }` avec un chemin SVG **rempli** (pas de contour) dans un viewBox 100×100. Elle apparaît automatiquement dans la barre latérale et peut servir aux modèles via `icon('id', …)`.

## Ajouter un modèle

Dans `templates.ts`, ajouter un objet à `TEMPLATES` :

```ts
{
  id: 'mon-modele', name: 'Mon modèle', category: 'Post Instagram',
  width: 1080, height: 1080,
  pages: [{ background: '#fff', elements: [ shape('rect', {...}, '#000'), text(...), icon(...) ] }]
}
```

Helpers : `shape`, `icon`, `text`. Les identifiants sont générés à l'application du modèle (`instantiate`). Un modèle peut avoir plusieurs pages. La catégorie regroupe les modèles dans la barre latérale. Les modèles sont du code TypeScript, pas des fichiers de données.

## Ajouter une police

1. `npm i @fontsource/<nom>`.
2. Dans `fonts.ts` : importer les `latin-<graisse>[-italic].css` voulus (uniquement les variantes existantes : vérifier `node_modules/@fontsource/<nom>/`) et ajouter l'entrée à `FONTS` : `family` est la valeur stockée dans les fichiers (ne **jamais** la renommer ensuite, cela casserait les documents existants), `slug` est le nom du paquet (préfixe des fichiers) et `variants` la liste **exacte** des variantes embarquées. Cette liste décide si le PDF peut écrire le texte en vecteur ou doit retomber sur une image : une variante annoncée mais absente ferait échouer l'export, une variante oubliée dégrade le texte en image.

## Ajouter une action d'édition

1. Déclarer l'action dans `EditorState` et l'implémenter dans `store/editor.ts` en respectant la règle d'historique (`snapshot()` pour une action discrète ; `beginChange()` + `commit=false` pour un geste continu).
2. La brancher à l'UI (`Toolbar`, `Properties`) et/ou à un raccourci dans `App.tsx`.
3. Pour une logique de calcul, la mettre dans `geometry.ts` (fonction pure, testable).

## Ajouter un canal IPC

Handler dans `src/main/index.ts` (`ipcMain.handle`), fonction correspondante dans `src/preload/index.ts` (le type `TrameApi` en découle), usage via `window.trame.*`. Ne jamais exposer `ipcRenderer` ou `fs` directement au renderer.

## Conventions du code existant

- TypeScript strict ; alias `@/` pour `src/renderer/src/`.
- Document immuable : toujours créer de nouveaux objets, jamais muter `doc`.
- Commentaires courts, en français, expliquant le *pourquoi*.
- Pas de point d'entrée réseau : toute ressource doit être embarquée.

## Tests

`npm test` lance Vitest (environnement Node) sur les fichiers `src/**/*.test.ts`, placés à côté du code testé. Le store Zustand se teste directement sans React : `useEditor.getState()` puis les actions ; appeler `newDocument()` dans un `beforeEach` pour repartir d'un état propre. Toute nouvelle action du store ou fonction de `geometry.ts` doit venir avec ses tests ; un nouveau modèle ou une nouvelle forme est déjà couvert par les tests de cohérence de `templates.test.ts`.

### Règle « vrai texte ou image » (PDF)

Toute modification de ce qui décide si un texte peut être écrit en vrai texte (nouvelle police, nouveau style, nouvelle condition) se fait dans `pdfTextCheck.ts` : l'export et l'avertissement en direct de l'éditeur en dépendent tous deux. Une nouvelle cause doit aussi être décrite dans `explain` (`pdfFallbacks.ts`) et, si une correction automatique existe, dans `suggestFix`.

### Fidélité de l'export PDF

`npm run fidelity` (macOS : Swift et PDFKit) compare le PDF vectoriel à l'image Konva de l'éditeur, pixel à pixel, pour `scripts/pdf-fidelity/documents.ts` (un document « mixte » qui exerce tous les cas + les modèles intégrés), et vérifie l'extraction du texte et le nombre de replis en image. Il échoue au-delà de 2 % de pixels très différents. À lancer après toute modification de `pdfExport.ts`, `pdfMath.ts`, `pdfFonts.ts`, de la mise en page du texte ou des polices. Les images produites (PDF rastérisé, Konva) sont conservées dans le dossier temporaire affiché, pour inspection visuelle. Les calculs purs (matrice, chemins, crénage, correspondance des polices) ont en plus leurs tests unitaires (`pdfMath.test.ts`, `pdfFonts.test.ts`).

### Test de fumée de bout en bout

`npm run smoke` (macOS) construit l'application, la **lance vraiment** avec un dossier de données temporaire, la pilote via le protocole de débogage de Chromium (`--remote-debugging-port`) et vérifie le pont preload ↔ processus principal : projets récents (persistance, ordre, fichier supprimé, refus d'ouvrir un chemin non listé), modèles personnels (parcours complet dans l'interface : ajout d'un élément, enregistrement, miniature, persistance après rechargement, application, suppression, identifiants malveillants) sortie avec modifications non enregistrées et ouverture depuis le Finder (appli ouverte, puis appli fermée qui démarre à cause du fichier, via `open -a`). Il n'y a pas de dépendance supplémentaire (Node 22+ fournit `WebSocket` et `fetch`). Pour couvrir un nouveau canal IPC, ajouter des `check(...)` dans `scripts/smoke-test.mjs`. Le test de sortie envoie un ordre AppleScript à l'application par son bundle : il se désactive tout seul si une autre instance d'Electron tourne (par ex. `npm run dev`) pour ne pas la fermer ; les ordres `open` du test héritent de l'environnement du shell, d'où le `env -u ELECTRON_RUN_AS_NODE` du script npm. Il ne couvre pas l'interface visuelle (glisser, redimensionner…).
