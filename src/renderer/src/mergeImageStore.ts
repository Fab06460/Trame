import { create } from 'zustand'
import { matchImageFile } from '@shared/mergeImages'
import { loadImage } from '@/exportPages'
import { coverCrop } from '@/imageStyle'
import type { ImageResolver, MergeData } from '@/mailMerge'

/** Une image du dossier, prête pour le document : au plus 2 000 px de côté (un document de plusieurs centaines de fiches reste léger). */
interface Loaded {
  src: string
  width: number
  height: number
}

const MAX_SIDE = 2000
const cache = new Map<string, Loaded | null>()

/** Dossier d'images choisi pour le publipostage (pour la session : un chemin n'est pas enregistré dans le document). */
export const useMergeImages = create<{ folder: string | null; files: string[]; tick: number }>(() => ({ folder: null, files: [], tick: 0 }))

/** Boîte système : choix du dossier des images. Faux si annulé. */
export async function chooseImageFolder(): Promise<boolean> {
  const res = await window.trame.pickMergeImageFolder()
  if (!res) return false
  cache.clear()
  useMergeImages.setState((s) => ({ folder: res.name, files: res.files, tick: s.tick + 1 }))
  return true
}

async function prepare(dataUrl: string): Promise<Loaded | null> {
  try {
    const img = await loadImage(dataUrl)
    const w = img.naturalWidth
    const h = img.naturalHeight
    if (!w || !h) return null
    if (Math.max(w, h) <= MAX_SIDE) return { src: dataUrl, width: w, height: h }
    const k = MAX_SIDE / Math.max(w, h)
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(w * k)
    canvas.height = Math.round(h * k)
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
    return { src: canvas.toDataURL(dataUrl.startsWith('data:image/png') ? 'image/png' : 'image/jpeg', 0.92), width: canvas.width, height: canvas.height }
  } catch {
    return null
  }
}

/** Fichiers du dossier désignés par ces valeurs de cellules (sans doublon ni valeur introuvable). */
const filesFor = (values: string[]): string[] => {
  const { files } = useMergeImages.getState()
  return [...new Set(values.map((v) => matchImageFile(files, v)).filter((f): f is string => f !== null))]
}

/** Charge les images désignées par ces valeurs (celles qui ne sont pas déjà en mémoire), quarante à la fois. */
export async function ensureImages(values: string[]): Promise<void> {
  const need = filesFor(values).filter((f) => !cache.has(f))
  for (let i = 0; i < need.length; i += 40) {
    const chunk = need.slice(i, i + 40)
    const read = await window.trame.readMergeImages(chunk)
    for (const f of chunk) cache.set(f, read[f] ? await prepare(read[f]!) : null)
  }
  if (need.length) useMergeImages.setState((s) => ({ tick: s.tick + 1 }))
}

/** Libère la mémoire des images désignées par ces valeurs (export d'un fichier par ligne). */
export function releaseImages(values: string[]): void {
  for (const f of filesFor(values)) cache.delete(f)
}

/**
 * Remplaçant d'image pour `mergeDocument` : l'image du fichier, recadrée pour remplir la boîte du modèle sans déformation. Une valeur
 * sans fichier (ou illisible) laisse l'image du modèle et est notée dans `missing`.
 */
export function imageResolver(missing?: Set<string>): ImageResolver {
  return (template, value) => {
    const file = matchImageFile(useMergeImages.getState().files, value)
    const loaded = file ? cache.get(file) : null
    if (!loaded) {
      missing?.add(value.trim() || '—')
      return null
    }
    return { src: loaded.src, crop: coverCrop(template.width, template.height, loaded.width, loaded.height), pdfSource: undefined, ai: undefined, credit: undefined }
  }
}

/** Valeurs des colonnes d'images, pour ces lignes (ce qu'il faut charger avant de fusionner). */
export function imageValues(columns: string[], rows: string[][], rowIndexes: number[], fields: string[]): string[] {
  const at = fields.map((f) => columns.findIndex((c) => c.trim().toLowerCase() === f.trim().toLowerCase())).filter((i) => i >= 0)
  return rowIndexes.flatMap((r) => at.map((i) => rows[r]?.[i] ?? ''))
}

/** Valeurs de ces lignes qui ne désignent aucun fichier du dossier. */
export function missingImageValues(data: MergeData, rowIndexes: number[], fields: string[]): string[] {
  const { files } = useMergeImages.getState()
  return [...new Set(imageValues(data.columns, data.rows, rowIndexes, fields).filter((v) => matchImageFile(files, v) === null).map((v) => v.trim() || '—'))]
}

