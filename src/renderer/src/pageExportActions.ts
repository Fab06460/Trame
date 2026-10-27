import JSZip from 'jszip'
import { fileSafeName } from '@/docName'
import { renderPage } from '@/exportPages'
import { effectiveScale, pageFileName } from '@/pageExport'
import { useEditor } from '@/store/editor'

export interface PagesExportOptions {
  format: 'png' | 'jpg'
  /** numéros de pages (à partir de 1) */
  pages: number[]
  /** multiple de la taille du design */
  scale: number
  /** qualité JPEG, de 0 à 1 */
  quality: number
  onProgress?: (done: number, total: number) => void
}

export interface PagesExportResult {
  /** chemin enregistré, ou null si l'utilisateur a annulé */
  saved: string | null
  files: number
  /** échelle réellement appliquée (réduite si l'image aurait dépassé la taille maximale) */
  scale: number
}

/**
 * Exporte les pages choisies en images : une seule page → un fichier image ; plusieurs → une archive ZIP (images déjà compressées :
 * stockées sans recompression). Chaque page est rendue hors écran à la taille du design × `scale`.
 */
export async function exportPagesImages(o: PagesExportOptions): Promise<PagesExportResult> {
  const { doc } = useEditor.getState()
  const scale = effectiveScale(doc.width, doc.height, o.scale)
  const type = o.format === 'png' ? 'image/png' : 'image/jpeg'
  const base = fileSafeName(doc.name)
  const files: Array<{ name: string; base64: string }> = []
  for (const [i, n] of o.pages.entries()) {
    o.onProgress?.(i, o.pages.length)
    const url = await renderPage(doc, doc.pages[n - 1], type, undefined, { scale, quality: o.quality })
    files.push({ name: pageFileName(base, n, doc.pages.length, o.format), base64: url.split(',')[1] })
  }
  o.onProgress?.(o.pages.length, o.pages.length)
  if (files.length === 1) {
    const saved = await window.trame.saveExport(`data:${type};base64,${files[0].base64}`, files[0].name)
    return { saved, files: 1, scale }
  }
  const zip = new JSZip()
  for (const f of files) zip.file(f.name, f.base64, { base64: true })
  const zipped = await zip.generateAsync({ type: 'base64', compression: 'STORE' })
  const saved = await window.trame.saveExport(`data:application/zip;base64,${zipped}`, `${base}.zip`)
  return { saved, files: files.length, scale }
}
