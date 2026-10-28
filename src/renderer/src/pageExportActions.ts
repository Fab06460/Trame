import JSZip from 'jszip'
import { fileSafeName } from '@/docName'
import { renderPage } from '@/exportPages'
import { effectiveScale, pageFileName } from '@/pageExport'
import { pageToSvg } from '@/svgExport'
import { useEditor } from '@/store/editor'

export type PageFormat = 'png' | 'jpg' | 'svg'

export interface PagesExportOptions {
  format: PageFormat
  /** numéros de pages (à partir de 1) */
  pages: number[]
  /** multiple de la taille du design (images ; sans effet pour le SVG, vectoriel) */
  scale: number
  /** qualité JPEG, de 0 à 1 */
  quality: number
  /** plusieurs pages : une archive ZIP, ou un dossier choisi (un fichier par page) */
  destination: 'archive' | 'folder'
  onProgress?: (done: number, total: number) => void
}

export interface PagesExportResult {
  /** chemin enregistré (fichier, archive ou dossier), ou null si l'utilisateur a annulé */
  saved: string | null
  files: number
  /** échelle réellement appliquée (réduite si l'image aurait dépassé la taille maximale) */
  scale: number
}

const MIME: Record<PageFormat, string> = { png: 'image/png', jpg: 'image/jpeg', svg: 'image/svg+xml' }

const utf8Base64 = (text: string): string => {
  const bytes = new TextEncoder().encode(text)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

/**
 * Exporte les pages choisies : en images (PNG, JPG) ou en SVG vectoriel. Une seule page → un fichier ; plusieurs → une archive ZIP
 * (fichiers déjà compressés : stockés sans recompression) ou un dossier au choix, un fichier par page.
 */
export async function exportPagesImages(o: PagesExportOptions): Promise<PagesExportResult> {
  const { doc } = useEditor.getState()
  const scale = effectiveScale(doc.width, doc.height, o.scale)
  const type = MIME[o.format]
  const base = fileSafeName(doc.name)
  const nameOf = (n: number): string => pageFileName(base, n, doc.pages.length, o.format)

  /** Rend une page : contenu en base64. */
  const render = async (n: number): Promise<string> => {
    const page = doc.pages[n - 1]
    if (o.format === 'svg') return utf8Base64(await pageToSvg(doc, page))
    return (await renderPage(doc, page, type as 'image/png' | 'image/jpeg', undefined, { scale, quality: o.quality })).split(',')[1]
  }
  const total = o.pages.length

  if (total > 1 && o.destination === 'folder') {
    // le dossier est demandé AVANT le rendu : annuler ne coûte rien
    const picked = await window.trame.pickExportFolder(o.pages.map(nameOf), base)
    if (!picked) return { saved: null, files: 0, scale }
    if (picked.existing.length && !(await window.trame.confirm(`Remplacer ${picked.existing.length} fichier${picked.existing.length > 1 ? 's' : ''} existant${picked.existing.length > 1 ? 's' : ''} ?`, `Le dossier contient déjà : ${picked.existing.slice(0, 5).join(', ')}${picked.existing.length > 5 ? '…' : ''}`, 'Remplacer'))) return { saved: null, files: 0, scale }
    for (const [i, n] of o.pages.entries()) {
      o.onProgress?.(i, total)
      const ok = await window.trame.writeExportFile(picked.dir, nameOf(n), `data:${type};base64,${await render(n)}`)
      if (!ok) throw new Error(`Écriture impossible : ${nameOf(n)}`)
    }
    o.onProgress?.(total, total)
    return { saved: picked.dir, files: total, scale }
  }

  const files: Array<{ name: string; base64: string }> = []
  for (const [i, n] of o.pages.entries()) {
    o.onProgress?.(i, total)
    files.push({ name: nameOf(n), base64: await render(n) })
  }
  o.onProgress?.(total, total)
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
