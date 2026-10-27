import { useCallback, useRef, useState } from 'react'
import { importPptxFile } from '@/pptxImport/actions'
import { startPdfImport } from '@/pdfImport/actions'
import { useDismiss } from './useDismiss'

/** Menu « Importer » : ouvre un fichier PDF ou PowerPoint comme nouveau document (même fenêtre déroulante que « Exporter »). */
export function ImportMenu(): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const close = useCallback(() => setOpen(false), [])
  useDismiss(open, root, close)

  const choose = (action: () => Promise<void>): void => {
    setOpen(false)
    void action()
  }

  return (
    <div className="export-menu import-menu" ref={root}>
      <button aria-haspopup="menu" aria-expanded={open} title="Importer un PDF ou une présentation PowerPoint comme nouveau document" onClick={() => setOpen((o) => !o)}>
        Importer ▾
      </button>
      {open && (
        <div className="export-popup left" role="menu" aria-label="Importer">
          <button role="menuitem" data-import="pdf" onClick={() => choose(startPdfImport)}>
            <strong>PDF…</strong>
            <span>Texte modifiable ou pages à annoter</span>
          </button>
          <button role="menuitem" data-import="pptx" onClick={() => choose(importPptxFile)}>
            <strong>PowerPoint (.pptx)…</strong>
            <span>Textes, formes, images, thème (exports de Canva compris)</span>
          </button>
        </div>
      )}
    </div>
  )
}
