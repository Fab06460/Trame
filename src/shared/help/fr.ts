import type { HelpContent } from './types'

/** Contenu de l'aide en français (langue de référence). Rester fidèle au README : chaque rubrique décrit ce que l'application fait. */
export const fr: HelpContent = {
  groups: [
    { id: 'start', title: 'Premiers pas' },
    { id: 'create', title: 'Créer' },
    { id: 'present', title: 'Présenter' },
    { id: 'share', title: 'Exporter et imprimer' },
    { id: 'care', title: 'Relire et protéger son travail' },
    { id: 'ref', title: 'Référence' }
  ],
  topics: [
    {
      id: 'start',
      group: 'start',
      title: 'Prendre en main Trame',
      keywords: 'débuter commencer nouveau document page',
      body: [
        { p: 'Trame est un éditeur de visuels **hors ligne** : posts, affiches, présentations, documents. Rien ne quitte votre ordinateur : pas de compte, pas de serveur.' },
        { p: 'L\'écran se compose de la **barre d\'outils** en haut, de la colonne d\'onglets et de son panneau à gauche (modèles, éléments, icônes, photos…), de la **page** au centre, du panneau des **propriétés** à droite (il suit la sélection) et de la **liste des pages** en bas.' },
        {
          steps: [
            'Choisissez un **modèle** dans l\'onglet « Modèles », ou partez d\'une page vide.',
            'Ajoutez du **texte**, des **formes**, des **icônes** ou des **images** depuis la barre d\'outils et les onglets de gauche.',
            'Cliquez un élément pour le sélectionner : ses réglages apparaissent à droite. Glissez-le pour le déplacer, tirez les poignées pour le redimensionner.',
            'Ajoutez des pages dans la liste du bas, puis **enregistrez** avec ⌘S : le document devient un fichier `.trame`.'
          ]
        },
        { tip: 'Vous pouvez aussi **déposer des images** depuis le Finder ou l\'explorateur directement sur la page. Annuler : ⌘Z.' }
      ]
    },
    {
      id: 'panels',
      group: 'start',
      title: 'Les panneaux et l\'affichage',
      keywords: 'zoom règles repères aimantation fenêtre étroite masquer',
      body: [
        { p: 'Les panneaux latéraux et la liste des pages se **redimensionnent** à la poignée (double-clic : taille par défaut) et se **masquent** avec les boutons ◧ ◨ de la barre d\'outils, ou ⌘⌥1 (gauche), ⌘⌥2 (droite) et ⌘⌥3 (pages). Un panneau masqué réapparaît quand on approche le bord de la fenêtre. En fenêtre étroite, ils passent en recouvrement.' },
        { p: '**Zoom** : ⌘+ et ⌘- (de 10 % à 800 %), ⌘0 pour ajuster à la fenêtre, ⌘1 pour la taille réelle. Pour déplacer la vue : barre d\'espace et glisser, ou clic molette.' },
        { p: 'Les **règles**, les **repères** (glissés depuis les règles) et l\'**aimantation** (aux bords, centres et repères) s\'activent avec ⇧R, ⇧G et ⇧A, ou dans les Réglages.' }
      ]
    },
    {
      id: 'elements',
      group: 'create',
      title: 'Ajouter et organiser des éléments',
      keywords: 'texte forme rectangle ellipse icône illustration calques groupe aligner dupliquer verrouiller',
      body: [
        { p: 'Le menu **Ajouter** de la barre d\'outils et l\'onglet **Éléments** proposent du texte, des rectangles, des ellipses, 12 formes vectorielles, des bulles de BD, un QR code, un nuage de mots, votre signature et des clips vidéo. L\'onglet **Icônes** réunit 1 400 icônes et 32 illustrations en couleurs, que l\'on recolore comme le reste.' },
        { p: '**Sélectionner plusieurs éléments** : tracez un rectangle (lasso), Maj + clic, ou ⌘A pour tout prendre. ⌘G les **groupe**, ⇧⌘G les dissocie ; double-clic sur un membre de groupe pour y entrer. Le panneau des propriétés **aligne** et **répartit** la sélection, et donne la position et la taille en chiffres.' },
        { p: 'L\'onglet **Calques** règle l\'ordre de superposition (par glisser-déposer) et permet de **masquer**, **verrouiller** (⌘L) ou renommer un élément. Pour atteindre un élément caché sous un autre, ⌘-clic sélectionne celui du dessous.' },
        {
          keys: [
            ['⌘C ⌘X ⌘V', 'copier, couper, coller (aussi entre pages et entre documents)'],
            ['⌘D', 'dupliquer'],
            ['Suppr', 'supprimer'],
            ['Flèches', 'déplacer (Maj : de 10 px)'],
            ['Tab ⇧Tab', 'élément suivant, précédent']
          ]
        },
        { tip: 'Pendant un glisser : **⌘** suspend l\'aimantation, **Maj** bloque l\'axe, **Alt** duplique l\'élément.' }
      ]
    },
    {
      id: 'text',
      group: 'create',
      title: 'Travailler le texte',
      keywords: 'police typographie colonnes liste puces correcteur orthographe rechercher remplacer interlettrage lien',
      body: [
        { p: 'Ajoutez un texte avec le bouton **Texte**, puis tapez : la zone de saisie est encadrée en couleur quand le texte est en édition. Cliquez en dehors ou appuyez sur Échap pour terminer. Le panneau des propriétés règle la **police**, la taille (le texte se met à jour tout de suite), les couleurs, l\'alignement, l\'interlettrage, l\'interligne, le souligné, le barré, les majuscules et les **listes à puces ou numérotées**.' },
        { p: 'Les **colonnes** (2 à 4) font couler un texte d\'une colonne à l\'autre dans la même zone. Vous pouvez importer vos polices (TTF, OTF, WOFF, WOFF2) ou en installer parmi un catalogue d\'environ 1 900 polices libres ; elles sont embarquées dans le document.' },
        { p: '**Rechercher et remplacer** dans tous les textes : ⌘F (casse, mot entier, accents) ; un seul ⌘Z annule tout le remplacement.' },
        { p: 'Le **correcteur orthographique** (onglet « Orthographe ») est celui de votre système : les fautes possibles sont soulignées en rouge ondulé sur la page, et l\'onglet porte une pastille jaune quand il y en a. Un clic droit sur un mot propose des corrections et « Ajouter au dictionnaire ».' },
        { p: 'Un **lien** (Propriétés → « Lien ») peut mener à une adresse web, une adresse de courrier ou une autre page du document ; il est cliquable en présentation, dans le PDF, la présentation web et PowerPoint.' }
      ]
    },
    {
      id: 'images',
      group: 'create',
      title: 'Images, photos et illustrations',
      keywords: 'image photo recadrer flouter pixelliser filtre bibliothèque openverse texte alternatif arrière-plan',
      body: [
        { p: 'Ajoutez une image avec **Ajouter → Image…**, en la déposant sur la page, ou en collant. Le panneau des propriétés propose le **recadrage** (double-clic sur l\'image pour les poignées), le **redressement**, des **cadres en forme** (cercle, étoile, cœur…), les miroirs, les filtres (luminosité, contraste, noir et blanc, sépia, flou), le contour et les ombres.' },
        { p: 'L\'onglet **Photos** contient **Ma bibliothèque** (choisissez un dossier d\'images de votre ordinateur : rien n\'est copié ni déplacé ; recherche et **étiquettes** à vous) et la recherche de **photos libres de droits** (en ligne, sur demande, chez Wikimedia Commons, Openverse, la NASA ou le Cleveland Museum of Art ; le crédit est conservé).' },
        { p: '**Flouter ou pixelliser une zone** (panneau de l\'image → « Flouter une zone… ») remplace réellement l\'image par une version masquée : ce qui est caché ne peut plus être retrouvé. Un seul « Annuler » rétablit l\'image.' },
        { p: '« **Extraire le texte (OCR)** » (panneau de l\'image) lit le texte d\'une photo, d\'une capture ou d\'un scan, sur votre ordinateur et sans connexion : vous choisissez la langue (français, anglais, allemand ou espagnol), corrigez le résultat, puis l\'insérez comme un bloc de texte à côté de l\'image. Cela marche bien sur du texte imprimé, net et droit ; l\'écriture manuscrite et les photos floues donnent des erreurs : relisez toujours.' },
        { p: '« **Utiliser comme arrière-plan** » fait couvrir la page par l\'image et la verrouille sous le reste. Pensez au **texte alternatif** des images (onglet « Accès ») : il est repris dans les exports PowerPoint et SVG.' }
      ]
    },
    {
      id: 'import',
      group: 'create',
      title: 'Importer un document Word, Markdown ou texte',
      keywords: 'docx md txt word plan cours diapositives importer markdown titres',
      body: [
        { p: 'Un cours rédigé dans Word, des notes en Markdown ou un fichier texte deviennent des **diapositives** : menu **Importer → « Document Word, Markdown ou texte… »**.' },
        {
          steps: [
            'Choisissez le fichier (`.docx`, `.md`, `.markdown` ou `.txt`).',
            'Dans la fenêtre : le **niveau de titre** qui démarre une page (le nombre de pages et leurs titres se mettent à jour tout de suite), le **style** clair ou sombre, et la reprise des **images**.',
            '« Importer » crée un nouveau document (une confirmation vous est demandée si le document courant est modifié).'
          ]
        },
        { p: '**Repris** : les titres (styles « Titre 1 » à « Titre 9 » de Word, `#` en Markdown), les listes à puces et numérotées avec leurs niveaux, les paragraphes, les images, les tableaux (une ligne de texte par rangée) et les sauts de page (`---` en Markdown). Un texte trop long continue sur des pages « (suite) ».' },
        { p: '**Pas repris** : la mise en forme du texte (gras, couleurs, liens), les en-têtes et pieds de page, les notes de bas de page et les zones de texte de Word. Les images d\'un fichier Markdown sont lues dans **le dossier du fichier** ; une image en ligne (`https://…`) n\'est pas téléchargée : Trame reste hors ligne.' },
        { tip: 'Tout est ensuite modifiable comme n\'importe quel texte. Un fichier LibreOffice (`.odt`) : enregistrez-le d\'abord en `.docx`.' }
      ]
    },
    {
      id: 'templates',
      group: 'create',
      title: 'Modèles, marque et mise en page',
      keywords: 'modèle kit de marque couleurs polices logos magic resize format page personnels packs',
      body: [
        { p: 'L\'onglet **Modèles** propose 32 modèles de départ (CV, affiches, cartes de visite, carrousel, planning, modèles de publipostage…). Enregistrez n\'importe quel design comme **modèle personnel** ; un pack `.tramepack` partage plusieurs modèles dans un seul fichier.' },
        { p: 'Le **Kit de marque** (onglet « Marque ») garde vos couleurs, polices et logos : ses polices passent en tête du sélecteur et ses couleurs apparaissent en pastilles sous les sélecteurs de couleur. Vous pouvez avoir **plusieurs kits** (un par client, par cours…) : le menu du haut choisit le kit actif, et « Exporter… » / « Importer… » les échangent par un fichier .tramekit. « Couleurs du document » liste celles qu\'il utilise (un clic pour les appliquer, « ⇄ » pour en remplacer une partout). « Style d\'après une image » recolore la page ou le document avec les couleurs d\'une image.' },
        { p: 'Le **fond de la page** (panneau de droite, sans rien de sélectionné) est une couleur unie ou un **dégradé** (linéaire avec un angle, ou radial, de deux couleurs) ; « Appliquer à toutes les pages » le recopie sur les autres pages.' },
        { p: '**Magic Resize** change le format de la page en adaptant le contenu. Des **pages multiples** : ajout, duplication, suppression et réordonnancement par glisser-déposer dans la liste du bas.' }
      ]
    },
    {
      id: 'present',
      group: 'present',
      title: 'Présenter',
      keywords: 'F5 plein écran laser annotation notes orateur chronomètre transitions',
      body: [
        { p: 'Lancez la présentation avec **▶ Présenter** (F5 ou ⇧⌘P) depuis la page courante. Flèches ou clic pour avancer, Échap pour sortir.' },
        {
          keys: [
            ['L', 'pointeur laser'],
            ['D', 'annoter à l\'écran (stylo ou surligneur)'],
            ['N', 'notes de l\'orateur'],
            ['S', 'écran de l\'orateur dans une seconde fenêtre (page suivante, notes, chronomètre)'],
            ['G', 'vue d\'ensemble des pages (ou chiffres puis Entrée pour aller à une page)'],
            ['R', 'réécouter la voix off de la page'],
            ['B', 'écran noir'],
            ['P', 'pause ou reprise de la lecture automatique']
          ]
        },
        { p: 'Réglez dans les propriétés les **transitions** (fondu, glissement, recouvrement, zoom), l\'**apparition pas à pas** des éléments (chaque clic en montre de nouveaux) et la **durée** de chaque page pour la lecture automatique. Les **notes de l\'orateur** s\'écrivent dans le panneau sous la page.' },
        { p: 'À la fin, un **récapitulatif des temps** peut être repris comme temps prévus.' }
      ]
    },
    {
      id: 'media',
      group: 'present',
      title: 'Voix off et clips vidéo',
      keywords: 'micro audio enregistrer mp4 mov webm musique son',
      body: [
        { p: '**Voix off** (propriétés de la page → « Voix off ») : enregistrez-la au micro (témoin de niveau, écoute, refaire) ou importez un fichier audio. Elle est gardée dans le document et se joue toute seule en présentation, dans la présentation web et dans la vidéo exportée.' },
        { p: '**Capture et enregistrement d\'écran** (Éléments → « Capture d\'écran… » et « Enregistrer l\'écran… ») : choisissez un écran ou une fenêtre. La capture donne une image, dont vous pouvez ne garder qu\'une zone tracée à la souris ; l\'enregistrement donne un clip vidéo (avec le micro si vous le cochez), qui se règle comme les autres clips. Trame se réduit pendant la prise d\'un écran entier ; pour arrêter un enregistrement, cliquez sur le témoin « ● 0:12 » de la barre de menus ou tapez ⌘⌥R (Ctrl+Alt+R). Sur macOS, le système demande d\'abord l\'autorisation « Enregistrement de l\'écran » (puis de relancer Trame). Le son du système n\'est pas enregistré, seulement le micro.' },
        { p: '**Clips vidéo** (Éléments → « Insérer un clip vidéo… », MP4, WebM ou MOV de 50 Mo au plus) : le clip se déplace comme une image ; le panneau de droite règle la lecture automatique, la boucle, le son, le début, la fin et la vitesse. **Couper ici** scinde le clip à l\'instant affiché dans le lecteur : on obtient deux clips côte à côte, qui partagent la même vidéo (le document ne grossit pas) ; supprimez, déplacez ou réglez chaque morceau, ou mettez-les sur des pages différentes. **Assembler les clips** (sélectionnez-en plusieurs avec Maj+clic) les met bout à bout en un seul élément : le panneau liste les morceaux, que l\'on règle un à un (début, fin, vitesse), réordonne (↑ ↓), coupe, retire ou **sépare** pour en refaire un clip à part ; les vidéos sont partagées, rien n\'est copié. Il se joue en présentation, dans la présentation web et dans la vidéo ; le PDF et les images montrent son aperçu.' },
        { tip: 'Au premier enregistrement, votre système (macOS) demande l\'autorisation d\'utiliser le micro.' }
      ]
    },
    {
      id: 'export',
      group: 'share',
      title: 'Exporter et partager',
      keywords: 'pdf powerpoint pptx png jpg svg html vidéo mp4 zip',
      body: [
        { p: 'Le menu **Exporter** de la barre d\'outils réunit tous les formats :' },
        {
          keys: [
            ['PDF', 'toutes les pages, texte sélectionnable et dessin vectoriel'],
            ['PowerPoint (.pptx)', 'textes, formes et images modifiables ailleurs, avec les notes et les transitions'],
            ['PNG, JPG, SVG', 'page courante ou plusieurs pages, jusqu\'à ×3, en archive ZIP ou dans un dossier'],
            ['Présentation web (.html)', 'un seul fichier à ouvrir dans un navigateur, sans Trame ni connexion'],
            ['Vidéo (MP4)', 'le document devient un film, avec transitions, voix off et musique de fond facultative']
          ]
        },
        { p: 'La **présentation web** se déplace avec les flèches, un clic ou un balayage ; elle intègre les polices, les clips et les voix off, et propose une lecture automatique (▶ ou touche P). Elle est faite pour un navigateur : sur iPhone, l\'aperçu de l\'app Fichiers montre les pages l\'une sous l\'autre, mais ne peut pas la jouer.' },
        { p: 'La **vidéo** est fabriquée sur votre ordinateur (480p, 720p ou 1080p, 24, 30 ou 60 images par seconde, 20 minutes au plus) ; une barre de progression et un bouton d\'arrêt sont proposés.' }
      ]
    },
    {
      id: 'print',
      group: 'share',
      title: 'Imprimer',
      keywords: 'impression livret polycopié notes fond perdu traits de coupe planche étiquettes',
      body: [
        { p: '**Impression directe** : ⌘P (ou Exporter → Imprimer…) ouvre la boîte d\'impression du système : une page par feuille, un livret recto-verso ou plusieurs pages par feuille.' },
        { p: '**Livret et impression groupée** (menu Exporter) produit un PDF : livret à plier en deux et agrafer (A4 ou Lettre), ou 2, 4, 6 ou 9 pages par feuille. **PDF notes et polycopié** met chaque diapositive avec ses notes dessous, ou plusieurs diapositives par feuille avec des lignes pour écrire.' },
        { p: '**Impression professionnelle** (propriétés de la page, sans sélection) : **fond perdu**, **marge de sécurité** et **traits de coupe** s\'ajoutent à l\'export PDF.' }
      ]
    },
    {
      id: 'mailmerge',
      group: 'share',
      title: 'Publipostage',
      keywords: 'csv tableau fiches diplômes badges étiquettes avery',
      body: [
        { p: 'Écrivez `{{prénom}}` (le nom d\'une colonne) dans un texte, choisissez un **tableau CSV**, et Trame produit **une fiche par ligne** : diplômes, badges, étiquettes, cartes de vocabulaire…' },
        {
          steps: [
            'Écrivez les champs `{{colonne}}` dans vos textes (ou dans un QR code pour un lien par fiche).',
            'Ouvrez le publipostage depuis le menu Exporter et choisissez votre fichier CSV.',
            'Choisissez les lignes (plage ou filtre comme « Classe = 6A »), puis le format : un seul PDF (une fiche par page ou plusieurs par feuille, étiquettes du commerce) ou un PDF par ligne.'
          ]
        },
        { tip: 'Tout reste sur votre ordinateur. Quatre modèles de publipostage sont fournis, avec un tableau d\'exemple.' }
      ]
    },
    {
      id: 'review',
      group: 'care',
      title: 'Relecture, versions et comparaison',
      keywords: 'commentaires historique comparer 🕘 enseignant élève',
      body: [
        { p: 'L\'onglet **Relecture** permet d\'épingler des **commentaires** sur les pages, d\'y répondre et de les marquer « traités ». Ils sont enregistrés dans le fichier `.trame`, jamais dans les exports : l\'élève rend son fichier, l\'enseignant le commente et le renvoie.' },
        { p: 'Le bouton **🕘** garde l\'**historique des versions** : une version à chaque enregistrement, avec aperçu, retour à une version (annulable), ouverture comme copie, et nom de votre choix (« Rendu au prof »). « Comparer avec un autre fichier… » montre les différences page par page : vous cochez ce que vous reprenez.' }
      ]
    },
    {
      id: 'access',
      group: 'care',
      title: 'Accessibilité et lisibilité',
      keywords: 'contraste daltonisme dyslexie lecture facilitée ordre de lecture alt',
      body: [
        { p: 'L\'onglet **Accès** contrôle le **contraste** des textes (avec correction en un clic), leur taille, leur **ordre de lecture** et les images sans description. La **lecture facilitée** (polices Atkinson Hyperlegible, Lexend ou OpenDyslexic, interligne 1,5, lettres espacées) s\'applique à la sélection, à la page ou au document.' },
        { p: 'La **lecture à voix haute** lit la sélection, la page ou tout le document avec une voix de votre ordinateur (sans connexion, rien n\'est envoyé). Les textes sont lus de haut en bas, puis de gauche à droite ; choisissez la voix de la langue du document, réglez la vitesse, mettez en pause ou arrêtez à tout moment. Si aucune voix n\'est proposée, ajoutez-en une dans les réglages du système.' },
        { p: 'La **simulation de la vision des couleurs** (protanopie, deutéranopie, tritanopie, niveaux de gris) change seulement l\'affichage à l\'écran, jamais le document.' }
      ]
    },
    {
      id: 'safety',
      group: 'care',
      title: 'Enregistrement, reprise et vie privée',
      keywords: 'sauvegarde plantage copie de secours hors ligne mises à jour confidentialité',
      body: [
        { p: 'Trame fonctionne **hors ligne**. Seules quelques fonctions facultatives utilisent Internet, **sur votre demande** : catalogue de polices, photos libres, aide par IA, vérification des mises à jour.' },
        { p: 'Tant qu\'il y a des modifications non enregistrées, une **copie de secours** est écrite toutes les quelques secondes : après un plantage ou une coupure de courant, Trame propose de **reprendre** votre travail au lancement suivant. Une confirmation évite aussi de fermer un document modifié par erreur.' },
        { p: 'Les **mises à jour** sont proposées au lancement ; le téléchargement ne démarre que sur votre clic (Réglages → Version et mises à jour).' }
      ]
    },
    {
      id: 'settings',
      group: 'ref',
      title: 'Réglages et retours',
      keywords: 'langue apparence thème clair sombre signaler problème bug avis formulaire diagnostic',
      body: [
        { p: 'Ouvrez les **Réglages** avec ⚙ en bas de la colonne d\'icônes, ou ⌘, : langue, apparence (clair, sombre ou celle du système), rouvrir le dernier document au lancement, règles et repères, correcteur orthographique, version et mises à jour.' },
        { p: 'Une difficulté, une idée ? **Aide et retours** (dans les Réglages) ouvre un formulaire dans votre navigateur, sans compte, avec la version et le système déjà remplis. « Copier les informations de diagnostic » met ces informations à coller dans le formulaire ; elles ne contiennent jamais le contenu d\'un document.' }
      ]
    },
    {
      id: 'shortcuts',
      group: 'ref',
      title: 'Raccourcis clavier',
      keywords: 'touches clavier commandes',
      body: [
        { p: 'Sous Windows et Linux, **Ctrl** remplace ⌘ (et **Strg** en allemand).' },
        {
          keys: [
            ['⌘N ⌘O ⌘S ⇧⌘S', 'nouveau, ouvrir, enregistrer, enregistrer sous'],
            ['⌘P', 'imprimer'],
            ['⌘Z ⇧⌘Z', 'annuler, rétablir (100 niveaux)'],
            ['⌘C ⌘X ⌘V', 'copier, couper, coller'],
            ['⌘D', 'dupliquer'],
            ['⌘A', 'tout sélectionner'],
            ['⌘G ⇧⌘G', 'grouper, dissocier'],
            ['⌘L', 'verrouiller'],
            ['⌘F', 'rechercher et remplacer'],
            ['⌘+ ⌘- ⌘0 ⌘1', 'zoom, ajuster à la fenêtre, taille réelle'],
            ['Espace + glisser', 'déplacer la vue'],
            ['⇧R ⇧G ⇧A', 'règles, repères, aimantation'],
            ['⌘⌥1 ⌘⌥2 ⌘⌥3', 'panneau gauche, panneau droit, liste des pages'],
            ['F5 ⇧⌘P', 'présenter'],
            ['⌘,', 'réglages'],
            ['F1', 'cette aide'],
            ['Échap', 'désélectionner, fermer']
          ]
        }
      ]
    }
  ]
}
