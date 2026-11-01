# Trame

Éditeur de design de bureau, **100 % hors-ligne**, inspiré de Canva. Compose des visuels (posts, stories, présentations, affiches) avec du texte, des formes et des images, sur une ou plusieurs pages, et exporte en PNG, JPG ou PDF.

> État : MVP fonctionnel (v0.1.0). Aucune donnée ne quitte la machine : pas de compte, pas de serveur, pas de requête réseau.

## Fonctionnalités

- Éléments : texte, rectangle, ellipse, 12 formes vectorielles, images locales
- Copier / couper / coller des éléments (entre pages et entre documents), coller une image ou du texte venant d'une autre application
- Import de ses propres polices (TTF, OTF, WOFF, WOFF2), licence d'intégration contrôlée, embarquées dans les documents
- Catalogue de polices en ligne (~1 900 polices libres, installées sur demande, embarquées dans les documents)
- Recherche de photos libres de droits (Openverse, avec Wikimedia Commons en secours ; en ligne, sur demande ; la photo est copiée dans le document, crédit conservé)
- Import PowerPoint (.pptx) : textes, formes, images, groupes, thème et masque
- Rechercher et remplacer dans tous les textes (⌘F) : casse, mot entier, accents, un seul ⌘Z pour tout annuler
- **Texte alternatif des images** (saisi ou proposé par IA), repris dans les exports PowerPoint et SVG ; alerte « image sans description » (⚠ sur les pages, case « image décorative », « Décrire toutes » par IA)
- **Publipostage** : écrivez `{{prénom}}` dans un texte, choisissez un tableau CSV, et Trame produit une fiche par ligne (diplômes, badges, étiquettes…) en un PDF (une fiche par page ou **plusieurs par feuille**, étiquettes et badges, avec versos en miroir) ou un PDF par ligne ; choix des lignes par plage ou par filtre (« Classe = 6A ») ; tout reste sur le poste ; **planches du commerce** (Avery L7160…, 5160…, cartes de visite, A6, A7) avec réglage fin du décalage ; noms trop longs qui rétrécissent au lieu de passer à la ligne ; **photos par ligne** (une colonne donne le nom du fichier image, pris dans un dossier) ; les derniers choix d'export sont retrouvés à la réouverture du fichier
- **Présentation web** : « Exporter → Présentation web (.html) » produit **un seul fichier** à ouvrir dans n'importe quel navigateur, sans Trame ni connexion (cours déposé sur un ENT, envoyé par courriel ou lu sur une clé USB) : flèches, clic, balayage tactile, plein écran, lien direct vers une page (`#3`), transitions comme dans l'éditeur, texte réel et polices incorporées
- **Impression pratique** : « Exporter → Livret et impression groupée » produit un PDF prêt à imprimer, **livret** (feuilles A4 ou Lettre recto-verso à plier en deux et agrafer, pages complétées par des blanches jusqu'à un multiple de 4, trait de pli facultatif) ou **2, 4, 6 ou 9 pages par feuille** (polycopiés), textes toujours en vrai texte
- **Historique des versions** : une version du fichier est gardée à chaque enregistrement (et l'état d'avant une écrasure), sur l'ordinateur ; bouton 🕘 de la barre d'outils ou Fichier → « Historique des versions… » : aperçu, **revenir à une version** (annulable), l'**ouvrir comme copie**, en **nommer** une (« Rendu au prof »)
- **Graphiques et tableaux** : barres, barres horizontales, courbe, secteurs et tableau, à partir de vos données (CSV : colonne des étiquettes, une ou plusieurs colonnes de valeurs) ; palette adaptée au daltonisme, thème clair ou sombre ; dessinés avec des formes et des textes ordinaires, donc modifiables à la main et exportés partout (PDF en vrai texte, PowerPoint, SVG, page web)
- **Accessibilité et lisibilité** : onglet « Accès » qui contrôle le **contraste** des textes (WCAG 2 AA, avec correction en un clic), leur **taille**, leur **ordre de lecture** et les images sans description ; **lecture facilitée** (Atkinson Hyperlegible, Lexend ou OpenDyslexic, sans italique, interligne 1,5, lettres espacées) sur la sélection, la page ou tout le document ; **simulation de la vision des couleurs** (protanopie, deutéranopie, tritanopie, niveaux de gris) à l'écran
- **Panneau IA en trois sous-onglets** (Images, Texte, Descriptions), pastille d'alerte sur l'onglet quand des images n'ont pas de description
- **Aide à la rédaction par IA** (reformuler, raccourcir, corriger, traduire…, aussi directement dans les propriétés d'un texte) et **images générées, retouchées ou déclinées en variantes par IA** (facultatif, service en ligne avec votre propre compte) : Cloudflare Workers AI (quota gratuit quotidien) ou OpenAI ; les identifiants sont chiffrés par le système et l'image est copiée dans le document
- Interface en **français, anglais, allemand et espagnol**, au choix en bas de la barre latérale, changement immédiat ; autres langues faciles à ajouter ([docs/I18N.md](docs/I18N.md))
- Mode présentation plein écran (F5), avec pointeur laser (L) et annotation à l'écran au stylo ou au surligneur (D) : navigation clavier et souris, écran noir, lecture automatique en boucle, transitions par document ou par page (fondu, glissement, recouvrement, zoom), exportées vers PowerPoint, notes de l'orateur (touche N), pointeur laser (touche L), écran de l'orateur dans une seconde fenêtre (touche S : page suivante, notes, chronomètre)
- Interface adaptable : panneaux latéraux et liste des pages redimensionnables (poignées, double-clic = taille par défaut) et masquables (◧ ◨, ⌘⌥1 / ⌘⌥2 / ⌘⌥3), les panneaux masqués réapparaissent au survol du bord de la fenêtre ; en fenêtre étroite ils passent automatiquement en recouvrement, et la barre d'outils reste sur une seule ligne (repli dans des menus)
- Notes de l'orateur par page (panneau sous le canevas), exportées et importées avec PowerPoint
- Menus « Importer » (PDF, PowerPoint) et « Exporter » (PDF, PowerPoint, PNG, JPG, pages) dans la barre d'outils
- Menu « Exporter » unique : PDF, PowerPoint, PNG, JPG, images de plusieurs pages
- Export de toutes les pages (ou d'une sélection) en PNG / JPG (jusqu'à ×3) ou en SVG vectoriel, en archive ZIP ou dans un dossier
- Export SVG de la page courante (textes en vrai texte, polices incorporées) depuis le menu Exporter
- Export PowerPoint (.pptx) : textes, formes et images modifiables dans PowerPoint, Keynote ou Google Slides
- Import de PDF : texte reconstruit en blocs modifiables, ou pages à annoter (la page d'origine reste vectorielle à l'export)
- Kit de marque : couleurs, polices et logos enregistrés, couleurs récentes, pipette
- Listes à puces et numérotées (retrait des lignes suivantes, texte vectoriel dans le PDF)
- Modèles de marque verrouillés : éléments figés ou à remplir, remplacement d'image en gardant la place
- Magic Resize : changer le format de la page en adaptant le contenu (composition conservée et centrée, décors gardés sur leurs bords)
- Nom du document modifiable (nom des exports et du fichier)
- Images : recadrage, miroirs, filtres (luminosité, contraste, saturation, noir et blanc, sépia, flou)
- Ombres portées et lueurs (l'ombre est une image sous un élément resté vectoriel dans le PDF)
- Dégradés linéaires et radiaux (formes, rectangles, ellipses), vectoriels dans le PDF
- Contour (couleur, épaisseur, tirets) sur formes, images et lettres
- Typographie : interlettrage, interligne, souligné, barré, majuscules, avec export PDF fidèle
- Panneau Calques : ordre de superposition par glisser-déposer, masquer, verrouiller (⌘L), renommer
- Règles graduées, repères d'alignement (glissés depuis les règles), aimantation aux bords, centres et repères ; position et taille numériques
- Sélection multiple (lasso, Maj+clic, ⌘A), groupes, alignement et répartition, ordre des calques
- Pages multiples (ajout, duplication, suppression, réordonnancement par glisser-déposer)
- 10 modèles de départ, dont 4 modèles de **publipostage** (diplôme, badge nominatif, étiquette, carte de vocabulaire recto-verso, livrés avec un tableau d'exemple) et **modèles personnels** (enregistrer n'importe quel design, toutes pages comprises) ; tous les modèles se renomment, se masquent ou se remplacent par une version retouchée, l'original restant rétablissable, 10 polices embarquées
- Zoom (10 % à 800 %) et déplacement du canvas : pincement, ⌘+molette, barre d'espace
- Annuler / rétablir (100 niveaux)
- Projets récents (liste persistée, onglet « Récents », menu « Ouvrir récent » du Dock) et ouverture par double-clic sur un `.trame` dans le Finder (app installée, macOS)
- Protection contre la perte de données : confirmation avant de remplacer ou fermer un document modifié, validation des fichiers à l'ouverture
- Projets enregistrés en fichiers `.trame` ; export PNG / JPG (page courante) et PDF vectoriel (toutes les pages, texte sélectionnable), avec avertissement en direct quand un texte ne pourra pas être sélectionnable dans le PDF

Raccourcis : `⌘Z` / `⇧⌘Z` annuler / rétablir · `⌘C` / `⌘X` / `⌘V` copier / couper / coller · `⌘D` dupliquer · `⌘A` tout sélectionner · `⌘G` / `⇧⌘G` grouper / dissocier · `⌘N` / `⌘O` / `⌘S` / `⇧⌘S` nouveau / ouvrir / enregistrer / enregistrer sous · `Suppr` supprimer · flèches déplacer (`Maj` = 10 px) · `Échap` désélectionner · `⌘+` / `⌘-` zoom · `⌘0` ajuster à la fenêtre · `⌘1` taille réelle · `Espace` + glisser (ou clic molette) déplacer la vue · `⇧R` / `⇧G` / `⇧A` règles / repères / aimantation · pendant un glisser : `⌘` suspend l'aimantation, `Maj` bloque l'axe, `Alt` duplique.
(Sous Windows/Linux, `Ctrl` remplace `⌘` et s'affiche comme tel ; ces plateformes se construisent mais n'ont pas été testées sur une vraie machine, voir [limitations](docs/LIMITATIONS.md).)

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
| `npm run pack`      | Construit `dist/mac-arm64/Trame.app` (test rapide du packaging)    |
| `npm run dist`      | Construit le `.dmg` et le `.zip` macOS dans `dist/`                |
| `npm run dist:win`  | Installeur Windows (`.exe` NSIS) et `.zip` portable, x64           |
| `npm run dist:linux` | `.AppImage` et `.tar.gz` Linux, x64                               |
| `npm run fidelity`  | Compare le PDF vectoriel à l'image de l'éditeur, pixel à pixel (macOS) |
| `npm run release:check` | Vérifie les prérequis de signature et de notarisation (rien n'est construit) |
| `npm run release:mac` | Publie : signe (Developer ID), notarise, agrafe, vérifie (macOS) |
| `npm run smoke`     | Test de bout en bout : lance l'appli construite et vérifie IPC, récents, sortie (macOS) |
| `npm test`          | Tests unitaires (Vitest) ; `npm run test:watch` en continu         |

### Installer l'application

`npm run dist` produit `dist/Trame-<version>-arm64.dmg` (Apple Silicon) signé « ad hoc » : sur un autre Mac, il faudra clic droit → *Ouvrir*. Pour une version **signée et notarisée** (qui s'ouvre normalement partout), voir `npm run release:mac` ; mise en place et marche à suivre : [docs/PACKAGING.md](docs/PACKAGING.md).

### Dépannage

- **`Error: Electron uninstall`** au lancement : le binaire Electron n'a pas été téléchargé pendant `npm install`. Lancer `node node_modules/electron/install.js`, puis relancer.
- **L'appli quitte immédiatement sans rien afficher** : la variable `ELECTRON_RUN_AS_NODE` est définie dans votre shell. Lancer avec `env -u ELECTRON_RUN_AS_NODE npm run dev`.
- **`Port 5173 is in use, trying another one`** : sans gravité, Vite choisit un autre port tout seul.

## Stack

| Rôle                  | Technologie                                           |
| --------------------- | ----------------------------------------------------- |
| Application desktop   | Electron 45                                           |
| Outillage / build     | electron-vite 6, Vite 8                               |
| Interface             | React 19, TypeScript 7                                |
| Canvas                | Konva 10 + react-konva                                |
| État                  | Zustand 5                                             |
| Export PDF            | pdf-lib + fontkit (texte vectoriel, polices en sous-ensemble) |
| Tests                 | Vitest 4                                              |
| Packaging macOS       | electron-builder                                      |
| Polices embarquées    | @fontsource (sous-ensemble latin)                     |
| Identifiants          | nanoid                                                |

## Organisation du dépôt

```
src/
  main/index.ts          Processus principal Electron : fenêtre, dialogues, accès disque, presse-papiers (IPC)
  main/closeGuard.ts     Machine à états de la fermeture avec modifications non enregistrées
  main/recents.ts        Logique pure de la liste des projets récents
  main/fileInbox.ts      Fichiers ouverts par le système en attente d'un renderer prêt
  main/userTemplates.ts  Logique pure des modèles personnels (validation, index)
  preload/index.ts       Pont sécurisé exposé au renderer : window.trame
  renderer/
    index.html           Point d'entrée + Content-Security-Policy
    src/
      main.tsx           Charge les polices, puis monte React
      App.tsx            Mise en page et raccourcis clavier
      types.ts           Modèle de données (TrameDocument, TramePage, TrameElement)
      store/editor.ts    Store Zustand : document, sélection, historique, toutes les actions
      store/view.ts      Zoom et déplacement du canvas (état de vue, non enregistré)
      geometry.ts        Calculs purs : boîtes englobantes, alignement, répartition
      shapes.ts          Bibliothèque de formes vectorielles + dessin Konva
      templates.ts       Modèles de départ
      fonts.ts           Polices embarquées et préchargement
      exportPages.ts     Rendu hors écran d'une page (export PNG/JPG, miniatures)
      pdfExport.ts       Export PDF vectoriel (pdfMath.ts, pdfFonts.ts, fontkit.ts)
      i18n.ts            Langue courante, useT() et t() (voir docs/I18N.md)
      components/        Canvas, Toolbar, Sidebar, Properties, PageStrip, PageThumb
  shared/i18n/         Cœur de la traduction et catalogues (fr, en, de, es), partagés avec le processus principal
build/                   Icône de l'application (icon.icns, icon.png)
scripts/make-icon.py     Génère l'icône
scripts/smoke-test.mjs   Test de fumée de bout en bout
scripts/pdf-fidelity/    Fidélité de l'export PDF (comparaison pixel à pixel)
docs/                    Documentation détaillée (voir ci-dessous)
vitest.config.ts         Configuration des tests (tests à côté du code : `*.test.ts`)
FEATURES.md              Notes de référence sur les fonctionnalités de Canva (pas de la doc technique)
```

## Documentation

- [Feuille de route](docs/ROADMAP.md) : fonctionnalités de Canva (`FEATURES.md`) à implémenter, triées selon le prérequis hors-ligne
- [Architecture](docs/ARCHITECTURE.md) : processus, flux de données, store, historique, rendu
- [Format de fichier `.trame`](docs/FILE_FORMAT.md) : schéma, versions, migration
- [Langues de l'interface](docs/I18N.md) : traductions, ajouter une langue
- [Packaging et distribution](docs/PACKAGING.md) : macOS (`.dmg`, signature, notarisation), Windows, Linux, pièges
- [Étendre l'appli](docs/EXTENDING.md) : ajouter un type d'élément, un modèle, une police, une action
- [Limitations connues et dette technique](docs/LIMITATIONS.md) : à lire avant de modifier le code
