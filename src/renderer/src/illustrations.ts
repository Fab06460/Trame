import { nanoid } from 'nanoid'
import { normalize } from '@/iconSearch'
import type { TrameElement } from '@/types'

/** Une illustration (« Open Doodles » de Pablo Stanley, CC0) : des couches en chemins SVG d'un viewBox 100 × 100, chacune de la couleur d'encre ou d'accent. */
export interface Illustration {
  id: string
  /** largeur ÷ hauteur du dessin d'origine (le chemin est étiré dans une boîte de cette proportion) */
  ratio: number
  /** couches dans l'ordre de peinture : 0 = accent, 1 = encre */
  layers: Array<{ color: 0 | 1; d: string }>
}

/** Forme du fichier `illustrationData.json` (écrit par `scripts/build-illustrations.mjs`). */
export type RawIllustrations = Array<[id: string, ratio: number, layers: Array<[color: number, d: string]>]>

export const fromRaw = (raw: RawIllustrations): Illustration[] =>
  raw.map(([id, ratio, layers]) => ({ id, ratio, layers: layers.map(([color, d]) => ({ color: color === 0 ? 0 : 1, d })) }))

/** Couleurs proposées à l'insertion : l'encre des traits, l'accent des aplats. */
export const DEFAULT_INK = '#1e1f24'
export const DEFAULT_ACCENT = '#ff5678'

/** Mots-clés (français et anglais, sans accents) en plus du nom affiché et de l'identifiant. */
const KEYWORDS: Record<string, string> = {
  ballet: 'dance danse dancer danseur sport saut jump',
  chilling: 'relax relaxer repos rest calme sol floor sitting assis',
  clumsy: 'papiers papers bureau office chaos oups oops lache maladroit',
  coffee: 'cafe tasse cup drink boisson matin morning',
  dancing: 'danse dance musique music casque headphones walkman',
  'dog-jump': 'chien dog animal course run joue play',
  doggie: 'chien dog animal compagnon pet assis sitting caresse',
  float: 'flotte flotter vole fly chute fall air',
  groovy: 'marche walk danse dance rythme rhythm',
  'ice-cream': 'glace dessert cornet cone gourmand sucre sugar ete summer',
  jumping: 'saute saut jump sport energie energy',
  laying: 'allonge lying telephone phone smartphone repos rest ventre',
  levitate: 'leviter flotter float yoga souplesse flexible dos back',
  loving: 'coeur heart amour love bienveillance kindness soi self',
  meditating: 'meditation yoga zen calme calm bien-etre wellness lotus',
  moshing: 'concert musique music rock pogo danse dance',
  petting: 'chien dog caresse pet animal compagnon',
  plant: 'plante plant pot fleur flower jardin garden nature maison home',
  reading: 'lecture lire read livre book etude study ecole school assis sitting',
  'reading-side': 'lecture lire read livre book plante plant the tea',
  'roller-skating': 'patins roulettes roller skate sport',
  rolling: 'roule course run rapide fast',
  running: 'course courir run sport',
  selfie: 'photo telephone phone smartphone portrait',
  sitting: 'assis sit pause repos rest',
  'sitting-reading': 'lecture lire read livre book chaise chair pile etude study',
  sleek: 'marche walk rapide fast elegant',
  sprinting: 'sprint course run vitesse speed sport',
  strolling: 'promenade balade walk marche',
  swinging: 'balancoire swing jeu play enfance childhood',
  unboxing: 'colis parcel carton box cadeau gift deballage',
  zombieing: 'zombie marche walk fete party halloween'
}

/**
 * Illustrations qui correspondent à la recherche. Chaque mot saisi doit se retrouver dans le nom affiché (dans la langue de
 * l'interface), l'identifiant ou les mots-clés ; sans mot, tout est proposé.
 */
export function searchIllustrations(all: Illustration[], query: string, nameOf: (id: string) => string): Illustration[] {
  const terms = normalize(query).split(/\s+/).filter(Boolean)
  if (!terms.length) return all
  return all.filter((i) => {
    const haystack = normalize(`${nameOf(i.id)} ${i.id.replace(/-/g, ' ')} ${KEYWORDS[i.id] ?? ''}`)
    return terms.every((t) => haystack.includes(t))
  })
}

/** Largeur d'une illustration insérée : 70 % de la plus petite dimension de la page. */
export const illustrationWidth = (page: { width: number; height: number }): number => Math.round(Math.min(page.width, page.height) * 0.7)

/**
 * Les éléments d'une illustration insérée au centre de la page : une couche = un tracé ordinaire (rempli selon la règle « pair-impair »,
 * comme le dessin d'origine), toutes de même boîte et réunies dans un groupe. Elles se recolorent donc comme n'importe quelle forme.
 */
export function illustrationElements(
  ill: Illustration,
  page: { width: number; height: number },
  colors: { ink: string; accent: string },
  name: string,
  makeId: () => string = () => nanoid(8)
): TrameElement[] {
  const width = illustrationWidth(page)
  const height = Math.round(width / ill.ratio)
  const groupId = makeId()
  return ill.layers.map((layer) => ({
    id: makeId(),
    type: 'path' as const,
    x: Math.round((page.width - width) / 2),
    y: Math.round((page.height - height) / 2),
    width,
    height,
    rotation: 0,
    opacity: 1,
    fill: layer.color === 0 ? colors.accent : colors.ink,
    path: layer.d,
    fillRule: 'evenodd' as const,
    groupId,
    name
  }))
}
