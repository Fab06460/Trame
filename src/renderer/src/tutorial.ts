import { nanoid } from 'nanoid'
import type { TrameDocument, TrameElement, TramePage } from '@/types'
import { TUTORIAL_MAX_STEPS, type ClickPoint } from '@shared/capture'

/** Une étape : l'image de l'écran au moment du clic, et l'endroit cliqué. */
export interface TutorialStep extends ClickPoint {
  /** PNG ou JPEG en adresse de données. */
  src: string
  /** Dimensions de l'image, en pixels. */
  width: number
  height: number
  /** Texte lu près du clic (reconnaissance de texte), s'il y en a un : sert à proposer le titre de l'étape. */
  hint?: string
}

const W = 1920
const H = 1080
const MARGIN = 96
const TOP = 56
const HEADER = 120
const IMAGE_BOX = { x: MARGIN, y: TOP + HEADER, width: W - 2 * MARGIN, height: H - TOP - HEADER - 56 }
const RING = 72
const ACCENT = '#7c5cff'
const MARK = '#e5484d'
const FONT = '"Inter", sans-serif'
const base = { rotation: 0, opacity: 1 }

/** Cadre où l'image tient entière, à ses proportions, centrée dans sa zone. */
export function fitImage(width: number, height: number): { x: number; y: number; width: number; height: number } {
  const ratio = width > 0 && height > 0 ? width / height : 16 / 9
  const w = Math.min(IMAGE_BOX.width, IMAGE_BOX.height * ratio)
  const h = w / ratio
  return { x: Math.round(IMAGE_BOX.x + (IMAGE_BOX.width - w) / 2), y: Math.round(IMAGE_BOX.y + (IMAGE_BOX.height - h) / 2), width: Math.round(w), height: Math.round(h) }
}

/** Titre proposé pour une étape : « Étape 3 », suivi du texte trouvé près du clic quand il y en a un. */
export function stepTitle(n: number, label: string, hint?: string): string {
  const clean = (hint ?? '').replace(/\s+/g, ' ').trim().slice(0, 60)
  return clean ? `${label} ${n} : ${clean}` : `${label} ${n}`
}

function stepPage(step: TutorialStep, n: number, label: string): TramePage {
  const frame = fitImage(step.width, step.height)
  const cx = frame.x + step.fx * frame.width
  const cy = frame.y + step.fy * frame.height
  // le repère reste dans la page même pour un clic au bord de l'écran
  const rx = Math.round(Math.min(frame.x + frame.width - RING / 2, Math.max(frame.x + RING / 2, cx)) - RING / 2)
  const ry = Math.round(Math.min(frame.y + frame.height - RING / 2, Math.max(frame.y + RING / 2, cy)) - RING / 2)
  const badge = 84
  const elements: TrameElement[] = [
    { id: nanoid(8), type: 'ellipse', name: `${label} ${n}`, x: MARGIN, y: TOP, width: badge, height: badge, ...base, fill: ACCENT },
    { id: nanoid(8), type: 'text', x: MARGIN, y: TOP + 14, width: badge, height: 56, ...base, fill: '#ffffff', text: String(n), fontSize: 48, fontFamily: FONT, fontStyle: 'bold', align: 'center', lineHeight: 1.1 },
    { id: nanoid(8), type: 'text', x: MARGIN + badge + 32, y: TOP + 6, width: W - 2 * MARGIN - badge - 32, height: 72, ...base, fill: '#1e1f24', text: stepTitle(n, label, step.hint), fontSize: 52, fontFamily: FONT, fontStyle: 'bold', align: 'left', lineHeight: 1.2 },
    { id: nanoid(8), type: 'image', x: frame.x, y: frame.y, width: frame.width, height: frame.height, ...base, fill: '#000000', src: step.src, stroke: '#d9dbe3', strokeWidth: 2 },
    { id: nanoid(8), type: 'ellipse', name: `${label} ${n}`, x: rx, y: ry, width: RING, height: RING, ...base, fill: 'transparent', stroke: MARK, strokeWidth: 8 }
  ]
  return { id: nanoid(8), background: '#ffffff', elements }
}

/** Le tutoriel : une page par étape (numéro, titre à compléter, image de l'écran, cercle sur l'endroit cliqué). */
export function tutorialDocument(steps: TutorialStep[], name: string, label: string): TrameDocument {
  const pages = steps.slice(0, TUTORIAL_MAX_STEPS).map((s, i) => stepPage(s, i + 1, label))
  return { version: 2, name, width: W, height: H, pages }
}
