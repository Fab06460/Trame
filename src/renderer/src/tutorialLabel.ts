import type { OcrParagraph, OcrWord } from '@/ocr/engine'
import type { OcrLanguage } from '@/ocr/languages'

/** Confiance minimale d'un mot pour entrer dans un titre : en dessous, c'est souvent du bruit (icône, trait, ombre). */
export const WORD_CONFIDENCE = 55
/** Plus long titre proposé (en caractères). */
export const LABEL_MAX = 60
/** Demi-dimensions de la zone lue autour du clic, en pixels de l'image de l'écran. */
export const LABEL_REACH = { x: 240, y: 70 }

const usable = (w: OcrWord): boolean => {
  const t = w.text.trim()
  if (!t || w.confidence < WORD_CONFIDENCE || w.y1 <= w.y0) return false
  // au moins une lettre ou un chiffre, et pas un mot fait surtout de signes (« |||| », « ~~ »)
  const letters = (t.match(/[\p{L}\p{N}]/gu) ?? []).length
  return letters >= 1 && letters / t.length >= 0.6 && (t.length > 1 || /[\p{L}\p{N}]/u.test(t))
}

/** Distance entre un point et le cadre d'un mot (0 s'il est dedans). */
function distance(w: OcrWord, p: { x: number; y: number }): number {
  const dx = Math.max(w.x0 - p.x, 0, p.x - w.x1)
  const dy = Math.max(w.y0 - p.y, 0, p.y - w.y1)
  return Math.hypot(dx, dy)
}

/**
 * Le texte sur lequel on a cliqué : le mot sûr le plus proche du point, élargi aux mots voisins de la même ligne tant que l'écart reste
 * celui d'une espace (un bouton « Enregistrer sous » ; deux entrées de menu séparées ne se mélangent pas). `null` si rien de lisible n'est
 * assez près (`reach`, en pixels de l'image lue) : le titre reste alors « Étape N ».
 */
export function pickLabel(paragraphs: readonly OcrParagraph[], point: { x: number; y: number }, reach: number): string | null {
  let best: { word: OcrWord; line: OcrWord[]; d: number } | null = null
  for (const p of paragraphs) {
    for (const line of p.lines) {
      const words = (line.words ?? []).filter(usable).sort((a, b) => a.x0 - b.x0)
      for (const w of words) {
        const d = distance(w, point)
        if (d <= reach && (!best || d < best.d)) best = { word: w, line: words, d }
      }
    }
  }
  if (!best) return null
  const { word, line } = best
  const height = Math.max(1, word.y1 - word.y0)
  const maxGap = height * 0.9
  let from = line.indexOf(word)
  let to = from
  while (from > 0 && line[from].x0 - line[from - 1].x1 <= maxGap) from--
  while (to < line.length - 1 && line[to + 1].x0 - line[to].x1 <= maxGap) to++
  const text = line
    .slice(from, to + 1)
    .map((w) => w.text.trim())
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!/[\p{L}]{2}/u.test(text)) return null
  return text.length > LABEL_MAX ? `${text.slice(0, LABEL_MAX - 1).trimEnd()}…` : text
}

/** La zone à lire autour d'un clic : centrée sur lui, ramenée dans l'image. */
export function labelCrop(width: number, height: number, fx: number, fy: number): { x: number; y: number; width: number; height: number } {
  const cx = fx * width
  const cy = fy * height
  const w = Math.min(width, LABEL_REACH.x * 2)
  const h = Math.min(height, LABEL_REACH.y * 2)
  const x = Math.round(Math.min(Math.max(0, cx - w / 2), width - w))
  const y = Math.round(Math.min(Math.max(0, cy - h / 2), height - h))
  return { x, y, width: Math.round(w), height: Math.round(h) }
}

/** Lit le texte près du clic d'une étape (reconnaissance locale) ; `undefined` si rien de sûr n'est lisible ou si la lecture échoue. */
export async function labelForStep(step: { src: string; width: number; height: number; fx: number; fy: number }, language: OcrLanguage): Promise<string | undefined> {
  try {
    const [{ prepareImage }, { recognizeLayout }] = await Promise.all([import('@/ocr/prepare'), import('@/ocr/engine')])
    const crop = labelCrop(step.width, step.height, step.fx, step.fy)
    const canvas = await prepareImage(step.src, crop)
    const scale = canvas.width / crop.width
    const point = { x: (step.fx * step.width - crop.x) * scale, y: (step.fy * step.height - crop.y) * scale }
    const paragraphs = await recognizeLayout(canvas, language)
    return pickLabel(paragraphs, point, 60 * scale) ?? undefined
  } catch {
    return undefined
  }
}
