# Limitations connues et dette technique

État au MVP (v0.1.0). Classées par gravité pour le mainteneur. « Non testé » signifie qu'aucune vérification n'a été faite.

## Qualité et outillage

- **Tests unitaires limités à la logique pure** (Vitest, `npm test`) : `geometry.ts`, le store (éléments, historique, sélection/groupes, calques, alignement, pages), `migrateDocument`, cohérence des modèles et des formes. **Rien ne teste l'interface** : `Canvas.tsx` (glisser, redimensionner, lasso, édition de texte), les exports (`renderPage`, PDF), l'IPC et le process principal. Pas de tests de bout en bout (Playwright + Electron serait la piste).
- **Pas de linter ni de formateur** (ESLint/Prettier non configurés).
- **Pas d'intégration continue.**
- **Packaging macOS limité** (voir [PACKAGING.md](PACKAGING.md)) : Apple Silicon uniquement, signature ad hoc sans certificat Developer ID ni notarisation (avertissement Gatekeeper sur les autres Macs), `appId` provisoire, icône provisoire, pas de mise à jour automatique, pas d'association de fichiers `.trame`. Aucun packaging Windows/Linux.
- Le bundle du renderer est volumineux (~2,4 Mo hors polices) : aucun découpage de code.

## Plateformes

- Développé et utilisé uniquement sur **macOS**. Windows et Linux : **non testés**. Points macOS connus : `titleBarStyle: 'hiddenInset'` et marge de 84 px à gauche de la barre d'outils (boutons de fenêtre), raccourcis écrits pour `⌘` (`Ctrl` est géré dans le code, non vérifié).

## Risques de perte de données

- **Pas d'enregistrement automatique** ni de récupération après un plantage de l'appli ou de la machine.
- Les confirmations (Nouveau, Ouvrir, appliquer un modèle, fermer la fenêtre) reposent sur l'indicateur `dirty`, qui passe à `true` à toute modification, **y compris un annuler qui ramène le document à son état enregistré** : une confirmation peut donc être demandée alors que rien n'a réellement changé.
- La validation à l'ouverture (`parseDocument`) vérifie la **structure** (version, dimensions, pages, type et coordonnées des éléments), pas la cohérence du contenu : un `src` d'image invalide, une couleur incorrecte ou un `path` SVG illisible sont acceptés.
- Le champ `name` du document n'est pas modifiable dans l'interface (il sert de nom par défaut à « Enregistrer sous » et aux exports et reste « Sans titre » ou le nom du modèle).

## Éditeur

- **Texte : la hauteur stockée est indicative.** Konva calcule la hauteur réelle selon le retour à la ligne, mais `boundsOf`, l'alignement vertical, le lasso et les miniatures s'appuient sur `element.height`. Les alignements verticaux et le lasso sont donc approximatifs pour des textes sur plusieurs lignes.
- Changer le format de page (`setSize`) **ne redimensionne ni ne repositionne** les éléments (pas de « Magic Resize »), et s'applique à toutes les pages.
- Redimensionner un texte modifie sa boîte, pas sa taille de police ; en sélection multiple, le texte est étiré avec le Transformer puis la boîte est figée.
- Groupes **à plat** : pas d'imbrication, pas d'édition d'un membre sans dissocier.
- Zoom et déplacement : la vue n'est pas conservée par document (réajustée à l'ouverture), le zoom n'est pas centré sur la sélection, et le pincement n'a été pensé que pour un trackpad Mac (molette de souris : ⌘+molette pour zoomer). Pas de règles ni de guides d'alignement magnétiques, pas de verrouillage ni de masquage de calques.
- Pas de retournement d'image, de recadrage, de filtres, de contours, d'ombres ni de dégradés. Les formes vectorielles sont pleines (pas de contour).
- Texte : un seul style par bloc (pas de mise en forme partielle), pas d'interligne ni d'espacement des lettres réglables.
- Changer de page n'est pas annulable.
- Copier-coller : pas de collage de contenu riche (HTML, SVG) venant d'ailleurs, le texte collé perd sa mise en forme, et le format de presse-papiers Trame n'est pas versionné au-delà de `{ trame: 1 }`. Le collage d'un élément entre deux documents de formats différents ne remet pas à l'échelle.

## Images et performances

- Les images sont stockées en **data URL base64 dans le JSON** : +33 % de taille, fichiers `.trame` lourds avec de grandes photos, et **chaque cran d'historique référence ces chaînes** (mémoire). Piste : stocker les images à part (dossier/asset store ou archive zip) et ne garder qu'une référence dans le JSON.
- Aucune limite ni redimensionnement à l'import d'image.
- Les pages sont rendues à la **taille du design** (1 px = 1 px) ; pas d'export haute résolution (@2x) ni d'option de qualité JPG.
- Rendu hors écran de l'export PDF séquentiel et synchrone côté UI : un document très long peut figer brièvement l'interface.

## Export

- **PDF raster** : pas de texte sélectionnable ni de vecteurs ; fichiers plus lourds qu'un PDF vectoriel. Passer au vectoriel nécessiterait de reproduire fidèlement le retour à la ligne, l'alignement et la rotation du texte de Konva avec `pdf-lib` + `fontkit`.
- PNG/JPG exporte **uniquement la page affichée** ; pas d'export de toutes les pages en images, ni de SVG.
- Le nom de fichier d'export vient de `doc.name`, non modifiable (voir plus haut).

## Dette technique à connaître

- **Trois rendus parallèles** (Canvas, `renderPage`, `PageThumb`) à maintenir à la main (voir [ARCHITECTURE.md](ARCHITECTURE.md)). Une abstraction commune (liste de « primitives de dessin ») les unifierait.
- `shapes.ts` utilise **`ctx._context`**, une API **non publique** de Konva : à revérifier à chaque montée de version majeure de Konva.
- `migrateDocument(raw: any)` utilise `any` ; typage à durcir avec une validation de schéma (par ex. zod).
- `Canvas.tsx` concentre beaucoup de responsabilités (rendu, drag, transformation, lasso, édition de texte) : candidat au découpage.
- Les modèles sont codés en dur dans `templates.ts` (pas d'import/export de modèles utilisateur).
- Les versions de dépendances sont très récentes (TypeScript 7, Vite 8, Electron 45, React 19) : lire les notes de version avant toute montée de version majeure. Exemple déjà rencontré : TypeScript 7 refuse l'option `baseUrl` (les alias passent par `paths` avec des chemins relatifs).
- Accessibilité et internationalisation : textes de l'interface en français, directement dans les composants (pas de couche i18n) ; pas de navigation clavier complète ni de support lecteur d'écran sur le canvas.
- `FEATURES.md` est un document de recherche sur Canva, pas une spécification validée.
