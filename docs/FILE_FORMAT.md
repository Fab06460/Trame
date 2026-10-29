# Format de fichier `.trame`

Un fichier `.trame` est du **JSON UTF-8** : la sérialisation directe de `TrameDocument` (voir `src/renderer/src/types.ts`, source de vérité). Il n'est ni compressé ni chiffré.

## Version 2 (courante)

```jsonc
{
  "version": 2,
  "name": "Sans titre",   // nom du document (80 caractères max) ; nom des exports, « / \ : * ? " < > | » y deviennent « - »
  "width": 1080,            // pixels de design, communs à toutes les pages
  "height": 1080,
  "pages": [
    {
      "id": "aB3xK9_q",
      "background": "#ffffff",
      "notes": "…",         // optionnel : notes de l'orateur de la page (texte, 20 000 caractères au plus)
      "guides": [            // optionnel : repères d'alignement de la page
        { "orientation": "v", "position": 540 },   // v = ligne verticale à x = 540
        { "orientation": "h", "position": 100 }    // h = ligne horizontale à y = 100
      ],
      "elements": [          // l'ordre = z-index (dernier = devant)
        {
          "id": "Qw8e_1Zt",
          "type": "text",    // rect | ellipse | text | image | path
          "x": 100, "y": 200, "width": 500, "height": 80,
          "rotation": 0,     // degrés, autour du coin haut-gauche
          "opacity": 1,
          "fill": "#1e1f24",
          "groupId": "k3J9aa01",   // optionnel : même valeur = même groupe
          "shadow": { "color": "#000000", "blur": 20, "offsetX": 0, "offsetY": 10, "opacity": 0.35 },  // optionnel : ombre portée / lueur
          "gradient": { "type": "linear", "from": "#7c5cff", "to": "#38bdf8", "angle": 135 },  // optionnel : remplace fill
          "stroke": "#7c5cff",     // optionnel : couleur du contour (avec strokeWidth)
          "strokeWidth": 6,        // optionnel : épaisseur en px, centrée sur le bord (> 0 et ≤ 100)
          "strokeDashed": true,    // optionnel : contour en tirets
          "credit": "« Montagne » par Ada (CC BY 4.0) — https://…",  // optionnel (images) : crédit d'une photo en ligne
          "alt": "Un phare au lever du jour sur une côte rocheuse",  // optionnel (images) : texte alternatif, 500 caractères au plus ; sinon retiré à la lecture
          "ai": { "provider": "openai", "model": "gpt-image-1", "prompt": "un phare au lever du jour", "from": "edit" },  // optionnel (images) : image générée par un service d'IA (`from` : "edit" ou "variation" pour une retouche ou une variante) ; sinon retiré à la lecture
          "protect": "fixed",       // optionnel : "fixed" (figé par le modèle) ou "fill" (à remplir : contenu modifiable, position fixée) ; absent = libre
          "pdfSource": { "id": "a1B2c3D4", "page": 1 },  // optionnel (images) : page d'origine d'un PDF importé (voir « sources »)
          "crop": { "x": 0.25, "y": 0, "width": 0.75, "height": 1 },  // optionnel (images) : zone visible, en fractions de l'image d'origine
          "flipX": true, "flipY": true,                                 // optionnel (images) : miroirs
          "filters": { "brightness": 20, "sepia": 40, "blur": 4 },       // optionnel (images) : réglages ; 0 ou absent = neutre
          "name": "Titre",         // optionnel : nom du calque (sinon automatique)
          "locked": true,          // optionnel : position verrouillée
          "hidden": true,          // optionnel : masqué (ni affiché ni exporté)
          // champs selon le type :
          "text": "Votre texte", "fontSize": 64,
          "fontFamily": "\"Inter\", sans-serif",
          "fontStyle": "bold",     // normal | bold | italic | "italic bold"
          "align": "left",         // left | center | right
          "letterSpacing": 4,      // optionnel : px entre les lettres (−10 à 100, défaut 0)
          "lineHeight": 1.25,      // optionnel : interligne en multiple de la taille (0,5 à 4, défaut 1)
          "underline": true,       // optionnels : souligné, barré, affichage en majuscules
          "strike": true,
          "uppercase": true,       // le texte saisi reste tel quel, seul l'affichage change
          "list": "bullet"         // optionnel : "bullet" (puces) ou "number" (numérotée) ; un paragraphe = une ligne saisie
        }
      ]
    }
  ]
}
```

L'**ombre** (`shadow`, tous les types ; une lueur est une ombre sans décalage) : `blur` 0 à 200, `offsetX` / `offsetY` −500 à 500 (dans les axes de la **page**, même si l'élément pivote), `opacity` 0 à 1. Une ombre incomplète ou hors bornes est ignorée ou ramenée aux bornes à la lecture ; une ombre sans effet visible (opacité 0, ou ni flou ni décalage) n'est pas dessinée.

La **protection** (`protect`, tout type d'élément) : `fixed` ou `fill`, toute autre valeur est retirée à la lecture. Tant qu'un élément est protégé, le document est « verrouillé » à l'ouverture (voir `docs/ARCHITECTURE.md`) ; ce n'est pas une sécurité. Aucune nouvelle version du format.

Le **cadre de composition** (`layoutFrame`, racine du document, optionnel) : `{ x, y, width, height }` en pixels de design, le rectangle de la page où vit la composition d'origine après un ou plusieurs Magic Resize (absent = toute la page). Il permet de revenir à un format sans rétrécir le contenu ; invalide, il est ignoré à la lecture. Aucune nouvelle version du format.

Les **polices en ligne et importées** (`fonts`, racine du document, optionnel) : `{ id: { name, family, category, license, variants: { "400": "<fichier de police en base64 : WOFF2, ou TTF/OTF/WOFF pour une police importée>", "700": … } } }` pour chaque police ajoutée (catalogue en ligne ou fichier importé) qu'un texte utilise (`fontFamily` = `family`). Elles sont ajoutées à l'enregistrement et retirées quand plus aucun texte ne s'en sert ; à l'ouverture elles sont rendues disponibles sans être installées. Entrées invalides ignorées (identifiant sûr, nom et famille sans guillemet ni chevron, variantes parmi `400` `700` `400-italic` `700-italic`, `400` obligatoire, 2 M caractères par variante, 16 polices au plus). Aucune nouvelle version du format.

Les **sources PDF** : `sources` (racine du document, optionnel) associe un identifiant à un PDF d'origine en base64 ; un fond d'image avec `pdfSource` est ré-exporté en vectoriel depuis cette source. Les sources non référencées sont retirées à l'enregistrement ; une source ou une référence invalide est ignorée à la lecture. Aucune nouvelle version du format.

Les **retouches d'image** (`crop`, `flipX`, `flipY`, `filters`, éléments `image` seulement ; l'image d'origine n'est jamais modifiée) : `crop` est la zone de l'image d'origine qui remplit la boîte de l'élément (`width` / `height` de l'élément sont donc la taille d'affichage de cette zone ; au moins 5 % de l'image dans chaque sens, image entière = champ absent). `filters` : `brightness`, `contrast`, `saturation` de −100 à 100, `grayscale` et `sepia` de 0 à 100, `blur` de 0 à 40 (pixels de design). Tout champ invalide ou neutre est retiré à la lecture. Aucune nouvelle version du format.

Le **dégradé** (`gradient`, rectangles, ellipses et formes) remplace `fill` tant qu'il est présent ; `fill` est conservé (c'est la couleur retrouvée en revenant à « Uni »). `type` vaut `linear` ou `radial`, `angle` est en degrés CSS (0 = vers le haut, 90 = vers la droite, 180 = vers le bas ; ignoré en radial). À la lecture, un dégradé incomplet ou de type inconnu est retiré et l'élément garde son `fill`. Aucune nouvelle version du format.

Le **contour** (`stroke`, `strokeWidth`, `strokeDashed`) existe pour tous les types ; il n'est conservé à la lecture que si la couleur est une chaîne non vide **et** l'épaisseur strictement positive (sinon les trois champs sont retirés). Pour un texte, c'est le contour des lettres.

Les champs de style de texte sont bornés à la lecture (`letterSpacing` −10 à 100, `lineHeight` 0,5 à 4) et les valeurs inattendues retirées ; `underline`, `strike` et `uppercase` ne sont écrits que lorsqu'ils valent `true`. Les indicateurs de calque `locked` et `hidden` ne sont écrits que lorsqu'ils valent `true` ; à la lecture toute autre valeur est ignorée (un `locked: "oui"` ne verrouille rien) et `name` est borné à 80 caractères. Aucune nouvelle version du format.

Les **repères** (`guides`, en pixels de design) sont enregistrés avec la page mais **jamais dessinés** dans les exports. À la lecture, une entrée invalide est ignorée sans refuser le fichier ; un champ absent ou vide signifie « aucun repère ». Ils ne demandent pas de nouvelle version du format.

Une **page** peut avoir sa propre `transition` (mêmes valeurs, `fade` compris : une page en fondu dans un document en glissement doit le dire) ; absente, elle hérite du document. La transition d'une page est jouée à l'arrivée sur elle ; en reculant, c'est celle de la page quittée.

Le champ `transition` du document (`none`, `slide`, `cover`, `zoom` ; absent = fondu) règle l'animation entre pages en présentation ; une valeur inconnue est ignorée. Pas de nouvelle version du format.

Les **notes de l'orateur** (`notes` sur une page) sont du texte libre, jamais dessiné dans les exports image / PDF. À la lecture, une valeur qui n'est pas un texte non vide est ignorée ; les caractères de contrôle sont retirés. Pas de nouvelle version du format.

### Champs par type

| Type      | Champs spécifiques                                                                 |
| --------- | ---------------------------------------------------------------------------------- |
| `rect`    | `cornerRadius`                                                                     |
| `ellipse` | aucun (dessinée dans la boîte `width × height`)                                    |
| `text`    | `text`, `fontSize`, `fontFamily`, `fontStyle`, `align`, `letterSpacing`, `lineHeight`, `underline`, `strike`, `uppercase`, `list` (la largeur impose le retour à la ligne ; `height` n'est qu'indicatif) |
| `image`   | `src` : **data URL base64 complète** (l'image est incorporée au fichier)            |
| `path`    | `path` : chemin SVG dans un viewBox **100×100**, étiré à `width × height` ; `fill` pour la couleur |

## Historique des versions

| Version | Changement                                                                  |
| ------- | --------------------------------------------------------------------------- |
| 1       | Document à plat : `background` et `elements` directement à la racine         |
| 2       | Pages multiples : `background` et `elements` déplacés dans `pages[]`         |

`migrateDocument()` (`store/editor.ts`) convertit v1 → v2 à l'ouverture. Un fichier v1 rouvert puis enregistré est réécrit en v2.

## Faire évoluer le format

1. Incrémenter `version` dans `types.ts` et dans `blankDoc()`.
2. Ajouter une étape dans `migrateDocument()` (v(n-1) → v(n)), en chaînant les migrations.
3. Les **champs optionnels ajoutés** (comme `groupId`, ou un nouveau champ visuel avec valeur par défaut) ne nécessitent pas de nouvelle version tant que leur absence a un sens.
4. Mettre à jour ce document.

## Validation à l'ouverture

`parseDocument()` (`store/editor.ts`) est le seul point d'entrée pour lire un fichier : JSON → vérification de la version (une version supérieure à 2 produit un message « créé avec une version plus récente de Trame ») → migration → vérification structurelle (dimensions, pages, id/type/coordonnées de chaque élément). Elle lève une `Error` au message affichable, montrée dans une boîte de dialogue : le document courant n'est jamais remplacé par un fichier invalide. Elle ne valide pas le détail des champs optionnels (voir [LIMITATIONS.md](LIMITATIONS.md)). **Toute nouvelle règle de format doit y être reflétée et testée.**
