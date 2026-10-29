import { nanoid } from 'nanoid'
import { t } from '@/i18n'
import { SHAPES } from '@/shapes'
import type { MessageKey, Params } from '@shared/i18n'
import type { TrameDocument, TrameElement, TramePage } from '@/types'

type Draft = Omit<TrameElement, 'id'>
interface TemplatePage {
  background: string
  elements: Draft[]
}

export type TemplateId = 'promo' | 'quote' | 'event' | 'story-new' | 'deck' | 'poster'
export type TemplateCategory = 'instagram' | 'story' | 'presentation' | 'poster'

export interface Template {
  id: TemplateId
  category: TemplateCategory
  width: number
  height: number
  pages: TemplatePage[]
}

/**
 * Les textes d'un modèle sont des clés de traduction (`L('tpl.promo.sale')`) résolues à l'utilisation, dans la langue courante :
 * le modèle est défini une fois, mais s'affiche et s'instancie dans la langue de l'interface.
 */
const PREFIX = 'i18n:'
const L = (key: MessageKey, params?: Params): string => PREFIX + JSON.stringify([key, params])

const localize = <T extends { text?: string }>(e: T): T => {
  if (!e.text?.startsWith(PREFIX)) return e
  const [key, params] = JSON.parse(e.text.slice(PREFIX.length)) as [MessageKey, Params | undefined]
  return { ...e, text: t(key, params) }
}

export const templateName = (tpl: Pick<Template, 'id'>): string => t(`tpl.${tpl.id}.name`)
export const templateCategory = (tpl: Pick<Template, 'category'>): string => t(`tpl.cat.${tpl.category}`)

const SANS = '"Inter", sans-serif'
const SERIF = '"Playfair Display", serif'
const DISPLAY = '"Bebas Neue", sans-serif'

type Geo = Pick<TrameElement, 'x' | 'y' | 'width' | 'height'>

const shape = (type: 'rect' | 'ellipse', g: Geo, fill: string, extra: Partial<Draft> = {}): Draft => ({
  type, ...g, fill, rotation: 0, opacity: 1, ...extra
})

const icon = (id: string, g: Geo, fill: string, extra: Partial<Draft> = {}): Draft => ({
  type: 'path', path: SHAPES.find((s) => s.id === id)!.path, ...g, fill, rotation: 0, opacity: 1, ...extra
})

const text = (
  x: number, y: number, width: number, value: string, fontSize: number, fill: string, extra: Partial<Draft> = {}
): Draft => ({
  type: 'text', x, y, width, height: fontSize * 1.2, rotation: 0, opacity: 1,
  text: value, fontSize, fill, fontFamily: SANS, fontStyle: 'bold', align: 'left', ...extra
})

const sq = (n: number) => ({ width: n, height: n })

export const TEMPLATES: Template[] = [
  {
    id: 'promo',
    category: 'instagram',
    width: 1080,
    height: 1080,
    pages: [
      {
        background: '#fff4e8',
        elements: [
          shape('ellipse', { x: 560, y: -220, ...sq(760) }, '#ff7a59'),
          icon('star', { x: 740, y: 120, ...sq(180) }, '#fff4e8'),
          text(80, 300, 900, L('tpl.promo.sale'), 190, '#1e1f24'),
          text(80, 540, 760, L('tpl.promo.text'), 52, '#3a3b45', { fontStyle: 'normal', height: 130 }),
          shape('rect', { x: 80, y: 780, width: 440, height: 120 }, '#1e1f24', { cornerRadius: 60 }),
          text(80, 818, 440, L('tpl.promo.cta'), 46, '#ffffff', { align: 'center' })
        ]
      }
    ]
  },
  {
    id: 'quote',
    category: 'instagram',
    width: 1080,
    height: 1080,
    pages: [
      {
        background: '#1e1f24',
        elements: [
          text(90, 40, 300, '“', 380, '#7c5cff', { fontFamily: SERIF }),
          text(110, 360, 860, L('tpl.quote.text'), 74, '#ffffff', { fontFamily: SERIF, fontStyle: 'italic', height: 240 }),
          shape('rect', { x: 110, y: 790, width: 120, height: 8 }, '#7c5cff'),
          text(110, 830, 860, L('tpl.quote.author'), 36, '#9a9cab', { fontStyle: 'normal' })
        ]
      }
    ]
  },
  {
    id: 'event',
    category: 'instagram',
    width: 1080,
    height: 1080,
    pages: [
      {
        background: '#7c5cff',
        elements: [
          shape('rect', { x: 80, y: 80, width: 920, height: 920 }, '#ffffff', { cornerRadius: 48 }),
          shape('ellipse', { x: 700, y: 120, ...sq(240) }, '#ffd166'),
          text(140, 190, 500, L('tpl.event.saveTheDate'), 36, '#7c5cff'),
          text(140, 300, 800, L('tpl.event.title'), 124, '#1e1f24', { height: 300 }),
          text(140, 660, 800, L('tpl.event.date'), 56, '#1e1f24', { fontStyle: 'normal' }),
          text(140, 750, 800, L('tpl.event.address'), 42, '#6b6b80', { fontStyle: 'normal' }),
          icon('arrow', { x: 140, y: 860, width: 150, height: 80 }, '#7c5cff')
        ]
      }
    ]
  },
  {
    id: 'story-new',
    category: 'story',
    width: 1080,
    height: 1920,
    pages: [
      {
        background: '#0f172a',
        elements: [
          shape('ellipse', { x: 140, y: 280, ...sq(800) }, '#38bdf8'),
          icon('bolt', { x: 340, y: 480, width: 400, height: 400 }, '#0f172a'),
          text(80, 1180, 920, L('tpl.story.new'), 170, '#ffffff', { align: 'center' }),
          text(80, 1420, 920, L('tpl.story.text'), 60, '#94a3b8', { fontStyle: 'normal', align: 'center' }),
          shape('rect', { x: 290, y: 1620, width: 500, height: 120 }, '#38bdf8', { cornerRadius: 60 }),
          text(290, 1658, 500, L('tpl.story.cta'), 46, '#0f172a', { align: 'center' })
        ]
      }
    ]
  },
  {
    id: 'deck',
    category: 'presentation',
    width: 1920,
    height: 1080,
    pages: [
      {
        background: '#f5f3ff',
        elements: [
          shape('rect', { x: 0, y: 0, width: 48, height: 1080 }, '#7c5cff'),
          text(160, 280, 1600, L('tpl.deck.title'), 130, '#1e1f24', { height: 280 }),
          text(160, 640, 1300, L('tpl.deck.subtitle'), 64, '#6b6b80', { fontStyle: 'normal' }),
          icon('hexagon', { x: 1500, y: 700, ...sq(260) }, '#7c5cff', { opacity: 0.25 })
        ]
      },
      {
        background: '#ffffff',
        elements: [
          text(160, 120, 1600, L('tpl.deck.keyPoints'), 110, '#1e1f24'),
          ...[0, 1, 2].flatMap((i): Draft[] => {
            const x = 160 + i * 580
            return [
              shape('rect', { x, y: 380, width: 520, height: 520 }, '#f5f3ff', { cornerRadius: 36 }),
              shape('ellipse', { x: x + 40, y: 420, ...sq(100) }, '#7c5cff'),
              text(x + 40, 446, 100, String(i + 1), 56, '#ffffff', { align: 'center' }),
              text(x + 40, 580, 440, L('tpl.deck.idea', { n: i + 1 }), 60, '#1e1f24'),
              text(x + 40, 670, 440, L('tpl.deck.ideaText'), 36, '#6b6b80', { fontStyle: 'normal', height: 120 })
            ]
          })
        ]
      }
    ]
  },
  {
    id: 'poster',
    category: 'poster',
    width: 794,
    height: 1123,
    pages: [
      {
        background: '#111111',
        elements: [
          shape('ellipse', { x: 117, y: 130, ...sq(560) }, '#ff3d71'),
          icon('star', { x: 497, y: 90, ...sq(160) }, '#ffd166'),
          text(40, 600, 714, L('tpl.poster.live'), 300, '#ffffff', { align: 'center', fontFamily: DISPLAY, fontStyle: 'normal' }),
          text(40, 880, 714, L('tpl.poster.title'), 64, '#ff3d71', { align: 'center' }),
          text(40, 970, 714, L('tpl.poster.info'), 34, '#bdbdbd', { fontStyle: 'normal', align: 'center' })
        ]
      }
    ]
  }
]

/** Construit un document neuf (identifiants frais) à partir d'un modèle. */
export function instantiate(tpl: Template): TrameDocument {
  return {
    version: 2,
    name: templateName(tpl),
    width: tpl.width,
    height: tpl.height,
    pages: tpl.pages.map(
      (p): TramePage => ({
        id: nanoid(8),
        background: p.background,
        elements: p.elements.map((e) => ({ ...localize(e), id: nanoid(8) }))
      })
    )
  }
}

/** Version page pour l'aperçu (ids stables non nécessaires). */
export const previewPage = (p: TemplatePage): TramePage => ({
  id: 'preview',
  background: p.background,
  elements: p.elements.map((e, i) => ({ ...localize(e), id: String(i) }))
})

/**
 * Copie d'un document dont tous les identifiants (pages, éléments, groupes) sont renouvelés :
 * un modèle utilisateur doit produire un document indépendant à chaque application.
 */
export function cloneWithNewIds(doc: TrameDocument): TrameDocument {
  const groups = new Map<string, string>()
  const group = (g: string | undefined): string | undefined => {
    if (!g) return undefined
    if (!groups.has(g)) groups.set(g, nanoid(8))
    return groups.get(g)
  }
  return {
    ...doc,
    pages: doc.pages.map((p) => ({
      ...p,
      id: nanoid(8),
      elements: p.elements.map((e) => ({ ...e, id: nanoid(8), ...(e.groupId ? { groupId: group(e.groupId) } : {}) }))
    }))
  }
}
