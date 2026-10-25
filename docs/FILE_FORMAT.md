# Format de fichier `.trame`

Un fichier `.trame` est du **JSON UTF-8** : la sérialisation directe de `TrameDocument` (voir `src/renderer/src/types.ts`, source de vérité). Il n'est ni compressé ni chiffré.

## Version 2 (courante)

```jsonc
{
  "version": 2,
  "name": "Sans titre",
  "width": 1080,            // pixels de design, communs à toutes les pages
  "height": 1080,
  "pages": [
    {
      "id": "aB3xK9_q",
      "background": "#ffffff",
      "elements": [          // l'ordre = z-index (dernier = devant)
        {
          "id": "Qw8e_1Zt",
          "type": "text",    // rect | ellipse | text | image | path
          "x": 100, "y": 200, "width": 500, "height": 80,
          "rotation": 0,     // degrés, autour du coin haut-gauche
          "opacity": 1,
          "fill": "#1e1f24",
          "groupId": "k3J9aa01",   // optionnel : même valeur = même groupe
          // champs selon le type :
          "text": "Votre texte", "fontSize": 64,
          "fontFamily": "\"Inter\", sans-serif",
          "fontStyle": "bold",     // normal | bold | italic | "italic bold"
          "align": "left"          // left | center | right
        }
      ]
    }
  ]
}
```

### Champs par type

| Type      | Champs spécifiques                                                                 |
| --------- | ---------------------------------------------------------------------------------- |
| `rect`    | `cornerRadius`                                                                     |
| `ellipse` | aucun (dessinée dans la boîte `width × height`)                                    |
| `text`    | `text`, `fontSize`, `fontFamily`, `fontStyle`, `align` (la largeur impose le retour à la ligne ; `height` n'est qu'indicatif) |
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
