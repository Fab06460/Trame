import { useCallback, useRef, useState } from 'react'
import { useT } from '@/i18n'
import { importPptxFile } from '@/pptxImport/actions'
import { startPdfImport } from '@/pdfImport/actions'
import { usePdfTools } from '@/store/pdfTools'
import { useDismiss } from './useDismiss'

/** Menu « Importer » : ouvre un fichier PDF ou PowerPoint comme nouveau document (même fenêtre déroulante que « Exporter »). */
export function ImportMenu(): React.JSX.Element {
  const t = useT()
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
      <button aria-haspopup="menu" aria-expanded={open} title={t('import.button.title')} onClick={() => setOpen((o) => !o)}>
        {t('import.button')} ▾
      </button>
      {open && (
        <div className="export-popup left" role="menu" aria-label={t('import.button')}>
          <button role="menuitem" data-import="pdf" onClick={() => choose(startPdfImport)}>
            <strong>{t('import.pdf')}</strong>
            <span>{t('import.pdf.desc')}</span>
          </button>
          <button role="menuitem" data-import="pptx" onClick={() => choose(importPptxFile)}>
            <strong>{t('import.pptx')}</strong>
            <span>{t('import.pptx.desc')}</span>
          </button>
          <button role="menuitem" data-import="pdf-tools" onClick={() => choose(async () => usePdfTools.getState().setOpen(true))}>
            <strong>{t('pdft.menu')}</strong>
            <span>{t('pdft.menu.desc')}</span>
          </button>
        </div>
      )}
    </div>
  )
}
