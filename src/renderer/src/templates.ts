import { nanoid } from 'nanoid'
import { bubbleDrafts, type BubbleId } from '@/bubbles'
import { t } from '@/i18n'
import { SHAPES } from '@/shapes'
import type { MessageKey, Params } from '@shared/i18n'
import { fillText } from '@/mailMerge'
import type { MergeData, TrameDocument, TrameElement, TramePage } from '@/types'

type Draft = Omit<TrameElement, 'id'>
interface TemplatePage {
  background: string
  elements: Draft[]
}

export type TemplateId = 'promo' | 'quote' | 'event' | 'story-new' | 'deck' | 'poster' | 'certificate' | 'badge' | 'label' | 'flashcard' | 'flashcard-qa' | 'comic-strip' | 'comic-4' | 'comic-6'
export type TemplateCategory = 'instagram' | 'story' | 'presentation' | 'poster' | 'mailmerge' | 'comic'

/** Tableau d'exemple d'un modèle de publipostage : noms des champs (clés `tpl.field.<id>`) et lignes fictives. */
interface MergeSample {
  fields: string[]
  rows: string[][]
}

export interface Template {
  /** modèle de publipostage : les champs et un tableau d'exemple (remplacé par le CSV de la personne) */
  merge?: MergeSample
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

/** Un champ de publipostage dans un texte de modèle : « ⟦first⟧ » devient « {{Prénom}} » (le nom du champ suit la langue). */
const F = (id: string): string => `\u27e6${id}\u27e7`
const fieldName = (id: string): string => t(`tpl.field.${id}` as MessageKey)
const withFields = (s: string): string => s.replace(/\u27e6(\w+)\u27e7/g, (_, id: string) => `{{${fieldName(id)}}}`)

const resolve = (text: string): string => {
  if (!text.startsWith(PREFIX)) return withFields(text)
  const [key, params] = JSON.parse(text.slice(PREFIX.length)) as [MessageKey, Params | undefined]
  return withFields(t(key, params))
}

const localize = <T extends { text?: string }>(e: T): T => (e.text === undefined ? e : { ...e, text: resolve(e.text) })

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

/** Case de bande dessinée : fond clair, contour épais. */
const panel = (g: Geo): Draft => shape('rect', g, '#ffffff', { stroke: '#1e1f24', strokeWidth: 6 })
/** Bulle d'exemple posée dans une case (le groupe réunit la bulle et son texte). */
const bubble = (id: BubbleId, g: { x: number; y: number; width: number }, key: MessageKey, group: string): Draft[] => bubbleDrafts(id, g, L(key), group)
const comicTitle = (): Draft => text(40, 24, 700, L('tpl.comic.title'), 46, '#1e1f24', { fontFamily: DISPLAY, fontStyle: 'normal', height: 56 })

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
  },
  {
    id: 'certificate',
    category: 'mailmerge',
    width: 1123,
    height: 794,
    merge: {
      fields: ['first', 'last', 'reason'],
      rows: [
        ['Ada', 'Lovelace', L('tpl.sample.reason1')],
        ['Alan', 'Turing', L('tpl.sample.reason2')],
        ['Grace', 'Hopper', L('tpl.sample.reason3')]
      ]
    },
    pages: [
      {
        background: '#fffaf0',
        elements: [
          shape('rect', { x: 28, y: 28, width: 1067, height: 738 }, '#b8893b'),
          shape('rect', { x: 36, y: 36, width: 1051, height: 722 }, '#fffaf0'),
          shape('rect', { x: 52, y: 52, width: 1019, height: 690 }, '#b8893b'),
          shape('rect', { x: 55, y: 55, width: 1013, height: 684 }, '#fffaf0'),
          icon('star', { x: 521, y: 88, ...sq(80) }, '#b8893b'),
          text(100, 190, 923, L('tpl.certificate.title'), 96, '#1e1f24', { align: 'center', fontFamily: SERIF, letterSpacing: 8 }),
          text(100, 318, 923, L('tpl.certificate.to'), 34, '#6b6b80', { align: 'center', fontStyle: 'normal' }),
          text(100, 378, 923, `${F('first')} ${F('last')}`, 84, '#b8893b', { mergeFit: true, align: 'center', fontFamily: SERIF, fontStyle: 'italic', height: 110 }),
          text(160, 510, 803, F('reason'), 36, '#3a3b45', { align: 'center', fontStyle: 'normal', height: 90 }),
          shape('rect', { x: 180, y: 660, width: 300, height: 2 }, '#1e1f24'),
          text(180, 672, 300, L('tpl.certificate.date'), 26, '#6b6b80', { align: 'center', fontStyle: 'normal' }),
          shape('rect', { x: 643, y: 660, width: 300, height: 2 }, '#1e1f24'),
          text(643, 672, 300, L('tpl.certificate.signature'), 26, '#6b6b80', { align: 'center', fontStyle: 'normal' })
        ]
      }
    ]
  },
  {
    id: 'badge',
    category: 'mailmerge',
    width: 640,
    height: 420,
    merge: {
      fields: ['first', 'last', 'class'],
      rows: [
        ['Ada', 'Lovelace', '6A'],
        ['Alan', 'Turing', '6B'],
        ['Grace', 'Hopper', '6A']
      ]
    },
    pages: [
      {
        background: '#ffffff',
        elements: [
          shape('rect', { x: 0, y: 0, width: 640, height: 150 }, '#e63946'),
          text(0, 22, 640, L('tpl.badge.hello'), 72, '#ffffff', { align: 'center', fontFamily: DISPLAY, fontStyle: 'normal', letterSpacing: 4 }),
          text(0, 100, 640, L('tpl.badge.myname'), 34, '#ffffff', { align: 'center', fontStyle: 'normal' }),
          text(30, 180, 580, F('first'), 92, '#1e1f24', { mergeFit: true, align: 'center', height: 112 }),
          text(30, 295, 580, F('last'), 44, '#6b6b80', { mergeFit: true, align: 'center', fontStyle: 'normal', height: 54 }),
          shape('rect', { x: 220, y: 358, width: 200, height: 50 }, '#1e1f24', { cornerRadius: 25 }),
          text(220, 367, 200, F('class'), 30, '#ffffff', { mergeFit: true, align: 'center', height: 36 })
        ]
      }
    ]
  },
  {
    id: 'label',
    category: 'mailmerge',
    width: 680,
    height: 260,
    merge: {
      fields: ['first', 'last', 'class'],
      rows: [
        ['Ada', 'Lovelace', '6A'],
        ['Alan', 'Turing', '6B'],
        ['Grace', 'Hopper', '6A']
      ]
    },
    pages: [
      {
        background: '#ffffff',
        elements: [
          shape('rect', { x: 0, y: 0, width: 24, height: 260 }, '#2a9d8f'),
          text(60, 38, 590, `${F('last')} ${F('first')}`, 64, '#1e1f24', { mergeFit: true, height: 78 }),
          text(60, 126, 590, L('tpl.label.class', { field: F('class') }), 40, '#2a9d8f', { mergeFit: true, height: 48 }),
          shape('rect', { x: 60, y: 196, width: 560, height: 2 }, '#cfd2d8'),
          text(60, 210, 560, L('tpl.label.subject'), 28, '#6b6b80', { fontStyle: 'normal', height: 34 })
        ]
      }
    ]
  },
  {
    id: 'flashcard',
    category: 'mailmerge',
    width: 794,
    height: 563,
    merge: {
      fields: ['word', 'translation'],
      rows: [
        ['le chat', 'the cat'],
        ['le chien', 'the dog'],
        ['le livre', 'the book']
      ]
    },
    pages: [
      {
        background: '#fff7e6',
        elements: [
          shape('rect', { x: 24, y: 24, width: 746, height: 515 }, '#c9822b'),
          shape('rect', { x: 29, y: 29, width: 736, height: 505 }, '#fff7e6'),
          text(60, 56, 400, L('tpl.flashcard.front'), 28, '#c9822b', { fontStyle: 'normal', height: 34 }),
          text(60, 230, 674, F('word'), 84, '#1e1f24', { mergeFit: true, align: 'center', fontFamily: SERIF, height: 102 })
        ]
      },
      {
        background: '#e8f4ff',
        elements: [
          shape('rect', { x: 24, y: 24, width: 746, height: 515 }, '#2f6fb3'),
          shape('rect', { x: 29, y: 29, width: 736, height: 505 }, '#e8f4ff'),
          text(60, 56, 400, L('tpl.flashcard.back'), 28, '#2f6fb3', { fontStyle: 'normal', height: 34 }),
          text(60, 230, 674, F('translation'), 84, '#1e1f24', { mergeFit: true, align: 'center', fontFamily: SERIF, height: 102 })
        ]
      }
    ]
  },
  {
    id: 'comic-strip',
    category: 'comic',
    width: 1123,
    height: 794,
    pages: [
      {
        background: '#fffdf5',
        elements: [
          comicTitle(),
          panel({ x: 40, y: 100, width: 331, height: 640 }),
          panel({ x: 395, y: 100, width: 331, height: 640 }),
          panel({ x: 750, y: 100, width: 333, height: 640 }),
          ...bubble('speech-l', { x: 62, y: 130, width: 250 }, 'tpl.comic.hello', 'comic-strip-1'),
          ...bubble('caption', { x: 415, y: 118, width: 291 }, 'tpl.comic.caption', 'comic-strip-2'),
          ...bubble('shout', { x: 780, y: 160, width: 270 }, 'tpl.comic.shout', 'comic-strip-3')
        ]
      }
    ]
  },
  {
    id: 'comic-4',
    category: 'comic',
    width: 794,
    height: 1123,
    pages: [
      {
        background: '#fffdf5',
        elements: [
          comicTitle(),
          panel({ x: 40, y: 100, width: 345, height: 479 }),
          panel({ x: 409, y: 100, width: 345, height: 479 }),
          panel({ x: 40, y: 603, width: 345, height: 479 }),
          panel({ x: 409, y: 603, width: 345, height: 479 }),
          ...bubble('speech-l', { x: 62, y: 124, width: 240 }, 'tpl.comic.hello', 'comic-4-1'),
          ...bubble('caption', { x: 427, y: 118, width: 309 }, 'tpl.comic.caption', 'comic-4-2'),
          ...bubble('thought-r', { x: 100, y: 640, width: 240 }, 'tpl.comic.thought', 'comic-4-3'),
          ...bubble('shout', { x: 450, y: 660, width: 270 }, 'tpl.comic.shout', 'comic-4-4')
        ]
      }
    ]
  },
  {
    id: 'comic-6',
    category: 'comic',
    width: 794,
    height: 1123,
    pages: [
      {
        background: '#fffdf5',
        elements: [
          comicTitle(),
          panel({ x: 40, y: 100, width: 230, height: 311 }),
          panel({ x: 294, y: 100, width: 460, height: 311 }),
          panel({ x: 40, y: 435, width: 460, height: 311 }),
          panel({ x: 524, y: 435, width: 230, height: 311 }),
          panel({ x: 40, y: 770, width: 222, height: 312 }),
          panel({ x: 286, y: 770, width: 222, height: 312 }),
          panel({ x: 532, y: 770, width: 222, height: 312 }),
          ...bubble('speech-l', { x: 330, y: 114, width: 220 }, 'tpl.comic.hello', 'comic-6-1'),
          ...bubble('caption', { x: 58, y: 450, width: 424 }, 'tpl.comic.caption', 'comic-6-2'),
          ...bubble('thought-l', { x: 300, y: 790, width: 190 }, 'tpl.comic.thought', 'comic-6-3'),
          ...bubble('shout', { x: 545, y: 800, width: 196 }, 'tpl.comic.shout', 'comic-6-4')
        ]
      }
    ]
  },
  {
    id: 'flashcard-qa',
    category: 'mailmerge',
    width: 794,
    height: 563,
    merge: {
      fields: ['question', 'answer'],
      rows: [
        ['7 \u00d7 8 ?', '56'],
        ['12 + 15 ?', '27'],
        ['9 \u00d7 6 ?', '54']
      ]
    },
    pages: [
      {
        background: '#f3eefc',
        elements: [
          shape('rect', { x: 24, y: 24, width: 746, height: 515 }, '#7a4fd1'),
          shape('rect', { x: 29, y: 29, width: 736, height: 505 }, '#f3eefc'),
          text(60, 56, 400, L('tpl.flashcard-qa.front'), 28, '#7a4fd1', { fontStyle: 'normal', height: 34 }),
          text(590, 40, 150, '?', 130, '#d9cdf3', { align: 'right', fontFamily: SERIF, height: 156 }),
          text(60, 215, 674, F('question'), 76, '#1e1f24', { mergeFit: true, align: 'center', fontFamily: SERIF, height: 92 })
        ]
      },
      {
        background: '#e6f6ee',
        elements: [
          shape('rect', { x: 24, y: 24, width: 746, height: 515 }, '#2f9e6f'),
          shape('rect', { x: 29, y: 29, width: 736, height: 505 }, '#e6f6ee'),
          text(60, 56, 400, L('tpl.flashcard-qa.back'), 28, '#2f9e6f', { fontStyle: 'normal', height: 34 }),
          icon('check', { x: 660, y: 56, ...sq(80) }, '#bfe6d3'),
          text(60, 215, 674, F('answer'), 96, '#1e1f24', { mergeFit: true, align: 'center', fontFamily: SERIF, height: 116 })
        ]
      }
    ]
  }
]

/** Tableau d'exemple d'un modèle, dans la langue courante. */
const sampleData = (tpl: Template): MergeData | undefined =>
  tpl.merge && { columns: tpl.merge.fields.map(fieldName), rows: tpl.merge.rows.map((r) => r.map(resolve)) }

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
    ),
    ...(tpl.merge ? { mailMerge: sampleData(tpl) } : {})
  }
}

/** Version page pour l'aperçu (ids stables non nécessaires) : pour un modèle de publipostage, remplie avec la première ligne d'exemple. */
export const previewPage = (p: TemplatePage, tpl?: Pick<Template, 'merge'>): TramePage => {
  const sample = tpl?.merge && { columns: tpl.merge.fields.map(fieldName), row: tpl.merge.rows[0].map(resolve) }
  return {
    id: 'preview',
    background: p.background,
    elements: p.elements.map((e, i) => {
      const local = localize(e)
      return { ...local, id: String(i), ...(sample && local.text ? { text: fillText(local.text, sample.columns, sample.row) } : {}) }
    })
  }
}

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
