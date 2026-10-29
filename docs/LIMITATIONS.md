# Limitations connues et dette technique

État au MVP (v0.1.0). Classées par gravité pour le mainteneur. « Non testé » signifie qu'aucune vérification n'a été faite.

## Qualité et outillage

- **Tests unitaires limités à la logique pure** (Vitest, `npm test`) : `geometry.ts`, le store (éléments, historique, sélection/groupes, calques, alignement, pages), `migrateDocument`, cohérence des modèles et des formes. **Rien ne teste l'interface** : `Canvas.tsx` (glisser, redimensionner, lasso, édition de texte), les exports (`renderPage`, PDF), l'IPC et le process principal. Un test de fumée (`npm run smoke`) couvre le pont IPC, les récents et la sortie de l'application, mais pas l'interface visuelle (Playwright + Electron serait la piste).
- **Pas de linter ni de formateur** (ESLint/Prettier non configurés).
- **Pas d'intégration continue.**
- **Packaging macOS limité** (voir [PACKAGING.md](PACKAGING.md)) : Apple Silicon uniquement, build quotidien signé « ad hoc » (avertissement Gatekeeper sur les autres Macs) ; `npm run release:mac` produit une version signée Developer ID et notarisée (vérifiée sur cette machine, pas sur un autre Mac), `appId` provisoire, icône provisoire, pas de mise à jour automatique, icône de document = icône de l'app. Aucun packaging Windows/Linux.
- Le bundle du renderer est volumineux (~2,4 Mo hors polices) : aucun découpage de code.

## Plateformes

- Développé et utilisé uniquement sur **macOS**. Windows et Linux : **non testés**. Points macOS connus : `titleBarStyle: 'hiddenInset'` et marge de 84 px à gauche de la barre d'outils (boutons de fenêtre), raccourcis écrits pour `⌘` (`Ctrl` est géré dans le code, non vérifié).

## Risques de perte de données

- **Pas d'enregistrement automatique** ni de récupération après un plantage de l'appli ou de la machine.
- Les confirmations (Nouveau, Ouvrir, appliquer un modèle, fermer la fenêtre) reposent sur l'indicateur `dirty`, qui passe à `true` à toute modification, **y compris un annuler qui ramène le document à son état enregistré** : une confirmation peut donc être demandée alors que rien n'a réellement changé.
- La validation à l'ouverture (`parseDocument`) vérifie la **structure** (version, dimensions, pages, type et coordonnées des éléments), pas la cohérence du contenu : un `src` d'image invalide, une couleur incorrecte ou un `path` SVG illisible sont acceptés.
- Le champ `name` du document n'est pas modifiable dans l'interface (il sert de nom par défaut à « Enregistrer sous » et aux exports et reste « Sans titre » ou le nom du modèle).

## Association de fichiers

- **macOS uniquement** (événement `open-file`) ; Windows/Linux ne transmettent pas le chemin du fichier à l'application.
- Seul le **dernier** fichier est ouvert quand plusieurs sont sélectionnés dans le Finder (un document à la fois).
- Ouvrir un fichier alors que le document courant a des modifications non enregistrées affiche la confirmation habituelle ; si l'utilisateur annule, le fichier envoyé par le Finder est simplement ignoré.
- Fonctionne avec l'application **installée/empaquetée** ; le mode `npm run dev` n'est pas associé aux `.trame`.

## Projets récents

- Liste limitée à 12 entrées, sans **aperçu** du design : seuls le nom, le dossier et la date de modification du fichier sont affichés.
- **Intégration macOS partielle** : le menu « Ouvrir récent » du Dock est alimenté (`app.addRecentDocument`) mais il est géré par macOS : il ne suit pas le retrait d'une entrée depuis l'onglet « Récents » (seul « Effacer la liste » le vide aussi), et il est indépendant de la liste de Trame.
- Un projet **déplacé ou renommé** dans le Finder est vu comme introuvable (le chemin est la seule clé). Un disque externe débranché produit le même message.
- Le fichier de la liste est partagé entre toutes les instances de l'application (une seule fenêtre est gérée aujourd'hui).

## Modèles personnels

- Un modèle se **renomme** (✎) et se **remplace** (retoucher puis « Remplacer ») mais **ne se modifie pas en place** : il faut l'appliquer, retoucher le document, puis enregistrer. Pas d'historique : remplacer écrase définitivement l'ancienne version d'un modèle personnel (pas d'annulation).
- Le lien « document ↔ modèle d'origine » (`templateOrigin`) n'existe qu'en **mémoire** : après un redémarrage, ou si l'on rouvre le document depuis un fichier `.trame`, l'application ne propose plus de remplacer le modèle d'origine (« Nouveau modèle » reste possible).
- Un modèle contient une **copie complète** du design, images comprises (base64) : il peut être volumineux, et il n'y a pas de limite d'espace ni de nettoyage automatique (seule garde : 64 Mo par modèle).
- Pas de catégories ni de recherche dans « Mes modèles » ; l'ordre est du plus récent au plus ancien.
- Les modèles sont **locaux à la machine et à l'utilisateur** (dossier de données de l'application) : pas d'import/export, de partage ni de synchronisation. Désinstaller l'application n'efface pas ce dossier ; le supprimer efface les modèles.
- La miniature n'est faite que de la première page.
- Les modèles intégrés (`templates.ts`) ne sont jamais modifiés sur le disque : « supprimer » les **masque** (restaurables) et « renommer » ou « remplacer » crée une **version personnelle** à leur place. Conséquences : cette version part dans « Mes modèles » (elle quitte sa catégorie d'origine) ; si une future version de Trame améliore ou retire le modèle intégré, **la version personnelle garde l'ancien contenu** (aucune fusion) ; un modèle intégré retiré du code dont une version personnelle subsiste devient un modèle personnel ordinaire. Les modèles masqués sont mémorisés par utilisateur.

## Éditeur

- **Texte : la hauteur stockée est indicative.** Konva calcule la hauteur réelle selon le retour à la ligne, mais `boundsOf`, l'alignement vertical, le lasso et les miniatures s'appuient sur `element.height`. Les alignements verticaux et le lasso sont donc approximatifs pour des textes sur plusieurs lignes.
- Changer le format de page (`setSize`) **ne redimensionne ni ne repositionne** les éléments (pas de « Magic Resize »), et s'applique à toutes les pages.
- Redimensionner un texte modifie sa boîte, pas sa taille de police ; en sélection multiple, le texte est étiré avec le Transformer puis la boîte est figée.
- **Calques** : le verrouillage ne concerne que la position (pas le style ni le contenu) et se règle élément par élément (verrouiller un membre d'un groupe ne verrouille pas les autres) ; masquer un élément ne le retire pas d'un groupe ; le panneau n'affiche pas les groupes en arborescence repliable ; pas de multi-sélection par Maj+clic de plage dans le panneau (Maj+clic ajoute un à un) ; un calque masqué ne peut pas être manipulé sur le canvas.
- Groupes **à plat** : pas d'imbrication, pas d'édition d'un membre sans dissocier.
- **Aimantation** : au redimensionnement, seules les poignées de **côté** s'accrochent (pas les coins, qui doivent garder les proportions) et uniquement **sans rotation** ; pas d'affichage des distances ni d'aimantation aux **espacements égaux** (« smart spacing ») ; les rotations utilisent la boîte englobante, pas le contour réel ; la hauteur d'un texte est celle enregistrée (indicative), donc son bord bas peut s'accrocher un peu à côté du texte réel. Les repères sont **par page** (pas de repères globaux), sans verrouillage, et les règles sont toujours en pixels (pas d'autre unité). Pas de grille ni de marges de sécurité (E19).
- Zoom et déplacement : la vue n'est pas conservée par document (réajustée à l'ouverture), le zoom n'est pas centré sur la sélection, et le pincement n'a été pensé que pour un trackpad Mac (molette de souris : ⌘+molette pour zoomer). Pas de règles ni de guides d'alignement magnétiques, pas de verrouillage ni de masquage de calques.
- Polices en ligne : sous-ensemble **latin** seulement (pas de caractères cyrilliques, grecs, asiatiques…) ; 4 variantes au plus (normal, gras, italique, gras italique : pas de graisses intermédiaires) ; polices variables prises à leurs graisses 400 et 700 ; un modèle personnel n'embarque pas encore ses polices en ligne (seuls les documents enregistrés le font) ; un document en contenant plusieurs devient plus lourd (≈ 25 Ko par variante) ; Polices importées : 1,5 Mo par fichier au plus, ni collections (.ttc) ni fichiers de plus de 4 variantes par famille (graisses intermédiaires ignorées) ; la licence est contrôlée seulement par le champ d'intégration (`fsType`) du fichier : la vérifier reste à la charge de l'utilisateur.
- Photos en ligne : Openverse et Wikimedia Commons uniquement (pas de photos « premium » ; Commons est surtout encyclopédique et documentaire, moins « stock »), 20 résultats par page, limite de requêtes du service pour les usages anonymes, résultats et qualité variables (photos d'amateurs, parfois hors sujet) ; la recherche n'est pas traduite (l'anglais donne plus de résultats) ; le comportement face au vrai service n'a pas pu être vérifié pendant le développement (voir `docs/ARCHITECTURE.md`).
- Rechercher et remplacer : seulement les **textes** des éléments (pas les noms de calques, les crédits ni le texte des images) ; pas d'expressions régulières ; le texte tapé dans un élément en cours de saisie n'est pas pris en compte tant qu'on n'en est pas sorti ; la liste de résultats affiche les 60 premières occurrences.
- Mode présentation : transitions (fondu, glissement, recouvrement, zoom ou aucune) réglables par document et par page ; celle d'une page est jouée à l'arrivée sur elle, et en reculant c'est celle de la page quittée qui est rejouée à l'envers ; une seule durée (0,45 s) et pas de choix de direction ; exportées vers PowerPoint (`<p:transition>` ajouté au XML de chaque diapositive, non vérifié dans PowerPoint lui-même) et reprises à l'import (les effets de PowerPoint autres que fondu / poussée / recouvrement / zoom deviennent un fondu, « aucune » reste « aucune » ; la transition la plus fréquente devient celle du document), notes de l'orateur en texte brut (touche N), pointeur laser (touche L ou bouton « Laser » : point rouge avec courte traînée, jamais enregistré ; il n'apparaît que sur l'écran du public, pas sur l'écran de l'orateur ; Échap quitte la présentation même s'il est actif), pas d'annotation à l'écran, pas de vidéo ni d'animation d'éléments. **Écran de l'orateur** (seconde fenêtre, touche S) : page courante, page suivante, notes (taille réglable), chronomètre, heure, commandes ; le placement sur deux écrans (présentation sur l'écran non principal, écran de l'orateur sur l'écran principal, bouton « Échanger les écrans ») et le plein écran du système **ne sont pas vérifiés par les tests automatiques** (une seule machine à un écran) ; avec un seul écran, la présentation reste dans sa fenêtre (pas de plein écran) pour que les deux fenêtres restent visibles ; le chronomètre n'est ni minuté ni alarmé ; les notes ne sont pas modifiables depuis cet écran.
- Export des pages en images : le rendu se fait dans l'interface, une page après l'autre, et l'archive ZIP est construite en mémoire puis transmise d'un bloc : un document de très nombreuses pages en grande taille (×3, 50 pages et plus) peut être lent et gourmand en mémoire.
- Modèles de marque verrouillés : simple aide à la cohérence (le fichier reste modifiable par n'importe qui, aucun chiffrement ni signature) ; pas de rôles ni de mot de passe ; un modèle intégré à l'application n'est pas verrouillé ; pas de « zone texte » qui garderait une mise en page (le texte « à remplir » garde sa boîte, pas son interligne si l'on change beaucoup de texte).
- Magic Resize : la composition est mise à l'échelle et centrée, pas recomposée (voir `docs/ARCHITECTURE.md`) ; un élément ajouté ou déplacé dans les bandes après un changement de format suit le même cadre : il retrouve sa place relative en revenant au format d'origine.
- Export PPTX : polices de Trame non embarquées (remplacées si absentes de l'ordinateur d'ouverture) ; dégradés, formes vectorielles, images retouchées et images avec contour ou ombre exportés **en image** (non modifiables) ; pas de contour de lettres ; l'interligne et la position verticale du texte diffèrent légèrement de Trame (PowerPoint mesure autrement) ; l'import PPTX existe (voir ci-dessous).
- Import PPTX : tableaux, graphiques, SmartArt, objets intégrés, traits diagonaux, SVG/EMF, formes à arcs et rotation de groupe non repris (signalés) ; un seul style par bloc de texte (celui du premier passage) ; héritage de style limité au premier niveau de liste du masque ; formes sans remplissage peintes de la couleur du fond ; polices remplacées par les 10 embarquées. Les fichiers ne sont pas validés au-delà de ce qui est lu : un fichier PowerPoint exotique peut donner un résultat approximatif.
- Import PDF : texte horizontal seulement (le texte pivoté reste dans l'image de fond) ; pas d'édition des dessins vectoriels ni des images du PDF (ils sont dans l'image de fond) ; polices remplacées par la plus proche des 10 embarquées ; pas de tableaux ni de colonnes réagencées ; polices non embarquées du PDF rendues avec les polices du système ; PDF protégé par mot de passe refusé ; 50 pages au plus. À l'export : en mode « texte modifiable », le fond importé est une image (le texte reconstruit, lui, reste vectoriel) ; en mode « page en image », la page d'origine est ré-exportée en **vectoriel** (sauf page tournée, fond retouché ou PDF de plus de ~40 Mo, qui gardent l'image). Le PDF d'origine est stocké dans le fichier `.trame` (qui grossit d'autant).
- Images : le recadrage se règle en pourcentages (pas encore de poignées sur le canvas), pas de redressement ni de cadres/masques en forme, pas de réglages de teinte ou de netteté ; le flou estompe les bords de l'image. Une image retouchée est intégrée au PDF en PNG (plus lourd qu'un JPEG d'origine). Le miroir ne s'applique qu'aux images.
- Texte : un seul style par bloc (pas de mise en forme partielle d'un mot), listes simples (un seul niveau, puce « • » ou « 1. » fixes, retrait proportionnel à la police, pas de réglage du retrait ni du style de puce), pas de texte justifié, pas de contour ni d'ombre (E1, E3). Les majuscules suivent les règles du français (`ß` devient `SS`). Soulignement et barré gardent l'épaisseur et la position de Konva : pas de réglage de style (pointillés, ondulé) ni de couleur distincte.
- Changer de page n'est pas annulable.
- Copier-coller : pas de collage de contenu riche (HTML, SVG) venant d'ailleurs, le texte collé perd sa mise en forme, et le format de presse-papiers Trame n'est pas versionné au-delà de `{ trame: 1 }`. Le collage d'un élément entre deux documents de formats différents ne remet pas à l'échelle.

## Images et performances

- Les images sont stockées en **data URL base64 dans le JSON** : +33 % de taille, fichiers `.trame` lourds avec de grandes photos, et **chaque cran d'historique référence ces chaînes** (mémoire). Piste : stocker les images à part (dossier/asset store ou archive zip) et ne garder qu'une référence dans le JSON.
- Aucune limite ni redimensionnement à l'import d'image.
- Les pages sont rendues à la **taille du design** (1 px = 1 px) ; pas d'export haute résolution (@2x) ni d'option de qualité JPG.
- L'export PDF s'exécute dans le thread de l'interface (rapide en pratique : ~50 ms par modèle, ~200 ms pour une page chargée de replis en image) ; un document de nombreuses pages avec de grandes images peut figer brièvement l'interface.

## Export

- **PDF vectoriel avec replis** : le texte est sélectionnable sauf pour les éléments qui retombent sur une image (police système ou inconnue — typiquement les documents créés avant les polices embarquées —, graisse ou italique que la famille n'a pas, caractère hors du sous-ensemble **latin** : emoji, cyrillique, grec, symboles comme « ✓ » ou « ≈ »). L'utilisateur est prévenu **pendant l'édition** (pastille sur le canvas, encart avec correction dans le panneau, compteur sur « Export PDF ») **et après l'export** (boîte d'information). Réserves : la pastille est posée au coin de la boîte du texte (dont la hauteur enregistrée est indicative) et non au bout du texte réel ; les miniatures de la barre de pages et des modèles ne sont pas marquées ; l'avertissement arrive ~¼ s après la dernière frappe ; la correction automatique n'existe pas pour un caractère absent (à remplacer à la main). Pas d'avertissement pour l'export PNG/JPG (tout y est image).
- **Fidélité au sous-pixel** : le texte vectoriel s'aligne à (0, 0) pixel de l'image Konva, mais la composition glyphe par glyphe utilise les largeurs de la police brute alors que le navigateur mesure les siennes : le texte **centré ou aligné à droite** peut différer d'environ 1 px (mesuré sur un bouton centré). Les lignes très longues cumulent un écart de crénage théoriquement plus grand, non observé dans les modèles. Le lissage des contours diffère entre navigateur et lecteurs PDF.
- **Ligne de base** : reprise de Konva 10 (métriques de police du navigateur) ; une montée de version de Konva qui changerait cette formule déplacerait le texte du PDF — `npm run fidelity` le détecte.
- **PDF et images** : PNG et JPEG sont intégrés à leur **résolution d'origine** (un PDF peut donc être lourd avec de grandes photos) ; GIF, WebP et SVG sont ré-encodés en PNG. Pas de compression ni de rééchantillonnage.
- `npm run fidelity` est réservé à macOS (PDFKit) et n'est pas exécuté automatiquement.
- Menu Exporter : PNG, JPG et SVG exportent la **page courante** ; « Plusieurs pages… » exporte toutes les pages ou une sélection, en archive ZIP ou dans un dossier.
- **SVG** : dessin vectoriel (formes, dégradés, ombres, contours, textes en vrai `<text>` avec les polices utilisées incorporées en base64, images retouchées en `<image>`). Pas de conversion du texte en tracés (une police non incorporée serait remplacée par celle du système ; les polices système comme Helvetica Neue ne sont pas incorporées), les images gardent leur résolution d'origine (un SVG avec de grandes photos est lourd), une ombre est un filtre `feDropShadow` (rendu proche mais non identique selon le logiciel : Illustrator, Figma, Inkscape), le crénage est désactivé quand un interlettrage est réglé (comme à l'écran). Une police incorporée n'est pas réduite aux caractères utilisés.
- **Export vers un dossier** : un fichier par page, sans sous-dossier ni modèle de nom personnalisé ; le renderer n'écrit que des fichiers `png`, `jpg` ou `svg` à nom simple dans le dossier choisi par l'utilisateur. Les fichiers déjà présents sont remplacés après confirmation.
- Le nom de fichier d'export vient de `doc.name`, non modifiable (voir plus haut).

## Dette technique à connaître

- **Quatre rendus parallèles** (Canvas, `renderPage`, `exportPdf`, `PageThumb`) à maintenir à la main (voir [ARCHITECTURE.md](ARCHITECTURE.md)). Une abstraction commune (liste de « primitives de dessin ») les unifierait.
- `shapes.ts` utilise **`ctx._context`**, une API **non publique** de Konva : à revérifier à chaque montée de version majeure de Konva.
- `migrateDocument(raw: any)` utilise `any` ; typage à durcir avec une validation de schéma (par ex. zod).
- `Canvas.tsx` concentre beaucoup de responsabilités (rendu, drag, transformation, lasso, édition de texte) : candidat au découpage.
- Les modèles de départ sont codés en dur dans `templates.ts` ; les modèles personnels n'ont ni import ni export.
- Les versions de dépendances sont très récentes (TypeScript 7, Vite 8, Electron 45, React 19) : lire les notes de version avant toute montée de version majeure. Exemple déjà rencontré : TypeScript 7 refuse l'option `baseUrl` (les alias passent par `paths` avec des chemins relatifs).
- Accessibilité et internationalisation : textes de l'interface en français, directement dans les composants (pas de couche i18n) ; pas de navigation clavier complète ni de support lecteur d'écran sur le canvas.
- `FEATURES.md` est un document de recherche sur Canva, pas une spécification validée.
