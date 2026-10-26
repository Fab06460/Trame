# Feuille de route

Confrontation de [`FEATURES.md`](../FEATURES.md) (fonctionnalités de Canva) à l'état de Trame et à son prérequis **100 % hors-ligne** (aucun compte, aucun serveur, aucune requête réseau : voir `README.md`). `FEATURES.md` reste la source de référence et n'est pas modifié ; ce document est le plan de travail qui en découle.

Date de l'analyse : 26/10/2026 (Trame 0.1.0).

## Résumé

| Statut | Lignes de FEATURES.md |
| --- | ---: |
| ✅ Fait | 2 |
| 🟡 Partiel | 4 |
| ⬜ À faire | 6 |
| 🔶 À faire, lourd | 1 |
| 🚫 Écarté (IA) | 3 |
| ⛔ Hors-ligne impossible | 4 |
| **Total** | **20** |

**Légende.** ✅ Fait · 🟡 Partiel (une partie existe) · ⬜ À faire, compatible hors-ligne · 🔶 À faire, compatible hors-ligne mais **lourd** (chantier de la taille d'un produit) · 🚫 **Écarté par décision** (IA locale : trop complexe pour le gain, 26/10/2026) · ⛔ Impossible hors-ligne (la fonctionnalité *est* un service en ligne).

**Règle de tri** : une fonctionnalité est dite compatible hors-ligne si, une fois l'application installée, elle fonctionne sans réseau et sans compte. Un modèle d'IA **embarqué** dans l'application respecte ce critère mais a un coût (taille de l'installateur, licence, qualité) ; un modèle **téléchargé après coup** ne le respecte pas strictement.

## 1. Les 20 lignes de FEATURES.md


### 1. Éditeur principal et interface

| Fonctionnalité | Statut | Analyse | Backlog |
| --- | --- | --- | --- |
| Glisser-déposer | ✅ Fait | Déplacement, redimensionnement, rotation, sélection multiple au lasso, groupes, alignement/répartition, calques, pages, annuler/rétablir, zoom, copier-coller. Il manque : guides magnétiques, règles, verrouillage de calques, dépôt de fichiers depuis le Finder. | E5, E6, E7 |
| Bibliothèque de modèles | 🟡 Partiel | 6 modèles intégrés + modèles personnels (enregistrer, renommer, masquer, remplacer). « Des millions » est impossible hors-ligne (hébergement), mais une collection embarquée plus large et des packs de modèles échangeables par fichier le sont. | C2 |
| Bibliothèque de médias | 🟡 Partiel | 12 formes vectorielles, 10 polices embarquées, import d'images locales. Photos, vidéos, pistes audio « par millions » : impossible hors-ligne. Faisable : jeu d'icônes/illustrations à licence ouverte embarqué, polices supplémentaires, bibliothèque locale (dossier surveillé, étiquettes). | C1, C3, E12 |
| Magic Resize | ⬜ À faire | Changer le format (`setSize`) ne redimensionne rien aujourd'hui. Algorithme déterministe, aucune IA : faisable à 100 % hors-ligne. | E10 |

### 2. Outils de retouche photo et vidéo

| Fonctionnalité | Statut | Analyse | Backlog |
| --- | --- | --- | --- |
| Retouche photo | ⬜ À faire | Rien aujourd'hui sur les images (pas de recadrage, filtres, cadres). Recadrage, retournement, redressement, filtres, réglages de lumière, flou, cadres : faisables hors-ligne (canvas). La suppression d'arrière-plan, elle, est **écartée** (IA). | E8, E9 |
| Montage vidéo | 🔶 À faire, lourd | Faisable hors-ligne (lecture native, encodage avec ffmpeg embarqué, enregistrement d'écran natif d'Electron) mais c'est un produit à part entière. Les sous-titres automatiques (reconnaissance vocale = IA) sont écartés. | V1, V2 |
| Effets graphiques | ⬜ À faire | Pas d'ombre, de lueur, de contour ni de dégradé aujourd'hui. Tout est faisable hors-ligne ; en PDF ces effets obligent à une image pour l'élément concerné (voir risques). | E1, E2, E3 |

### 3. Intelligence artificielle

| Fonctionnalité | Statut | Analyse | Backlog |
| --- | --- | --- | --- |
| Magic Write | 🚫 Écarté | Un service en ligne par nature. Hors-ligne, seuls des modèles de langage locaux (plusieurs Go) sont possibles, avec une qualité et un poids discutables : option très tardive. **Écarté.** Reste la correction orthographique (correcteur du système macOS), qui n'est pas de l'IA générative. | H3 |
| Magic Media / générateurs IA | ⛔ Hors-ligne impossible | Génération d'images, vidéos et objets 3D : service en ligne (calcul sur GPU distants). Une génération locale est théoriquement possible mais hors de portée raisonnable (modèles de plusieurs Go, GPU). | — |
| Magic Edit / Magic Eraser | 🚫 Écarté | **Écarté** (IA). Effacer un objet = « inpainting » ; la partie générative de Magic Edit est de toute façon en ligne. | — |
| Magic Expand | ⛔ Hors-ligne impossible | Étendre une photo suppose de **générer** du contenu : modèle génératif distant. | — |
| Magic Grab | 🚫 Écarté | **Écarté** (IA : segmentation d'image). | — |
| Style Match | ⬜ À faire | Version algorithmique hors-ligne possible : extraire la palette d'une image et recolorier le design, sans IA générative. | C4 |

### 4. Image de marque et collaboration

| Fonctionnalité | Statut | Analyse | Backlog |
| --- | --- | --- | --- |
| Kit de marque | ⬜ À faire | Couleurs, logos et polices enregistrés localement (plusieurs kits) et proposés dans le sélecteur de couleur et le menu des polices. Aucun serveur nécessaire. | C5, E11, E12 |
| Modèles de marque verrouillés | ⬜ À faire | Éléments verrouillés / éditables dans un modèle, modèles échangés sous forme de fichiers. Faisable ; dépend du verrouillage de calques. | C6, E5 |
| Collaboration en temps réel | ⛔ Hors-ligne impossible | Exige un serveur et du réseau : contraire à l'objectif. Substituts hors-ligne : échange de fichiers `.trame`, packs de modèles, historique de versions local. | — |

### 5. Outils bureautiques et productivité

| Fonctionnalité | Statut | Analyse | Backlog |
| --- | --- | --- | --- |
| Éditeur PDF et documents | 🟡 Partiel | Création de PDF : fait (vectoriel, texte sélectionnable). Restent, tous faisables hors-ligne : fusion/scission/réordonnancement de pages, compression, signature visuelle, import de pages PDF comme fonds. Modifier le texte d'un PDF arbitraire est un très gros chantier peu fiable : à éviter. | D1, D2, D3, D4 |
| Présentations et tableurs | 🟡 Partiel | Pages 16:9 et un modèle de présentation. Manquent : mode présentation plein écran, transitions, notes de l'orateur ; graphiques et tableaux (faisables sans service externe, à partir de données collées ou d'un CSV). | D5, C7 |
| Intégrations | ⛔ Hors-ligne impossible | Slack, Teams, YouTube, Google Photos, planificateurs : des appels réseau par définition. Équivalents hors-ligne : glisser-déposer depuis le Finder, export dans un dossier choisi, feuille de partage du système. | E7, D1 |
| Canva Offline | ✅ Fait | Satisfait par conception : application de bureau sans compte, sans serveur, polices et ressources embarquées, CSP interdisant toute ressource externe. | — |

## 2. Backlog détaillé

Effort indicatif : **S** (petit), **M** (moyen), **L** (gros), **XL** (chantier de la taille d'un produit). Les phases sont un ordre de travail proposé : la phase 1 est faite des briques dont le reste dépend.


### Phase 1 — Un éditeur plus riche (effets, calques, images, Magic Resize)

| ID | Fonctionnalité | Effort | Notes | Dépend de |
| --- | --- | :---: | --- | --- |
| E1 | Contour (trait) des formes et du texte | S | Konva le gère ; le PDF vectoriel aussi (trait). | — |
| E2 | Dégradés (linéaire, radial) pour fonds et formes | M | Konva oui ; PDF : dégradés = opérateurs bruts (pdf-lib n'a pas d'API) ou image. | — |
| E3 | Ombre portée et lueur (formes, texte, images) | M | Konva oui. **PDF : l'élément passe en image** (voir risques) → décider si le texte à ombre reste sélectionnable (ombre en image séparée sous un vrai texte). | — |
| E4 | Typographie : espacement des lettres, interligne, souligné, barré, majuscules | M | Konva gère `letterSpacing`/`lineHeight` ; PDF : `Tc` et interligne explicites ; mise à jour de `fidelity`. | — |
| E5 | Panneau Calques : verrouiller, masquer, renommer | M | Prérequis des modèles de marque verrouillés. | — |
| E6 | Guides magnétiques, règles, grille | M | Logique pure testable (aimantation aux bords/centres). | — |
| E7 | Dépôt de fichiers images depuis le Finder sur le canvas | S | Équivalent hors-ligne des « intégrations » de photos. | — |
| E8 | Images : recadrage, retournement, redressement, masque en forme (cadres) | M | Rendu PDF : recadrer/retourner les pixels avant intégration. | — |
| E9 | Images : filtres et réglages (luminosité, contraste, saturation, flou, N&B, sépia) | M | Konva possède des filtres ; PDF : image « cuite » avec les réglages. | E8 |
| E10 | Magic Resize : adapter un design à un autre format (une page ou toutes) | M | Mise à l'échelle proportionnelle + repositionnement ; texte redimensionné ; logique pure, très testable. | — |
| E11 | Couleurs : pipette, couleurs du document, palettes enregistrées | S |  | — |
| E12 | Polices : importer ses propres TTF/OTF/WOFF + davantage de polices embarquées | M | L'export PDF les intègre déjà via fontkit ; attention à l'avertissement « police inconnue » et aux licences. | — |
| E13 | **Position et taille numériques** (X, Y, largeur, hauteur, rotation, verrouillage des proportions) | S | Manque majeur : on ne peut régler un élément qu'à la souris. Sert aussi à tester l'aimantation. | — |
| E14 | **Poignées à la Canva** : coins proportionnels, rotation aimantée (45°), redimensionnement avec aimantation | S | Konva : `keepRatio`, `rotationSnaps`. | E6 |
| E15 | Alt + glisser = dupliquer ; Maj = déplacement sur un axe | S | | — |
| E16 | Retourner horizontalement / verticalement | M | Touche les 4 rendus (échelle négative). | — |
| E17 | Nom du document modifiable (barre de titre, noms d'export) | S | Aujourd'hui figé à « Sans titre » ou au nom du modèle. | — |
| E18 | Sélection : Tab (élément suivant), cliquer à travers (⌘-clic), entrer dans un groupe, sélectionner tout ce qui est du même type | M | | E5 |
| E19 | Pages : marges de sécurité, repères d'impression (fond perdu), arrière-plan image | M | | E6 |
| E20 | Recherche / remplacement de texte dans le document | S | | — |
| E21 | Texte : listes à puces et numérotées, texte sur plusieurs colonnes | M | Konva ne gère pas les listes : à composer. | E4 |

### Phase 2 — Contenus et identité de marque (bibliothèques, kit de marque, graphiques)

| ID | Fonctionnalité | Effort | Notes | Dépend de |
| --- | --- | :---: | --- | --- |
| C1 | Bibliothèque d'icônes et d'illustrations embarquée, avec recherche | M | Choisir un jeu à licence ouverte (MIT/ISC/CC0) ; coût en taille de l'application ; chemins SVG → type d'élément `path` existant (formes pleines seulement : il faudra le contour, E1). | E1 |
| C2 | Davantage de modèles (CV, flyers, logos, cartes de visite, bannières, affiches) + packs de modèles importables/exportables | M | Contenu à produire ; format de pack = fichier. | — |
| C3 | Bibliothèque de médias locale (dossier surveillé, étiquettes, recherche) | M |  | E7 |
| C4 | Palette depuis une image et recoloriage du design (Style Match simple) | M | Algorithme (quantification de couleurs), sans IA. | E11 |
| C5 | Kit de marque local : couleurs, logos, polices (plusieurs kits) | M |  | E11, E12 |
| C6 | Modèles de marque : éléments verrouillés / modifiables | M |  | E5, C5 |
| C7 | Graphiques (barres, courbes, secteurs) et tableaux à partir de données collées ou CSV | L | Nouveau type d'élément : 4 rendus à écrire. | — |

### Phase 3 — Documents (export, outils PDF, signature, présentation)

| ID | Fonctionnalité | Effort | Notes | Dépend de |
| --- | --- | :---: | --- | --- |
| D1 | Export : toutes les pages en PNG/JPG (dossier ou ZIP), ×2/×3, SVG | S |  | — |
| D2 | Outils PDF : fusionner, scinder, réordonner, extraire des pages, compresser | M | pdf-lib. | — |
| D3 | Importer un PDF (pages comme images de fond, texte extrait) | L | Moteur de rendu PDF embarqué ; l'édition du texte d'un PDF quelconque est exclue. | D2 |
| D4 | Signature : visuelle (dessinée ou importée) ; numérique certifiée en option | M | La signature numérique avec certificat est un chantier à part (L). | — |
| D5 | Mode présentation plein écran, transitions, notes de l'orateur | L |  | — |

### Phase 4 — Outils avancés à modèle local (optionnels et lourds)

| ID | Fonctionnalité | Effort | Notes | Dépend de |
| --- | --- | :---: | --- | --- |
| H3 | Correction orthographique | S | Correcteur du système sur macOS (hors-ligne) : à vérifier au moment du développement ; ailleurs les dictionnaires doivent être embarqués. | — |

### Phase 5 — Vidéo (hors périmètre à court terme)

| ID | Fonctionnalité | Effort | Notes | Dépend de |
| --- | --- | :---: | --- | --- |
| V1 | Vidéo : importer des clips, découper, assembler, exporter en MP4 | XL | ffmpeg embarqué ; produit à part entière. | — |
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

