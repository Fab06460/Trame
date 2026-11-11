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
