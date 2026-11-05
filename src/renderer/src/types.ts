import type { PageTransition } from './transition'

export type ElementType = 'rect' | 'ellipse' | 'text' | 'image' | 'path'

/** Ombre portée ou lueur (une lueur est une ombre sans décalage). Flou et décalages en pixels de design ; le décalage reste dans les axes de la page, même si l'élément pivote. */
export interface Shadow {
  color: string
  blur: number
  offsetX: number
  offsetY: number
  /** 0 à 1 */
  opacity: number
}

/** Zone visible d'une image, en fractions (0 à 1) de l'image d'origine. Absent = image entière. */
export interface Crop {
  x: number
  y: number
  width: number
  height: number
}

/** Réglages de couleur d'une image. Tous optionnels, 0 = neutre. */
export interface ImageFilters {
  /** -100 à 100 */
  brightness?: number
  /** -100 à 100 */
  contrast?: number
  /** -100 (gris) à 100 (très saturé) */
  saturation?: number
  /** 0 à 100 : part de noir et blanc */
  grayscale?: number
  /** 0 à 100 */
  sepia?: number
  /** rayon de flou en pixels de design (0 à 40) */
  blur?: number
}

/** Dégradé à deux couleurs. `angle` : degrés CSS (0 = vers le haut, 90 = vers la droite, 180 = vers le bas), ignoré en radial. */
export interface Gradient {
  type: 'linear' | 'radial'
  from: string
  to: string
  angle: number
}

/** Liste d'un texte : un paragraphe (ligne saisie) = un élément de la liste. */
export type ListKind = 'bullet' | 'number'

/** Protection d'un élément de modèle : `fixed` = figé, `fill` = à remplir (contenu modifiable, ni déplacé ni supprimé). */
/** Réglages de lecture d'un clip vidéo (les octets sont dans `TrameDocument.clips[id]`). */
export interface VideoClip {
  id: string
  /** durée en secondes */
  duration: number
  /** recommence quand il est fini */
  loop?: true
  /** sans le son */
  muted?: true
  /** ne démarre pas seul : un clic sur le clip le lance (absent = lecture automatique à l'arrivée sur la page) */
  manual?: true
  /** volume de 0 à 1 (absent = 1) */
  volume?: number
}

export type Protection = 'fixed' | 'fill'

export interface TrameElement {
  id: string
  type: ElementType
  x: number
  y: number
  width: number
  height: number
  rotation: number
  opacity: number
  /** Les éléments partageant un groupId se sélectionnent et se déplacent ensemble. */
  groupId?: string
  /** nom du calque dans le panneau Calques (absent = nom automatique) */
  name?: string
  /** protection par le modèle (voir `protection.ts`) ; absent = élément libre */
  protect?: Protection
  /** position verrouillée : l'élément ne se déplace, ne se redimensionne, ne pivote et ne se supprime plus */
  locked?: boolean
  /** masqué : ni affiché, ni exporté, ni sélectionnable sur le canvas */
  hidden?: boolean
  /** apparition en présentation : numéro du clic (1 à 30) qui fait apparaître l'élément ; absent = visible dès l'ouverture de la page */
  build?: number
  fill: string
  /** dégradé de remplissage (rectangle, ellipse, forme) : remplace `fill` tant qu'il est présent */
  gradient?: Gradient
  /** ombre portée / lueur */
  shadow?: Shadow
  /** couleur du contour (absent = pas de contour) */
  stroke?: string
  /** épaisseur du contour en pixels de design, centré sur le bord de l'élément (absent ou 0 = pas de contour) */
  strokeWidth?: number
  /** contour en tirets */
  strokeDashed?: boolean
  // rect
  cornerRadius?: number
  // text
  text?: string
  fontSize?: number
  fontFamily?: string
  fontStyle?: string // 'normal' | 'bold' | 'italic' | 'italic bold'
  align?: 'left' | 'center' | 'right'
  /** espacement supplémentaire entre les lettres, en pixels de design (0 = normal) */
  letterSpacing?: number
  /** interligne, en multiple de la taille de police (1 = serré, défaut) */
  lineHeight?: number
  underline?: boolean
  strike?: boolean
  /** affichage en majuscules ; le texte saisi reste tel quel */
  uppercase?: boolean
  /** publipostage : le texte rétrécit quand la valeur d'un champ est plus longue que prévu (il ne prend pas plus de lignes que dans le modèle) */
  mergeFit?: boolean
  /** publipostage (images) : colonne du tableau qui donne le nom du fichier image à mettre à la place de celle du modèle */
  imageField?: string
  /** premier élément d'un graphique ou d'un tableau : porte sa description (les autres éléments du groupe sont régénérés à partir d'elle) */
  chart?: ChartSpec
  /** premier élément (le fond) d'un QR code : porte son contenu, le dessin des modules (le chemin qui suit) est régénéré à partir de lui */
  qr?: QrSpec
  /** liste à puces ou numérotée : chaque paragraphe reçoit un marqueur, les lignes suivantes sont en retrait */
  list?: ListKind
  /** texte sur plusieurs colonnes (2 à 4, absent = une seule) : le texte coule de colonne en colonne, équilibrées ; la largeur de l'élément est celle de l'ensemble */
  columns?: number
  /** espace entre les colonnes en pixels (absent : une fois la taille de police) */
  columnGap?: number
  // path : chemin SVG (viewBox 100×100)
  path?: string
  /** règle de remplissage d'un tracé : `evenodd` (pair-impair : les contours imbriqués percent le fond) ; absent = règle ordinaire (non nul) */
  fillRule?: 'evenodd'
  // image
  src?: string
  /** clip vidéo : cet élément image est l'aperçu d'un clip joué en présentation et dans la vidéo exportée ; `id` renvoie à `TrameDocument.clips` */
  video?: VideoClip
  /** image de fond issue d'un PDF importé : page d'origine (à partir de 1) du PDF stocké dans `TrameDocument.sources` ; l'export PDF la remet en vectoriel */
  pdfSource?: { id: string; page: number }
  /** crédit d'une photo en ligne (auteur, licence, page d'origine), à citer si la licence l'exige */
  credit?: string
  /** texte alternatif (description pour les personnes qui ne voient pas l'image), 500 caractères au plus */
  alt?: string
  /** image purement décorative : aucune description attendue (exclue de l'alerte « sans description ») */
  decorative?: true
  /** image générée par un service d'IA : service, modèle et demande (information seulement) */
  ai?: { provider: 'cloudflare' | 'openai'; model: string; prompt: string; from?: 'edit' | 'variation' }
  /** recadrage : la zone de l'image d'origine qui remplit la boîte de l'élément */
  crop?: Crop
  /** miroir horizontal / vertical (images) */
  flipX?: boolean
  flipY?: boolean
  /** réglages de lumière et de couleur */
  filters?: ImageFilters
  /** cadre : l'image n'est visible que dans cette forme (voir `imageStyle.ts`) ; absent = rectangle */
  mask?: string
  /** redressement : rotation de l'image dans sa boîte, en degrés (−45 à 45), agrandie pour que la boîte reste remplie */
  straighten?: number
}

/** Repère d'alignement posé par l'utilisateur : `v` = ligne verticale à x = position, `h` = ligne horizontale à y = position (pixels de design). */
export interface Guide {
  orientation: 'h' | 'v'
  position: number
}

/** Réponse à un commentaire de relecture. */
export interface ReviewReply {
  id: string
  author: string
  /** date en ms */
  at: number
  text: string
}

/** Commentaire de relecture épinglé sur une page (jamais dessiné dans les exports). */
export interface ReviewComment {
  id: string
  /** position de l'épingle, en pixels de design de la page */
  x: number
  y: number
  author: string
  /** date en ms */
  at: number
  text: string
  /** traité (absent = à traiter) */
  resolved?: true
  replies?: ReviewReply[]
}

export interface TramePage {
  id: string
  background: string
  /** commentaires de relecture de la page (absents = aucun) ; jamais dessinés dans les exports */
  comments?: ReviewComment[]
  /** repères de la page (absents = aucun) ; jamais dessinés dans les exports */
  guides?: Guide[]
  /** notes de l'orateur (absentes = aucune) ; jamais dessinées dans les exports image / PDF */
  notes?: string
  /** transition jouée à l'arrivée sur cette page en présentation (absente = celle du document) */
  transition?: PageTransition
  elements: TrameElement[] // ordre = z-index croissant
}

/** Police ajoutée en ligne, embarquée dans un document. */
export interface EmbeddedFont {
  name: string
  /** famille CSS stockée dans les éléments (`"Nom", serif`) */
  family: string
  category: string
  license: string
  /** `400`, `700`, `400-italic`, `700-italic` → WOFF2 en base64 */
  variants: Record<string, string>
}

/** Graphique ou tableau lié à des données : le document ne garde que cette description, les formes qui le dessinent sont régénérées (`chart.ts`). */
export interface ChartSpec {
  kind: 'bar' | 'hbar' | 'line' | 'pie' | 'table'
  title: string
  /** données telles que lues dans le CSV (texte) : les nombres sont interprétés à l'affichage */
  columns: string[]
  rows: string[][]
  /** colonne des étiquettes (catégories, noms des parts) */
  labelColumn: number
  /** colonnes des valeurs (une série par colonne ; un secteur n'en utilise qu'une) */
  valueColumns: number[]
  showValues: boolean
  showLegend: boolean
  palette: 'safe' | 'violet' | 'gray'
  theme: 'light' | 'dark'
}

/** QR code lié à son contenu : le document ne garde que cette description, le fond et le chemin des modules sont régénérés (`qr.ts`). */
export interface QrSpec {
  /** adresse web ou texte encodé (UTF-8) */
  text: string
  /** correction d'erreurs : L 7 %, M 15 %, Q 25 %, H 30 % de modules abîmés ou cachés tolérés */
  ecc: 'L' | 'M' | 'Q' | 'H'
  /** couleur des modules (sombre) */
  dark: string
  /** couleur du fond et de la marge (claire) */
  light: string
}

/** Tableau du publipostage (champs « {{colonne}} » des textes), enregistré avec le document. */
export interface MergeData {
  columns: string[]
  rows: string[][]
  /** derniers choix d'export, retrouvés à la réouverture (absents tant que rien n'a été exporté) */
  settings?: MergeSettings
}

/** Choix de la fenêtre « Publipostage » mémorisés avec le document (les lignes choisies et le filtre ne le sont pas : ils dépendent du tableau). */
export interface MergeSettings {
  mode: 'single' | 'folder'
  /** colonne qui nomme les fichiers d'un export par ligne (null : numéro de ligne) */
  nameColumn: number | null
  /** plusieurs fiches par feuille */
  sheet: boolean
  layout: {
    paper: 'a4' | 'letter'
    landscape: boolean
    cols: number
    rows: number
    marginMm: number
    gapMm: number
    cutMarks: boolean
    mirrorBacks: boolean
    fillCell: boolean
    offsetXMm: number
    offsetYMm: number
    /** gabarit du commerce (voir `sheetPresets.ts`) ; absent = grille libre */
    preset?: string
  }
}

export interface TrameDocument {
  version: 2
  name: string
  width: number
  height: number
  pages: TramePage[]
  /** cadre (dans la page) où vit la composition d'origine après un ou plusieurs Magic Resize : absent = toute la page. Permet de revenir à un format sans rétrécir le contenu. */
  layoutFrame?: { x: number; y: number; width: number; height: number }
  /** impression professionnelle : fond perdu, marge de sécurité, traits de coupe (absent = aucun ; voir `printSetup.ts`) */
  print?: { bleedMm: number; safeMm: number; marks: boolean }
  /** polices ajoutées en ligne utilisées par le document, embarquées pour qu'il s'affiche et s'exporte partout (base64 WOFF2 par variante) */
  fonts?: Record<string, EmbeddedFont>
  /** transition entre pages en présentation (absente = fondu) */
  transition?: PageTransition
  /** PDF d'origine des pages importées, en base64, par identifiant (références : `TrameElement.pdfSource`) */
  sources?: Record<string, string>
  /** clips vidéo embarqués, par identifiant : data URL base64 (références : `TrameElement.video`) */
  clips?: Record<string, string>
  /** données du publipostage : un tableau dont les colonnes remplissent les champs « {{colonne}} » des textes */
  mailMerge?: MergeData
}

declare global {
  interface Window {
    trame: import('../../preload').TrameApi
  }
}
