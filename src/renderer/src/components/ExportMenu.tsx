import { useCallback, useRef, useState } from 'react'
import { fileSafeName } from '@/docName'
import { renderPage } from '@/exportPages'
import { pageFileName } from '@/pageExport'
import { exportPdf } from '@/pdfExport'
import { describeFallbacks } from '@/pdfFallbacks'
import { exportPptx } from '@/pptxExport'
import { pageToSvg } from '@/svgExport'
import { useEditor } from '@/store/editor'
import { useExportPages } from '@/store/exportPages'
import { usePdfIssues } from '@/store/pdfIssues'
import { useDismiss } from './useDismiss'

async function exportImage(type: 'image/png' | 'image/jpeg'): Promise<void> {
  // rendu hors écran à la taille réelle du design : indépendant du zoom et de la position de la vue
  const { doc, pageId } = useEditor.getState()
  const pageNo = doc.pages.findIndex((p) => p.id === pageId) + 1
  const url = await renderPage(doc, doc.pages.find((p) => p.id === pageId) ?? doc.pages[0], type)
  const ext = type === 'image/png' ? 'png' : 'jpg'
  // même nom que dans l'archive des pages (« Nom-page-2.png ») : un document de plusieurs pages se range dans l'ordre
  await window.trame.saveExport(url, doc.pages.length > 1 ? pageFileName(fileSafeName(doc.name), pageNo, doc.pages.length, ext) : `${fileSafeName(doc.name)}.${ext}`)
}

async function exportSvg(): Promise<void> {
  const { doc, pageId } = useEditor.getState()
  const pageNo = doc.pages.findIndex((p) => p.id === pageId) + 1
  const svg = await pageToSvg(doc, doc.pages.find((p) => p.id === pageId) ?? doc.pages[0])
  const bytes = new TextEncoder().encode(svg)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  await window.trame.saveExport(`data:image/svg+xml;base64,${btoa(bin)}`, doc.pages.length > 1 ? pageFileName(fileSafeName(doc.name), pageNo, doc.pages.length, 'svg') : `${fileSafeName(doc.name)}.svg`)
}

async function exportPdfFile(): Promise<void> {
  const { doc } = useEditor.getState()
  const { dataUrl, fallbacks } = await exportPdf(doc)
  const saved = await window.trame.saveExport(dataUrl, `${fileSafeName(doc.name)}.pdf`)
  // On prévient APRÈS l'enregistrement (rien n'est perdu) des textes qui n'ont pas pu être écrits en vrai texte
  const warning = saved ? describeFallbacks(fallbacks, doc.pages.length) : null
  if (warning) await window.trame.showInfo(warning.message, warning.detail)
}

async function exportPptxFile(): Promise<void> {
  const { doc } = useEditor.getState()
  const { dataUrl, rasterized } = await exportPptx(doc)
  const saved = await window.trame.saveExport(dataUrl, `${fileSafeName(doc.name)}.pptx`)
  // comme pour le PDF : on prévient APRÈS l'enregistrement de ce qui n'est pas resté modifiable dans PowerPoint
  if (saved && rasterized.length) {
    const causes = [...new Set(rasterized.map((r) => r.reason))].join(', ')
    await window.trame.showInfo(
      `${rasterized.length} élément${rasterized.length > 1 ? 's exportés' : ' exporté'} sous forme d'image`,
      `PowerPoint ne sait pas reproduire en objet modifiable : ${causes}. Ils sont placés en image à la même position.\nLes polices de Trame (Inter, Montserrat…) doivent être installées sur l'ordinateur qui ouvre le fichier, sinon PowerPoint les remplace.`
    )
  }
}

/**
 * Menu « Exporter » : tous les exports au même endroit. L'avertissement « n textes seront exportés en image dans le PDF » reste visible
 * sur le bouton (même quand le menu est fermé) et sur l'entrée PDF.
 */
export function ExportMenu(): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const pdfIssueCount = usePdfIssues((s) => Object.keys(s.issues).length)
  const pageCount = useEditor((s) => s.doc.pages.length)
  const pageNo = useEditor((s) => s.doc.pages.findIndex((p) => p.id === s.pageId) + 1)

  const close = useCallback(() => setOpen(false), [])
  useDismiss(open, root, close)

  const choose = (action: () => void | Promise<void>): void => {
    setOpen(false)
    void action()
  }
  const warning = pdfIssueCount
    ? `${pdfIssueCount} texte${pdfIssueCount > 1 ? 's seront exportés' : ' sera exporté'} en image dans le PDF (non sélectionnable${pdfIssueCount > 1 ? 's' : ''}). Sélectionnez-les : l'éditeur indique pourquoi.`
    : ''

  return (
    <div className="export-menu" ref={root}>
      <button
        className={`primary${pdfIssueCount ? ' has-warning' : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        title={warning || 'Exporter : PDF, PowerPoint, images, SVG'}
        onClick={() => setOpen((o) => !o)}
      >
        Exporter{pdfIssueCount ? ` ⚠ ${pdfIssueCount}` : ''} ▾
      </button>
      {open && (
        <div className="export-popup" role="menu" aria-label="Exporter">
          <button role="menuitem" data-export="pdf" title={warning || undefined} onClick={() => choose(exportPdfFile)}>
            <strong>PDF</strong>
            <span>{pageCount > 1 ? `Toutes les pages (${pageCount})` : 'La page'}, texte sélectionnable{pdfIssueCount ? ` — ⚠ ${pdfIssueCount} en image` : ''}</span>
          </button>
          <button role="menuitem" data-export="pptx" onClick={() => choose(exportPptxFile)}>
            <strong>PowerPoint (.pptx)</strong>
            <span>Éléments modifiables dans PowerPoint, Keynote, Google Slides</span>
          </button>
          <div className="export-sep" role="separator" />
          <button role="menuitem" data-export="png" onClick={() => choose(() => exportImage('image/png'))}>
            <strong>PNG</strong>
            <span>{pageCount > 1 ? `Page courante (${pageNo})` : 'La page'}, taille du design</span>
          </button>
          <button role="menuitem" data-export="jpg" onClick={() => choose(() => exportImage('image/jpeg'))}>
            <strong>JPG</strong>
            <span>{pageCount > 1 ? `Page courante (${pageNo})` : 'La page'}, taille du design</span>
          </button>
          <button role="menuitem" data-export="svg" onClick={() => choose(exportSvg)}>
            <strong>SVG</strong>
            <span>{pageCount > 1 ? `Page courante (${pageNo})` : 'La page'}, vectoriel, textes et polices incorporés</span>
          </button>
          <button role="menuitem" data-export="pages" onClick={() => choose(() => useExportPages.getState().setOpen(true))}>
            <strong>Plusieurs pages…</strong>
            <span>PNG, JPG ou SVG, toutes les pages ou une sélection, en archive ZIP ou dans un dossier</span>
          </button>
        </div>
      )}
    </div>
  )
}
