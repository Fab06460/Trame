# Feuille de route

Confrontation de [`FEATURES.md`](../FEATURES.md) (fonctionnalités de Canva) à l'état de Trame et à son prérequis **100 % hors-ligne** (aucun compte, aucun serveur, aucune requête réseau : voir `README.md`). `FEATURES.md` reste la source de référence et n'est pas modifié ; ce document est le plan de travail qui en découle.

Date de l'analyse : 26/10/2026 (Trame 0.1.0).

## Résumé

| Statut | Lignes de FEATURES.md |
| --- | ---: |
| ✅ Fait | 2 |
| 🟡 Partiel | 6 |
| ⬜ À faire | 6 |
| 🔶 À faire, lourd | 1 |
| 🚫 Écarté (IA) | 2 |
| ⛔ Hors-ligne impossible | 3 |
| **Total** | **20** |

**Légende.** ✅ Fait · 🟡 Partiel (une partie existe) · ⬜ À faire, compatible hors-ligne · 🔶 À faire, compatible hors-ligne mais **lourd** (chantier de la taille d'un produit) · 🚫 **Écarté par décision** (IA locale : trop complexe pour le gain, 26/10/2026) · ⛔ Impossible hors-ligne (la fonctionnalité *est* un service en ligne).

**Règle de tri** : une fonctionnalité est dite compatible hors-ligne si, une fois l'application installée, elle fonctionne sans réseau et sans compte. Un modèle d'IA **embarqué** dans l'application respecte ce critère mais a un coût (taille de l'installateur, licence, qualité) ; un modèle **téléchargé après coup** ne le respecte pas strictement.

## 1. Les 20 lignes de FEATURES.md


### 1. Éditeur principal et interface

| Fonctionnalité | Statut | Analyse | Backlog |
| --- | --- | --- | --- |
| Glisser-déposer | ✅ Fait | Déplacement, redimensionnement, rotation, sélection multiple au lasso, groupes, alignement/répartition, calques, pages, annuler/rétablir, zoom, copier-coller. Règles, repères et aimantation sont faits ; il manque : dépôt de fichiers depuis le Finder. | E7 |
| Bibliothèque de modèles | 🟡 Partiel | 32 modèles intégrés (dont 4 de publipostage) + modèles personnels (enregistrer, renommer, masquer, remplacer, **échanger par pack .tramepack**) + modèles personnels (enregistrer, renommer, masquer, remplacer). « Des millions » est impossible hors-ligne (hébergement), mais une collection embarquée plus large et des packs de modèles échangeables par fichier le sont. | C2 |
| Bibliothèque de médias | 🟡 Partiel | 12 formes vectorielles, 10 polices embarquées, import d'images locales, **recherche de photos libres en ligne (Openverse, Wikimedia Commons)**, **catalogue de polices en ligne (Google Fonts)**. Photos, vidéos, pistes audio « par millions » : impossible hors-ligne. Fait : jeu d'icônes/illustrations à licence ouverte embarqué, bibliothèque locale d'images (un dossier choisi, étiquettes, recherche). Reste : polices supplémentaires hors ligne. | C1, C3, E12 |
| Magic Resize | 🟡 Partiel | Panneau Page : préréglages ou dimensions libres, case « Adapter le contenu ». Mise à l'échelle uniforme et centrage de la composition, bords conservés (`magicResize.ts`, aucune IA). Reste : une vraie recomposition (réorganiser les blocs pour un format très différent). | E10 |

### 2. Outils de retouche photo et vidéo

| Fonctionnalité | Statut | Analyse | Backlog |
| --- | --- | --- | --- |
| Retouche photo | 🟡 Partiel | **Fait** : recadrage (champs et poignées sur le canvas), miroirs, redressement, cadres en forme, filtres, réglages de lumière, flou — tout hors-ligne (canvas). La suppression d'arrière-plan, elle, est **écartée** (IA). | E8, E9 |
| Montage vidéo | 🔶 À faire, lourd | Faisable hors-ligne (lecture native, encodage avec ffmpeg embarqué, enregistrement d'écran natif d'Electron) mais c'est un produit à part entière. Les sous-titres automatiques (reconnaissance vocale = IA) sont écartés. | V1, V2 |
| Effets graphiques | ⬜ À faire | Pas d'ombre, de lueur, de contour ni de dégradé aujourd'hui. Tout est faisable hors-ligne ; en PDF ces effets obligent à une image pour l'élément concerné (voir risques). | E1, E2, E3 |

### 3. Intelligence artificielle

| Fonctionnalité | Statut | Analyse | Backlog |
| --- | --- | --- | --- |
| Magic Write | 🟡 Partiel (en ligne, facultatif) | **Aide à la rédaction** faite avec le compte de l'utilisateur (Cloudflare Workers AI gratuit, OpenAI payant) : reformuler, raccourcir, développer, corriger, ton, traduire, demande libre ; propositions à valider, rien d'automatique. Pas de modèle local (plusieurs Go : écarté). | H3 |
| Magic Media / générateurs IA | 🟡 Partiel (en ligne, facultatif) | **Génération d'images** et **retouche guidée / variantes** faites, avec le compte de l'utilisateur et sans aucune dépendance au reste de l'application : Cloudflare Workers AI (FLUX.1 schnell, quota gratuit quotidien) et OpenAI (`gpt-image-1`, payant, non testé contre le vrai service ; Cloudflare, lui, vérifié en vrai). Vidéos et objets 3D : non. Génération locale hors de portée (modèles de plusieurs Go, GPU). | — |
| Magic Edit / Magic Eraser | 🚫 Écarté | **Écarté** (IA). Effacer un objet = « inpainting » ; la partie générative de Magic Edit est de toute façon en ligne. | — |
| Magic Expand | ⛔ Hors-ligne impossible | Étendre une photo suppose de **générer** du contenu : modèle génératif distant. | — |
| Magic Grab | 🚫 Écarté | **Écarté** (IA : segmentation d'image). | — |
| Style Match | ✅ Fait (version algorithmique) | Palette d'une image et recoloriage du design, sans IA générative (`palette.ts`, `recolor.ts`). Pas de proposition de mise en page ni de polices : seulement les couleurs. | C4 |

### 4. Image de marque et collaboration

| Fonctionnalité | Statut | Analyse | Backlog |
| --- | --- | --- | --- |
| Kit de marque | 🟡 Partiel | Onglet « Marque » : couleurs, polices et logos enregistrés localement (un kit), couleurs récentes, pipette, couleurs du document (appliquer, ajouter au kit, remplacer partout). Les polices du kit passent en tête du sélecteur de police. Restent : plusieurs kits, proposition dans les sélecteurs de couleur. | C5, E11, E12 |
| Modèles de marque verrouillés | ⬜ À faire | Éléments verrouillés / éditables dans un modèle, modèles échangés sous forme de fichiers. Faisable ; dépend du verrouillage de calques. | C6, E5 |
| Collaboration en temps réel | ⛔ Hors-ligne impossible | Exige un serveur et du réseau : contraire à l'objectif. Substituts hors-ligne : échange de fichiers `.trame`, packs de modèles, historique de versions local. | — |

### 5. Outils bureautiques et productivité

| Fonctionnalité | Statut | Analyse | Backlog |
| --- | --- | --- | --- |
| Import / export PowerPoint | ✅ Fait | Export `.pptx` (objets modifiables) et import `.pptx` (dont les exports de Canva), voir `docs/ARCHITECTURE.md`. | — |
| Éditeur PDF et documents | 🟡 Partiel | Création de PDF : fait (vectoriel, texte sélectionnable). Restent, tous faisables hors-ligne : fusion/scission/réordonnancement de pages, compression, signature visuelle (**fait**, D4), import de pages PDF comme fonds (**fait**, D3). Modifier le texte d'un PDF arbitraire est un très gros chantier peu fiable : à éviter. | D1, D2, D3, D4 |
| Présentations et tableurs | 🟡 Partiel | Pages 16:9, un modèle de présentation et un **mode présentation plein écran** (F5). Notes de l'orateur faites (saisie, touche N, PPTX). Transitions faites (fondu, glissement, recouvrement, zoom). Écran de l'orateur fait. Pointeur laser fait. Transition par page faite ; graphiques et tableaux (faisables sans service externe, à partir de données collées ou d'un CSV). | D5, C7 |
| Intégrations | ⛔ Hors-ligne impossible | Slack, Teams, YouTube, Google Photos, planificateurs : des appels réseau par définition. Équivalents hors-ligne : glisser-déposer depuis le Finder, export dans un dossier choisi, feuille de partage du système. | E7, D1 |
| Canva Offline | ✅ Fait | Satisfait par conception : application de bureau sans compte, sans serveur, polices et ressources embarquées, CSP interdisant toute ressource externe. | — |

## 2. Backlog détaillé

Effort indicatif : **S** (petit), **M** (moyen), **L** (gros), **XL** (chantier de la taille d'un produit). Les phases sont un ordre de travail proposé : la phase 1 est faite des briques dont le reste dépend.


### Phase 1 — Un éditeur plus riche (effets, calques, images, Magic Resize)

| ID | Fonctionnalité | Effort | Notes | Dépend de |
| --- | --- | :---: | --- | --- |
| E1 | Contour (trait) des formes et du texte | S | **Fait.** Formes, images et lettres ; trait centré sur le bord, tirets ; PDF vectoriel (la forme étirée garde un trait d'épaisseur uniforme). | — |
| E2 | Dégradés (linéaire, radial) pour fonds et formes | M | **Fait** pour les formes, rectangles et ellipses (deux couleurs, linéaire/radial) ; PDF natif (shading). Reste : dégradé de fond de page et de texte. | — |
| E3 | Ombre portée et lueur (formes, texte, images) | M | **Fait.** Décision retenue pour le PDF : l'ombre est une image sous un élément resté vectoriel (le texte reste sélectionnable). | — |
| E4 | Typographie : espacement des lettres, interligne, souligné, barré, majuscules | M | **Fait.** Konva dessine lettre par lettre avec un interlettrage (pas de crénage) : le PDF fait de même (`Tc`) ; décorations et interligne identiques à Konva, vérifiés par `fidelity` (page 2). Les listes sont E21. | — |
| E5 | Panneau Calques : verrouiller, masquer, renommer | M | **Fait** (liste, œil, cadenas, renommage, glisser-déposer, ⌘L). Prérequis des modèles de marque verrouillés. | — |
| E6 | Guides magnétiques, règles, grille | M | **Fait.** Règles, repères, aimantation (déplacement + côtés au redimensionnement). Logique pure testable (aimantation aux bords/centres). | — |
| E7 | Dépôt de fichiers images depuis le Finder sur le canvas | S | **Fait** : plusieurs images à la fois, centrées sur le point lâché (`imageDrop.ts`). | — |
| E8 | Images : recadrage, retournement, redressement, masque en forme (cadres) | M | **Fait** : recadrage (en % et par poignées sur le canvas), miroirs, redressement, cadres en forme (ellipse, coins arrondis, formes de Trame). Rendu : pixels recadrés, redressés, retournés et découpés cuits dans un canvas partagé. | — |
| E9 | Images : filtres et réglages (luminosité, contraste, saturation, flou, N&B, sépia) | M | **Fait** (6 réglages + 6 préréglages), cuits dans l'image, y compris pour le PDF. | E8 |
| E10 | Magic Resize : adapter un design à un autre format (une page ou toutes) | M | **Fait** (toutes les pages : elles partagent le format du document). Voir `docs/ARCHITECTURE.md`. | — |
| E11 | Couleurs : pipette, couleurs du document, palettes enregistrées | S | **Fait** : pipette (API `EyeDropper`), couleurs récentes, palette du kit, couleurs du document (liste, ajout au kit, remplacement partout). | — |
| E12 | Polices : importer ses propres TTF/OTF/WOFF + davantage de polices embarquées | M | **Fait en partie** : catalogue en ligne de ~1 900 polices libres (installation sur demande, embarquées dans les documents, WOFF2 dans le PDF). **Import de ses propres fichiers (TTF, OTF, WOFF, WOFF2) fait.** Polices du kit de marque en tête du sélecteur, qui montre chaque nom dans sa police et se filtre par recherche. Restent : davantage de polices embarquées hors ligne, alphabets cyrillique et grec. | — |
| E13 | **Position et taille numériques** (X, Y, largeur, hauteur, rotation, verrouillage des proportions) | S | **Fait.** Manque majeur : on ne peut régler un élément qu'à la souris. Sert aussi à tester l'aimantation. | — |
| E14 | **Poignées à la Canva** : coins proportionnels, rotation aimantée (45°), redimensionnement avec aimantation | S | **Fait** (coins proportionnels, texte en largeur seule, rotation aimantée). L'aimantation des coins est volontairement exclue. Konva : `keepRatio`, `rotationSnaps`. | E6 |
| E15 | Alt + glisser = dupliquer ; Maj = déplacement sur un axe | S | **Fait** (Alt = dupliquer, Maj = axe, ⌘ = suspendre l'aimantation). | — |
| E16 | Retourner horizontalement / verticalement | M | **Fait** : images (drapeaux `flipX`/`flipY`), formes, icônes et sélections entières, par un seul jeu de boutons « Retourner » (propriétés, sous l'alignement). Le texte change de place sans être retourné (volontaire : un texte en miroir est illisible). | — |
| E17 | Nom du document modifiable (barre de titre, noms d'export) | S | **Fait** : champ dans la barre d'outils (`docName.ts`, `DocName.tsx`) ; nom des exports et de « Enregistrer sous » ; annulable. | — |
| E18 | Sélection : Tab (élément suivant), cliquer à travers (⌘-clic), entrer dans un groupe, sélectionner tout ce qui est du même type | M | **Fait** (voir `docs/ARCHITECTURE.md`, « Sélection au clavier et à la souris »). | E5 |
| E19 | Pages : marges de sécurité, repères d'impression (fond perdu), arrière-plan image | M | **Fait** (voir `docs/ARCHITECTURE.md`, « Impression professionnelle »). L'arrière-plan est un élément image ordinaire, verrouillé et placé en bas. | E6 |
| E20 | Recherche / remplacement de texte dans le document | S | **Fait** (panneau de recherche : `FindPanel.tsx`, `store/find.ts`, `textSearch.ts`). | — |
| E21 | Texte : listes à puces et numérotées, texte sur plusieurs colonnes | M | **Fait** : listes à puces et numérotées (retrait des lignes suivantes, PDF en vrai texte) et texte sur 2 à 4 colonnes équilibrées (espace réglable, PDF et SVG en vrai texte). | E4 |

### Phase 2 — Contenus et identité de marque (bibliothèques, kit de marque, graphiques)

| ID | Fonctionnalité | Effort | Notes | Dépend de |
| --- | --- | :---: | --- | --- |
| C1 | Bibliothèque d'icônes et d'illustrations embarquée, avec recherche | M | **Icônes faites** : 1 434 icônes Phosphor (MIT), contour ou plein, onglet Icônes avec recherche en français/anglais et catégories (voir `docs/ARCHITECTURE.md`). **Illustrations** : 32 dessins en couleurs (Open Doodles, CC0), insérés comme groupes de formes recolorables ; un seul style, à étoffer. | E1 |
| C2 | Davantage de modèles (CV, flyers, logos, cartes de visite, bannières, affiches) + packs de modèles importables/exportables | M | ✅ **Fait** : 18 modèles ajoutés (CV, lettre, carte de visite recto-verso, flyer A5, invitation, bannière LinkedIn, miniature vidéo, carrousel Instagram, trois affiches, trois logos, menu, planning hebdomadaire, couverture de rapport, lettre d'information), traduits en 4 langues, texte en vrai PDF ; **packs `.tramepack`** : exporter des modèles personnels choisis dans un fichier, importer le pack reçu. Reste : packs de modèles intégrés téléchargeables, modèles avec photos. | — |
| C3 | Bibliothèque de médias locale (dossier surveillé, étiquettes, recherche) | M | **Fait pour les images** : un dossier choisi (relu à l'ouverture et sur demande, pas surveillé en continu), vignettes, recherche par nom, étiquettes et filtre, insertion en un clic. Restent : plusieurs dossiers, favoris, glisser-déposer, vidéo et audio. | E7 |
| C4 | Palette depuis une image et recoloriage du design (Style Match simple) | M | **Fait** : fenêtre « Style d'après une image » (3 à 8 couleurs, kit de marque, aperçu avant / après, page ou toutes les pages). Voir `docs/ARCHITECTURE.md`. | E11 |
| C5 | Kit de marque local : couleurs, logos, polices (plusieurs kits) | M | **Fait pour un kit** (voir `docs/ARCHITECTURE.md`). | E11, E12 |
| C6 | Modèles de marque : éléments verrouillés / modifiables | M | **Fait** : éléments figés ou à remplir, modification du modèle, remplacement d'image. Aide à la cohérence, pas une sécurité. | E5, C5 |
| C7 | Graphiques (barres, courbes, secteurs) et tableaux à partir de données collées ou CSV | L | Nouveau type d'élément : 4 rendus à écrire. | — |
| C8 | QR codes (adresse web ou texte, correction d'erreurs, couleurs) | S | **Fait** : groupe fond + tracé vectoriel, voir `docs/ARCHITECTURE.md`. **Publipostage fait** : `{{colonne}}` dans le contenu donne un QR code par ligne. Reste : PowerPoint en vrai tracé. | C7 |
| C9 | Flouter ou pixelliser une zone d'une image (visages d'élèves, données personnelles) | S–M | ✅ **Fait** (zones rectangle ou ellipse tracées à la souris, pixellisation ou flou, remplacement irréversible de l'image). Reste : pinceau libre, détection automatique des visages (modèle embarqué), saisie au clavier des zones. | E9 |
| C10 | Bulles de BD et modèles de planches, cartes mémo recto-verso (publipostage) | S | ✅ **Fait** : six bulles (parole et pensée à queue gauche/droite, cri, récitatif), trois modèles de planches (bande de 3 cases, planches de 4 et 6 cases), carte question / réponse (la carte de vocabulaire existait). Reste : bulle dont la queue se règle à la souris, planches avec cases de formes libres, cases qui reçoivent une image par glisser-déposer. | C2 |
| C11 | Nuage de mots à partir d'un texte ou d'une liste | M | ✅ **Fait** (texte, liste, liste pondérée ; placement en spirale sans chevauchement ; un texte ordinaire par mot). Reste : forme du nuage (cœur, silhouette), nuage lié à ses données pour le régénérer après coup, nuage collaboratif en direct (réseau : écarté). | — |

### Phase 3 — Documents (export, outils PDF, signature, présentation)

| ID | Fonctionnalité | Effort | Notes | Dépend de |
| --- | --- | :---: | --- | --- |
| D1 | Export : toutes les pages en PNG/JPG (dossier ou ZIP), ×2/×3, SVG | S | **Fait** (sélection de pages, PNG / JPG / SVG, ×1 à ×3, archive ZIP ou dossier). | — |
| D2 | Outils PDF : fusionner, scinder, réordonner, extraire des pages, compresser | M | **Fait** sauf la compression : boîte « Outils PDF… » (fusion, réordonnancement, rotation, extraction, scission). Reste : compression (recompresser les images d'un PDF demande de décoder ses flux ; la seule voie simple est de rastériser les pages, ce qui perd le texte), conserver signets et formulaires, ouvrir un PDF protégé par mot de passe. | — |
| D3 | Importer un PDF (pages comme images de fond, texte extrait) | L | **Fait** (bouton « Importer PDF ») : deux modes, texte reconstruit ou page en image. **Annotation vectorielle faite** (mode « page en image »). Les outils de fusion et de scission sont faits (D2) ; reste : réenregistrer en écrasant le PDF d'origine. | D2 |
| D4 | Signature : visuelle (dessinée ou importée) ; numérique certifiée en option | M | ✅ **Fait** pour la signature visuelle (dessinée ou importée, forme vectorielle, dix signatures gardées). Reste, à part : la signature numérique avec certificat (L). | — |
| D5 | Mode présentation plein écran, transitions, notes de l'orateur | L | **Fait en partie** : plein écran, navigation, écran noir, lecture automatique en boucle, transitions (fondu, glissement, recouvrement, zoom, aucune), notes de l'orateur (panneau d'édition, touche N en présentation, export/import PPTX). Écran de l'orateur fait (seconde fenêtre synchronisée : page suivante, notes, chronomètre). Transition par page faite (réglage du document + de chaque page, export / import PPTX). Pointeur laser fait. Annotation à l'écran faite (stylo, surligneur, cinq couleurs, par page, non enregistrée). Apparition des éléments pas à pas faite (fondu au clic ; non exportée vers PowerPoint). Vue d'ensemble (G) et saut de page par numéro faits. Restent : liens cliquables, durée par page et chronométrage, export PDF « notes de l'orateur » / polycopié. | — |

### Phase 4 — Compléments (correction orthographique, interface)

| ID | Fonctionnalité | Effort | Notes | Dépend de |
| --- | --- | :---: | --- | --- |
| H3 | Correction orthographique | S | ✅ **Fait** avec le correcteur du système : soulignement à la saisie, clic droit (suggestions, dictionnaire), onglet « Orthographe » pour tout le document, réglages et dictionnaire personnel. Vérifié sur macOS ; sous Windows et Linux, Chromium télécharge ses dictionnaires (non vérifié, voir les limites). | — |
| U1 | Déplacer « Trame X.Y.Z · Mises à jour » et le choix de la langue hors du panneau de gauche | S | ✅ **Fait** : bouton ⚙ « Réglages » fixé au bas de la colonne d'icônes (hors du contenu qui défile), qui ouvre une petite fenêtre avec la langue, la version (→ fenêtre des mises à jour) ; un point signale une mise à jour proposée. Emplacement choisi par l'utilisateur parmi trois (colonne d'icônes, barre d'outils, barre d'état). Place libre pour de futurs réglages. | — |

### Phase 5 — Vidéo (hors périmètre à court terme)

| ID | Fonctionnalité | Effort | Notes | Dépend de |
| --- | --- | :---: | --- | --- |
| V1 | Vidéo : importer des clips, découper, assembler, exporter en MP4 | XL | **Fait en partie** : export du document en vidéo (MP4/WebM, transitions et apparitions), sans ffmpeg (WebCodecs). Musique de fond faite (un fichier audio, volume, fondus, boucle). Clips vidéo dans les pages faits (insertion, aperçu, lecture en présentation, lecture et son dans la vidéo exportée, page allongée pour montrer le clip). Restent : voix off, durée par page réglable, découpage et assemblage de clips, clips dans la présentation web. | — |
| V2 | Enregistrement d'écran | L | API native d'Electron, aucun réseau. | V1 |

## 3. Ce qui est volontairement écarté

| Fonctionnalité | Pourquoi | Équivalent hors-ligne |
| --- | --- | --- |
| **Toute l'IA locale** : suppression d'arrière-plan, gomme magique, isolement d'un sujet, assistant d'écriture, sous-titres automatiques | **Décision du 26/10/2026** : trop complexe (modèles de dizaines de Mo à plusieurs Go, licences, qualité) pour le gain | Aucun ; recadrage, filtres, détourage manuel restent possibles |
| Collaboration en temps réel, commentaires, validations | Réseau et serveur | Échange de fichiers `.trame`, packs de modèles |
| Génération d'images, vidéos, 3D (Magic Media, Magic Expand) | Calcul sur des serveurs d'IA | Aucun raisonnable |
| Intégrations Slack, Teams, YouTube, Google Photos, planificateurs de publication | Appels réseau par nature | Dépôt de fichiers depuis le Finder, export dans un dossier, feuille de partage du système |
| « Des millions » de photos, vidéos, pistes audio, modèles | Hébergement et licences | Collections embarquées plus modestes ; bibliothèque locale de l'utilisateur |

## 4. Risques et décisions à prendre

1. **Quatre rendus à tenir synchronisés.** Chaque nouvel élément ou nouvelle propriété visuelle (contour, dégradé, ombre, filtre, graphique…) doit être écrit dans l'éditeur, l'export image, l'export PDF et les miniatures (voir `docs/ARCHITECTURE.md`). C'est le principal multiplicateur de coût de ce backlog ; `npm run fidelity` doit être étendu à chaque fois.
2. **Effets et PDF.** Ombres, lueurs et flous n'existent pas comme objets vectoriels simples dans un PDF. Décision à prendre : (a) l'élément entier passe en image dans le PDF (simple, mais le texte n'est plus sélectionnable et l'avertissement en direct doit le signaler) ; (b) l'ombre est une image séparée placée sous un **vrai** texte (plus fidèle à l'esprit « texte sélectionnable », plus de travail).
3. **Format de fichier.** Les nouveaux champs d'éléments (contour, dégradé, filtres, verrouillage, kit de marque…) feront passer le `.trame` en **version 3** avec migration (voir `docs/FILE_FORMAT.md`) ; les champs optionnels sans effet par défaut n'exigent pas de nouvelle version.
4. **Licences des ressources embarquées.** Icônes, illustrations, polices (SIL OFL) : vérifier que la licence autorise la redistribution dans une application ; conserver les mentions requises (écran « À propos »).
5. **Poids de l'application.** Elle pèse aujourd'hui ~260 Mo installée (116 Mo en DMG), presque tout Chromium. Un jeu d'icônes ou un ffmpeg embarqué s'ajoutent directement ; le DMG est signé et notarisé à chaque version, ce qui allonge le cycle.
6. **La vidéo** est un produit dans le produit : à n'engager qu'après les phases 1 à 3, et seulement si le besoin est confirmé.

## 5. Par où commencer

**Objectif retenu (26/10/2026) : une alternative crédible à Canva, donc d'abord les petits manques d'édition** (règles, guides, aimantation, position numérique…), puis le reste de la phase 1. Ordre : **E13** (position/taille numériques), **E6** (règles, guides, aimantation), **E14–E15** (poignées, Alt-glisser), **E5** (calques), puis Magic Resize et la suite : **Magic Resize (E10)**, puis **effets et typographie (E1–E4)**, **retouche d'image (E8–E9)**, **kit de marque (E11, E12, C5)** avec le verrouillage de calques (E5) qui ouvre les **modèles de marque (C6)**, puis les **bibliothèques embarquées (C1, C2)** et les **outils PDF/présentation (D1–D5)**.

