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

export type TemplateId = 'promo' | 'quote' | 'event' | 'story-new' | 'deck' | 'poster' | 'resume' | 'letter' | 'card' | 'flyer' | 'invitation' | 'linkedin' | 'thumbnail' | 'carousel' | 'poster-sale' | 'poster-talk' | 'poster-school' | 'logo-monogram' | 'logo-badge' | 'logo-emblem' | 'menu' | 'planner' | 'report' | 'newsletter' | 'certificate' | 'badge' | 'label' | 'flashcard' | 'flashcard-qa' | 'comic-strip' | 'comic-4' | 'comic-6'
export type TemplateCategory = 'instagram' | 'story' | 'presentation' | 'poster' | 'document' | 'print' | 'social' | 'logo' | 'mailmerge' | 'comic'

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
    id: 'resume',
    category: 'document',
    width: 794,
    height: 1123,
    pages: [
      {
        background: '#ffffff',
        elements: [
          shape('rect', { x: 0, y: 0, width: 260, height: 1123 }, '#22304a'),
          shape('ellipse', { x: 65, y: 60, ...sq(130) }, '#3b4d72'),
          text(65, 100, 130, L('tpl.resume.initials'), 52, '#ffffff', { align: 'center', fontFamily: SERIF, height: 64 }),
          text(30, 250, 200, L('tpl.resume.contact.title'), 18, '#ffd166', { letterSpacing: 2, uppercase: true }),
          text(30, 284, 210, L('tpl.resume.contact.text'), 14, '#d7deee', { fontStyle: 'normal', lineHeight: 1.6, height: 100 }),
          text(30, 430, 200, L('tpl.resume.skills.title'), 18, '#ffd166', { letterSpacing: 2, uppercase: true }),
          text(30, 464, 210, L('tpl.resume.skills.text'), 14, '#d7deee', { fontStyle: 'normal', lineHeight: 1.6, height: 130 }),
          text(30, 640, 200, L('tpl.resume.languages.title'), 18, '#ffd166', { letterSpacing: 2, uppercase: true }),
          text(30, 674, 210, L('tpl.resume.languages.text'), 14, '#d7deee', { fontStyle: 'normal', lineHeight: 1.6, height: 100 }),
          text(300, 64, 460, L('tpl.resume.fullname'), 52, '#1e1f24', { fontFamily: SERIF, height: 64 }),
          text(300, 134, 460, L('tpl.resume.role'), 22, '#4a63a8', { fontStyle: 'normal', height: 30 }),
          shape('rect', { x: 300, y: 184, width: 60, height: 4 }, '#ffd166'),
          text(300, 220, 460, L('tpl.resume.profile.title'), 20, '#22304a', { letterSpacing: 2, uppercase: true }),
          text(300, 256, 460, L('tpl.resume.profile.text'), 15, '#3a3b45', { fontStyle: 'normal', lineHeight: 1.5, height: 100 }),
          text(300, 392, 460, L('tpl.resume.exp.title'), 20, '#22304a', { letterSpacing: 2, uppercase: true }),
          text(300, 430, 460, L('tpl.resume.job1.title'), 17, '#1e1f24', { height: 22 }),
          text(300, 456, 460, L('tpl.resume.job1.dates'), 13, '#6b6b80', { fontStyle: 'normal', height: 18 }),
          text(300, 480, 460, L('tpl.resume.job1.text'), 15, '#3a3b45', { fontStyle: 'normal', lineHeight: 1.5, height: 46 }),
          text(300, 552, 460, L('tpl.resume.job2.title'), 17, '#1e1f24', { height: 22 }),
          text(300, 578, 460, L('tpl.resume.job2.dates'), 13, '#6b6b80', { fontStyle: 'normal', height: 18 }),
          text(300, 602, 460, L('tpl.resume.job2.text'), 15, '#3a3b45', { fontStyle: 'normal', lineHeight: 1.5, height: 46 }),
          text(300, 674, 460, L('tpl.resume.job3.title'), 17, '#1e1f24', { height: 22 }),
          text(300, 700, 460, L('tpl.resume.job3.dates'), 13, '#6b6b80', { fontStyle: 'normal', height: 18 }),
          text(300, 724, 460, L('tpl.resume.job3.text'), 15, '#3a3b45', { fontStyle: 'normal', lineHeight: 1.5, height: 46 }),
          text(300, 820, 460, L('tpl.resume.edu.title'), 20, '#22304a', { letterSpacing: 2, uppercase: true }),
          text(300, 858, 460, L('tpl.resume.edu1.title'), 17, '#1e1f24', { height: 44 }),
          text(300, 906, 460, L('tpl.resume.edu1.dates'), 13, '#6b6b80', { fontStyle: 'normal', height: 18 })
        ]
      }
    ]
  },
  {
    id: 'letter',
    category: 'document',
    width: 794,
    height: 1123,
    pages: [
      {
        background: '#ffffff',
        elements: [
          shape('rect', { x: 0, y: 0, width: 794, height: 14 }, '#22304a'),
          text(70, 70, 340, L('tpl.letter.sender.name'), 22, '#1e1f24', { height: 28 }),
          text(70, 104, 340, L('tpl.letter.sender.address'), 15, '#6b6b80', { fontStyle: 'normal', lineHeight: 1.5, height: 70 }),
          text(440, 190, 284, L('tpl.letter.recipient'), 16, '#1e1f24', { fontStyle: 'normal', lineHeight: 1.5, height: 100 }),
          text(440, 320, 284, L('tpl.letter.date'), 15, '#6b6b80', { fontStyle: 'normal', height: 20 }),
          text(70, 380, 654, L('tpl.letter.subject'), 18, '#1e1f24', { height: 24 }),
          text(70, 440, 654, L('tpl.letter.body'), 16, '#3a3b45', { fontStyle: 'normal', lineHeight: 1.6, height: 330 }),
          text(70, 800, 654, L('tpl.letter.closing'), 16, '#3a3b45', { fontStyle: 'normal', height: 24 }),
          text(70, 850, 300, L('tpl.letter.sender.name'), 48, '#22304a', { fontFamily: '"Caveat", cursive', fontStyle: 'normal', height: 58 })
        ]
      }
    ]
  },
  {
    id: 'card',
    category: 'print',
    width: 1050,
    height: 600,
    pages: [
      {
        background: '#1e1f24',
        elements: [
          shape('ellipse', { x: 700, y: -170, ...sq(560) }, '#7c5cff'),
          shape('ellipse', { x: 820, y: 330, ...sq(300) }, '#ffd166'),
          shape('rect', { x: 80, y: 190, width: 90, height: 8 }, '#ffd166'),
          text(80, 230, 700, L('tpl.card.person'), 76, '#ffffff', { fontFamily: SERIF, height: 92 }),
          text(80, 332, 700, L('tpl.card.role'), 34, '#c9c3ff', { fontStyle: 'normal', height: 42 })
        ]
      },
      {
        background: '#ffffff',
        elements: [
          shape('rect', { x: 0, y: 0, width: 24, height: 600 }, '#7c5cff'),
          text(90, 90, 700, L('tpl.card.company'), 40, '#1e1f24', { height: 48 }),
          shape('rect', { x: 90, y: 160, width: 90, height: 8 }, '#ffd166'),
          text(90, 210, 800, L('tpl.card.contact'), 32, '#3a3b45', { fontStyle: 'normal', lineHeight: 1.7, height: 220 })
        ]
      }
    ]
  },
  {
    id: 'flyer',
    category: 'print',
    width: 559,
    height: 794,
    pages: [
      {
        background: '#fffbf2',
        elements: [
          shape('rect', { x: 0, y: 0, width: 559, height: 330 }, '#e63946'),
          shape('ellipse', { x: 390, y: 100, ...sq(230) }, '#ff7a59'),
          text(40, 50, 479, L('tpl.flyer.title'), 100, '#ffffff', { fontFamily: DISPLAY, fontStyle: 'normal', lineHeight: 1, height: 200 }),
          text(40, 262, 479, L('tpl.flyer.subtitle'), 22, '#ffffff', { fontStyle: 'normal', height: 28 }),
          text(40, 372, 479, L('tpl.flyer.date'), 30, '#1e1f24', { height: 38 }),
          text(40, 436, 479, L('tpl.flyer.text'), 20, '#3a3b45', { fontStyle: 'normal', lineHeight: 1.5, height: 120 }),
          text(40, 590, 479, L('tpl.flyer.place'), 20, '#1e1f24', { lineHeight: 1.5, height: 60 }),
          shape('rect', { x: 40, y: 690, width: 280, height: 64 }, '#1e1f24', { cornerRadius: 32 }),
          text(40, 705, 280, L('tpl.flyer.cta'), 24, '#ffffff', { align: 'center', height: 30 })
        ]
      }
    ]
  },
  {
    id: 'invitation',
    category: 'print',
    width: 559,
    height: 794,
    pages: [
      {
        background: '#fffaf0',
        elements: [
          shape('rect', { x: 24, y: 24, width: 511, height: 746 }, '#b8893b'),
          shape('rect', { x: 29, y: 29, width: 501, height: 736 }, '#fffaf0'),
          shape('rect', { x: 42, y: 42, width: 475, height: 710 }, '#b8893b'),
          shape('rect', { x: 44, y: 44, width: 471, height: 706 }, '#fffaf0'),
          icon('star', { x: 240, y: 100, ...sq(80) }, '#b8893b'),
          text(70, 210, 419, L('tpl.invitation.kicker'), 22, '#6b6b80', { align: 'center', fontStyle: 'normal', letterSpacing: 4, uppercase: true, height: 28 }),
          text(70, 270, 419, L('tpl.invitation.title'), 64, '#1e1f24', { align: 'center', fontFamily: SERIF, fontStyle: 'italic', lineHeight: 1.1, height: 150 }),
          text(70, 450, 419, L('tpl.invitation.who'), 26, '#b8893b', { align: 'center', fontFamily: SERIF, height: 34 }),
          shape('rect', { x: 230, y: 520, width: 100, height: 2 }, '#b8893b'),
          text(70, 560, 419, L('tpl.invitation.date'), 26, '#1e1f24', { align: 'center', height: 34 }),
          text(70, 610, 419, L('tpl.invitation.place'), 22, '#3a3b45', { align: 'center', fontStyle: 'normal', height: 30 }),
          text(70, 680, 419, L('tpl.invitation.rsvp'), 18, '#6b6b80', { align: 'center', fontStyle: 'italic', height: 24 })
        ]
      }
    ]
  },
  {
    id: 'linkedin',
    category: 'social',
    width: 1584,
    height: 396,
    pages: [
      {
        background: '#0f2a4a',
        elements: [
          shape('ellipse', { x: 1160, y: -180, ...sq(560) }, '#1d4e89'),
          shape('ellipse', { x: 1360, y: 190, ...sq(300) }, '#ffd166'),
          shape('rect', { x: 120, y: 118, width: 90, height: 8 }, '#ffd166'),
          text(120, 150, 1000, L('tpl.linkedin.person'), 84, '#ffffff', { fontFamily: SERIF, height: 100 }),
          text(120, 262, 1000, L('tpl.linkedin.tagline'), 34, '#a9c4ee', { fontStyle: 'normal', height: 42 })
        ]
      }
    ]
  },
  {
    id: 'thumbnail',
    category: 'social',
    width: 1280,
    height: 720,
    pages: [
      {
        background: '#ffd166',
        elements: [
          shape('ellipse', { x: 800, y: 110, ...sq(400) }, '#e63946'),
          icon('star', { x: 875, y: 185, ...sq(250) }, '#ffffff'),
          text(70, 110, 800, L('tpl.thumbnail.title'), 150, '#1e1f24', { fontFamily: DISPLAY, fontStyle: 'normal', lineHeight: 1, height: 320 }),
          shape('rect', { x: 70, y: 520, width: 420, height: 100 }, '#1e1f24', { cornerRadius: 50 }),
          text(70, 545, 420, L('tpl.thumbnail.tag'), 44, '#ffffff', { align: 'center', fontFamily: DISPLAY, fontStyle: 'normal', letterSpacing: 2, height: 52 })
        ]
      }
    ]
  },
  {
    id: 'carousel',
    category: 'instagram',
    width: 1080,
    height: 1350,
    pages: [
      {
        background: '#1e1f24',
        elements: [
          shape('ellipse', { x: 560, y: -240, ...sq(760) }, '#7c5cff'),
          text(90, 560, 900, L('tpl.carousel.kicker'), 40, '#ffd166', { letterSpacing: 6, height: 50 }),
          text(90, 640, 900, L('tpl.carousel.cover'), 130, '#ffffff', { fontFamily: SERIF, lineHeight: 1.05, height: 290 }),
          text(90, 1170, 600, L('tpl.carousel.swipe'), 44, '#9a9cab', { fontStyle: 'normal', height: 54 }),
          icon('arrow', { x: 850, y: 1172, width: 140, height: 56 }, '#9a9cab')
        ]
      },
      {
        background: '#fff4e8',
        elements: [
          text(90, 120, 300, L('tpl.carousel.number'), 400, '#7c5cff', { fontFamily: DISPLAY, fontStyle: 'normal', height: 440 }),
          text(90, 560, 900, L('tpl.carousel.tip.title'), 80, '#1e1f24', { lineHeight: 1.1, height: 180 }),
          text(90, 780, 900, L('tpl.carousel.tip.text'), 46, '#3a3b45', { fontStyle: 'normal', lineHeight: 1.4, height: 260 })
        ]
      },
      {
        background: '#7c5cff',
        elements: [
          icon('star', { x: 440, y: 260, ...sq(200) }, '#ffd166'),
          text(90, 560, 900, L('tpl.carousel.end.title'), 110, '#ffffff', { align: 'center', fontFamily: SERIF, lineHeight: 1.05, height: 130 }),
          text(150, 740, 780, L('tpl.carousel.end.text'), 46, '#e9e3ff', { align: 'center', fontStyle: 'normal', lineHeight: 1.4, height: 130 }),
          shape('rect', { x: 340, y: 980, width: 400, height: 110 }, '#ffd166', { cornerRadius: 55 }),
          text(340, 1012, 400, L('tpl.carousel.end.cta'), 46, '#1e1f24', { align: 'center', height: 54 })
        ]
      }
    ]
  },
  {
    id: 'poster-sale',
    category: 'poster',
    width: 794,
    height: 1123,
    pages: [
      {
        background: '#ffd166',
        elements: [
          shape('ellipse', { x: 430, y: -140, ...sq(560) }, '#ff7a59'),
          text(60, 140, 674, L('tpl.sale.title'), 210, '#1e1f24', { fontFamily: DISPLAY, fontStyle: 'normal', lineHeight: 0.95, height: 420 }),
          text(60, 610, 674, L('tpl.sale.date'), 40, '#1e1f24', { height: 50 }),
          shape('rect', { x: 60, y: 690, width: 120, height: 8 }, '#1e1f24'),
          text(60, 730, 674, L('tpl.sale.text'), 26, '#3a3b45', { fontStyle: 'normal', lineHeight: 1.5, height: 120 }),
          shape('rect', { x: 60, y: 930, width: 674, height: 110 }, '#1e1f24', { cornerRadius: 20 }),
          text(60, 964, 674, L('tpl.sale.place'), 32, '#ffffff', { align: 'center', height: 42 })
        ]
      }
    ]
  },
  {
    id: 'poster-talk',
    category: 'poster',
    width: 794,
    height: 1123,
    pages: [
      {
        background: '#0f2a4a',
        elements: [
          shape('ellipse', { x: 400, y: 470, ...sq(440) }, '#1d4e89'),
          shape('ellipse', { x: 600, y: 690, ...sq(220) }, '#ffd166'),
          text(60, 90, 674, L('tpl.talk.kicker'), 26, '#ffd166', { letterSpacing: 6, height: 34 }),
          text(60, 150, 674, L('tpl.talk.title'), 92, '#ffffff', { fontFamily: SERIF, lineHeight: 1.05, height: 300 }),
          text(60, 640, 340, L('tpl.talk.with'), 22, '#a9c4ee', { fontStyle: 'normal', height: 28 }),
          text(60, 678, 340, L('tpl.talk.speaker'), 40, '#ffffff', { lineHeight: 1.15, height: 100 }),
          text(60, 790, 340, L('tpl.talk.role'), 22, '#a9c4ee', { fontStyle: 'normal', lineHeight: 1.4, height: 64 }),
          shape('rect', { x: 60, y: 960, width: 674, height: 2 }, '#3a5a85'),
          text(60, 990, 674, L('tpl.talk.date'), 34, '#ffffff', { height: 42 }),
          text(60, 1040, 674, L('tpl.talk.place'), 24, '#a9c4ee', { fontStyle: 'normal', height: 30 })
        ]
      }
    ]
  },
  {
    id: 'poster-school',
    category: 'poster',
    width: 794,
    height: 1123,
    pages: [
      {
        background: '#e8f4ff',
        elements: [
          shape('ellipse', { x: -120, y: -120, ...sq(380) }, '#ffd166'),
          shape('ellipse', { x: 580, y: 60, ...sq(300) }, '#ff7a59'),
          shape('ellipse', { x: 600, y: 860, ...sq(360) }, '#2a9d8f'),
          text(60, 300, 674, L('tpl.school.title'), 170, '#2f6fb3', { fontFamily: DISPLAY, fontStyle: 'normal', lineHeight: 0.95, height: 330 }),
          text(60, 680, 674, L('tpl.school.date'), 40, '#1e1f24', { height: 54 }),
          text(60, 770, 500, L('tpl.school.program'), 28, '#3a3b45', { fontStyle: 'normal', lineHeight: 1.6, height: 190 }),
          text(60, 1010, 500, L('tpl.school.place'), 26, '#2f6fb3', { height: 34 })
        ]
      }
    ]
  },
  {
    id: 'logo-monogram',
    category: 'logo',
    width: 1000,
    height: 1000,
    pages: [
      {
        background: '#ffffff',
        elements: [
          shape('ellipse', { x: 200, y: 110, ...sq(600) }, '#22304a'),
          shape('ellipse', { x: 230, y: 140, ...sq(540) }, '#22304a', { stroke: '#ffd166', strokeWidth: 6 }),
          text(200, 320, 600, L('tpl.logo.initials'), 220, '#ffffff', { align: 'center', fontFamily: SERIF, height: 270 }),
          text(100, 780, 800, L('tpl.logo.name'), 58, '#22304a', { align: 'center', letterSpacing: 10, height: 70 }),
          text(100, 866, 800, L('tpl.logo.tagline'), 28, '#6b6b80', { align: 'center', fontStyle: 'normal', letterSpacing: 4, height: 34 })
        ]
      }
    ]
  },
  {
    id: 'logo-badge',
    category: 'logo',
    width: 1000,
    height: 1000,
    pages: [
      {
        background: '#ffffff',
        elements: [
          shape('ellipse', { x: 150, y: 150, ...sq(700) }, '#1e1f24'),
          shape('ellipse', { x: 190, y: 190, ...sq(620) }, '#fffaf0'),
          text(190, 312, 620, L('tpl.logo.badge.top'), 44, '#1e1f24', { align: 'center', letterSpacing: 8, height: 54 }),
          icon('star', { x: 450, y: 390, ...sq(100) }, '#e63946'),
          text(190, 520, 620, L('tpl.logo.badge.main'), 120, '#e63946', { align: 'center', fontFamily: DISPLAY, fontStyle: 'normal', height: 140 }),
          text(190, 680, 620, L('tpl.logo.badge.since'), 32, '#1e1f24', { align: 'center', fontStyle: 'normal', letterSpacing: 6, height: 40 })
        ]
      }
    ]
  },
  {
    id: 'logo-emblem',
    category: 'logo',
    width: 1000,
    height: 1000,
    pages: [
      {
        background: '#ffffff',
        elements: [
          icon('hexagon', { x: 250, y: 110, ...sq(500) }, '#2a9d8f'),
          icon('bolt', { x: 370, y: 230, ...sq(260) }, '#ffffff'),
          text(100, 650, 800, L('tpl.logo.emblem.name'), 190, '#1e1f24', { align: 'center', fontFamily: DISPLAY, fontStyle: 'normal', letterSpacing: 20, height: 210 }),
          text(100, 870, 800, L('tpl.logo.emblem.tagline'), 30, '#6b6b80', { align: 'center', fontStyle: 'normal', letterSpacing: 6, height: 36 })
        ]
      }
    ]
  },
  {
    id: 'menu',
    category: 'document',
    width: 794,
    height: 1123,
    pages: [
      {
        background: '#fffaf0',
        elements: [
          shape('rect', { x: 30, y: 30, width: 734, height: 1063 }, '#b8893b'),
          shape('rect', { x: 34, y: 34, width: 726, height: 1055 }, '#fffaf0'),
          text(60, 80, 674, L('tpl.menu.title'), 72, '#1e1f24', { align: 'center', fontFamily: SERIF, fontStyle: 'italic', height: 90 }),
          text(60, 176, 674, L('tpl.menu.subtitle'), 22, '#6b6b80', { align: 'center', fontStyle: 'normal', letterSpacing: 6, uppercase: true, height: 28 }),
          text(60, 270, 674, L('tpl.menu.starters'), 36, '#b8893b', { align: 'center', fontFamily: SERIF, height: 44 }),
          text(60, 330, 674, L('tpl.menu.starters.items'), 24, '#3a3b45', { align: 'center', fontStyle: 'normal', lineHeight: 1.8, height: 130 }),
          shape('rect', { x: 347, y: 490, width: 100, height: 2 }, '#b8893b'),
          text(60, 530, 674, L('tpl.menu.mains'), 36, '#b8893b', { align: 'center', fontFamily: SERIF, height: 44 }),
          text(60, 590, 674, L('tpl.menu.mains.items'), 24, '#3a3b45', { align: 'center', fontStyle: 'normal', lineHeight: 1.8, height: 130 }),
          shape('rect', { x: 347, y: 750, width: 100, height: 2 }, '#b8893b'),
          text(60, 790, 674, L('tpl.menu.desserts'), 36, '#b8893b', { align: 'center', fontFamily: SERIF, height: 44 }),
          text(60, 850, 674, L('tpl.menu.desserts.items'), 24, '#3a3b45', { align: 'center', fontStyle: 'normal', lineHeight: 1.8, height: 130 }),
          text(60, 1010, 674, L('tpl.menu.footer'), 22, '#6b6b80', { align: 'center', fontStyle: 'italic', height: 28 })
        ]
      }
    ]
  },
  {
    id: 'planner',
    category: 'document',
    width: 1123,
    height: 794,
    pages: [
      {
        background: '#ffffff',
        elements: [
          text(37, 40, 700, L('tpl.planner.title'), 64, '#22304a', { fontFamily: DISPLAY, fontStyle: 'normal', height: 78 }),
          text(700, 66, 386, L('tpl.planner.week'), 26, '#6b6b80', { align: 'right', fontStyle: 'normal', height: 34 }),
          ...([1, 2, 3, 4, 5, 6, 7] as const).flatMap((d): Draft[] => {
            const x = 37 + (d - 1) * 151
            return [
              shape('rect', { x, y: 140, width: 143, height: 560 }, '#ffffff', { stroke: '#cfd2d8', strokeWidth: 2 }),
              shape('rect', { x, y: 140, width: 143, height: 50 }, d > 5 ? '#4a63a8' : '#22304a'),
              text(x, 152, 143, L(`tpl.planner.d${d}` as MessageKey), 20, '#ffffff', { align: 'center', height: 26 })
            ]
          }),
          text(37, 722, 1049, L('tpl.planner.notes'), 22, '#6b6b80', { fontStyle: 'normal', height: 28 })
        ]
      }
    ]
  },
  {
    id: 'report',
    category: 'document',
    width: 794,
    height: 1123,
    pages: [
      {
        background: '#ffffff',
        elements: [
          shape('rect', { x: 0, y: 0, width: 794, height: 560 }, '#22304a'),
          shape('ellipse', { x: 520, y: 260, ...sq(420) }, '#1d4e89'),
          text(70, 150, 600, L('tpl.report.kicker'), 22, '#ffd166', { letterSpacing: 6, height: 28 }),
          text(70, 200, 600, L('tpl.report.title'), 76, '#ffffff', { fontFamily: SERIF, lineHeight: 1.05, height: 170 }),
          text(70, 440, 600, L('tpl.report.subtitle'), 26, '#a9c4ee', { fontStyle: 'normal', height: 34 }),
          text(70, 640, 600, L('tpl.report.by'), 20, '#6b6b80', { fontStyle: 'normal', height: 26 }),
          text(70, 674, 600, L('tpl.report.author'), 34, '#1e1f24', { height: 42 }),
          text(70, 730, 600, L('tpl.report.date'), 24, '#6b6b80', { fontStyle: 'normal', height: 30 }),
          shape('rect', { x: 70, y: 1000, width: 654, height: 2 }, '#cfd2d8'),
          text(70, 1022, 654, L('tpl.report.footer'), 20, '#6b6b80', { fontStyle: 'normal', height: 26 })
        ]
      }
    ]
  },
  {
    id: 'newsletter',
    category: 'document',
    width: 794,
    height: 1123,
    pages: [
      {
        background: '#ffffff',
        elements: [
          shape('rect', { x: 0, y: 0, width: 794, height: 150 }, '#e63946'),
          text(60, 28, 674, L('tpl.news.name'), 90, '#ffffff', { fontFamily: DISPLAY, fontStyle: 'normal', letterSpacing: 4, height: 100 }),
          text(60, 112, 674, L('tpl.news.issue'), 22, '#ffe3e6', { fontStyle: 'normal', height: 28 }),
          shape('rect', { x: 60, y: 190, width: 674, height: 260 }, '#e8e8ee'),
          icon('star', { x: 357, y: 270, ...sq(100) }, '#cfd2d8'),
          text(60, 480, 674, L('tpl.news.headline'), 44, '#1e1f24', { fontFamily: SERIF, lineHeight: 1.1, height: 100 }),
          text(60, 600, 674, L('tpl.news.lead'), 18, '#3a3b45', { fontStyle: 'normal', lineHeight: 1.6, height: 100 }),
          shape('rect', { x: 60, y: 716, width: 674, height: 2 }, '#e63946'),
          text(60, 742, 674, L('tpl.news.columns'), 17, '#3a3b45', { fontStyle: 'normal', lineHeight: 1.6, columns: 2, columnGap: 40, height: 250 }),
          text(60, 1050, 674, L('tpl.news.footer'), 14, '#6b6b80', { fontStyle: 'normal', height: 20 })
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
