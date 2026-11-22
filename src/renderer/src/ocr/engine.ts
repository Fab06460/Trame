import workerUrl from 'tesseract.js/dist/worker.min.js?url'
import coreUrl from 'tesseract.js-core/tesseract-core-simd-lstm.wasm.js?url'
import type { Worker } from 'tesseract.js'
import { OCR_DATA, type OcrLanguage } from './languages'

/**
 * Reconnaissance de texte (Tesseract compilé en WebAssembly, dans un Worker). Tout est local : le moteur, son worker et les données de
 * langue sont des fichiers de l'application, aucune requête réseau. Le module n'est chargé qu'au premier usage (il pèse plusieurs Mo).
 */

export interface OcrProgress {
  /** étape en cours : chargement du moteur ou des données, puis reconnaissance */
  phase: 'loading' | 'recognizing'
  /** 0 à 1 */
  progress: number
}

/** Une ligne reconnue : son texte, son cadre et sa ligne de base (pixels de l'image lue). */
export interface OcrLine {
  text: string
  x0: number
  y0: number
  x1: number
  y1: number
  /** ordonnée de la ligne de base au milieu de la ligne */
  base: number
  /** les mots de la ligne, avec leur cadre (absents si le moteur ne les donne pas) */
  words?: OcrWord[]
}

/** Un mot reconnu : son texte, son cadre (pixels de l'image lue) et la confiance du moteur (0 à 100). */
export interface OcrWord {
  text: string
  x0: number
  y0: number
  x1: number
  y1: number
  confidence: number
}

/** Un paragraphe reconnu avec sa place dans l'image. */
export interface OcrParagraph {
  text: string
  /** confiance moyenne, de 0 à 100 */
  confidence: number
  x0: number
  y0: number
  x1: number
  y1: number
  lines: OcrLine[]
}

export interface OcrResult {
  text: string
  /** confiance moyenne du moteur, de 0 à 100 */
  confidence: number
}

/** Un worker par langue (le moteur ne lit qu'un jeu de données à la fois) ; il est arrêté après un temps d'inactivité : il garde de la mémoire. */
const IDLE_MS = 60_000
let current: { lang: OcrLanguage; worker: Promise<Worker> } | null = null
let idle: ReturnType<typeof setTimeout> | undefined
let onProgress: ((p: OcrProgress) => void) | null = null

const dirOf = (url: string): string => url.slice(0, url.lastIndexOf('/') + 1)

async function workerFor(lang: OcrLanguage): Promise<Worker> {
  if (current?.lang === lang) return current.worker
  await release()
  const { createWorker } = await import('tesseract.js')
  const worker = createWorker(lang, 1, {
    workerPath: workerUrl,
    corePath: coreUrl,
    langPath: dirOf(OCR_DATA[lang]),
    workerBlobURL: false, // le worker est un fichier de l'application, pas un Blob (la politique de sécurité n'en autorise pas)
    cacheMethod: 'none', // les données sont déjà locales : inutile de les recopier dans IndexedDB
    logger: (m: { status: string; progress: number }) => {
      if (m.status === 'recognizing text') onProgress?.({ phase: 'recognizing', progress: m.progress })
      else onProgress?.({ phase: 'loading', progress: m.progress })
    }
  })
  current = { lang, worker }
  worker.catch(() => {
    if (current?.worker === worker) current = null
  })
  return worker
}

/** Arrête le moteur et libère sa mémoire. */
export async function release(): Promise<void> {
  clearTimeout(idle)
  const w = current
  current = null
  if (w) await w.worker.then((x) => x.terminate()).catch(() => {})
}

/** Reconnaît les paragraphes d'une image avec leur place (pour reconstruire une page scannée). */
export async function recognizeLayout(image: string | HTMLCanvasElement, lang: OcrLanguage, progress?: (p: OcrProgress) => void): Promise<OcrParagraph[]> {
  clearTimeout(idle)
  onProgress = progress ?? null
  try {
    const worker = await workerFor(lang)
    const { data } = await worker.recognize(image, {}, { text: true, blocks: true })
    const out: OcrParagraph[] = []
    for (const block of data.blocks ?? []) {
      for (const p of block.paragraphs ?? []) {
        const lines: OcrLine[] = (p.lines ?? []).map((l) => ({
          text: l.text ?? '',
          x0: l.bbox.x0,
          y0: l.bbox.y0,
          x1: l.bbox.x1,
          y1: l.bbox.y1,
          base: l.baseline ? (l.baseline.y0 + l.baseline.y1) / 2 : l.bbox.y1,
          words: (l.words ?? []).map((w) => ({ text: w.text ?? '', x0: w.bbox.x0, y0: w.bbox.y0, x1: w.bbox.x1, y1: w.bbox.y1, confidence: Math.round(w.confidence ?? 0) }))
        }))
        out.push({ text: p.text ?? '', confidence: Math.round(p.confidence ?? 0), x0: p.bbox.x0, y0: p.bbox.y0, x1: p.bbox.x1, y1: p.bbox.y1, lines })
      }
    }
    return out
  } finally {
    onProgress = null
    idle = setTimeout(() => void release(), IDLE_MS)
  }
}

/** Reconnaît le texte d'une image (adresse de données ou d'objet, ou canvas). */
export async function recognize(image: string | HTMLCanvasElement, lang: OcrLanguage, progress?: (p: OcrProgress) => void): Promise<OcrResult> {
  clearTimeout(idle)
  onProgress = progress ?? null
  try {
    const worker = await workerFor(lang)
    const { data } = await worker.recognize(image)
    return { text: data.text ?? '', confidence: Math.round(data.confidence ?? 0) }
  } finally {
    onProgress = null
    idle = setTimeout(() => void release(), IDLE_MS)
  }
}
