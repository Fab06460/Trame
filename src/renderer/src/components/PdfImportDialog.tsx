import { usePdfImport } from '@/store/pdfImport'
import { MAX_IMPORT_PAGES } from '@/pdfImport/importPdf'
import { runPdfImport } from '@/pdfImport/actions'
import { NumberField } from './NumberField'
import { useT } from '@/i18n'

/** Options d'import d'un PDF : texte reconstruit en éléments modifiables, ou pages en image à annoter. */
export function PdfImportDialog(): React.JSX.Element | null {
  const t = useT()
  const { pdf, name, mode, pages, progress, set, close } = usePdfImport()
  if (!pdf) return null
  const max = Math.min(pdf.numPages, MAX_IMPORT_PAGES)
  const busy = progress !== null
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={t('imp.pdf.dialog')}>
      <div className="modal">
        <h3>{t('imp.pdf.title', { name })}</h3>
        <p className="hint">
          {t('imp.pdf.intro', { count: pdf.numPages })}
        </p>
        <label className="choice-row">
          <input type="radio" name="pdf-mode" data-pdf-mode="editable" checked={mode === 'editable'} disabled={busy} onChange={() => set({ mode: 'editable' })} />
          <span>
            <strong>{t('imp.pdf.editable')}</strong>
            <em>{t('imp.pdf.editable.desc')}</em>
          </span>
        </label>
        <label className="choice-row">
          <input type="radio" name="pdf-mode" data-pdf-mode="image" checked={mode === 'image'} disabled={busy} onChange={() => set({ mode: 'image' })} />
          <span>
            <strong>{t('imp.pdf.image')}</strong>
            <em>{t('imp.pdf.image.desc')}</em>
          </span>
        </label>
        {pdf.numPages > 1 && (
          <NumberField label={t('imp.pdf.pages', { max })} field="pdfPages" value={pages} min={1} max={max} onCommit={(v) => set({ pages: Math.round(v) })} disabled={busy} />
        )}
        {busy && (
          <p className="hint" role="status" data-pdf-progress>
            {t('imp.pdf.progress', { page: Math.min(progress.done + 1, progress.total), total: progress.total })}
          </p>
        )}
        <div className="row end">
          <button data-action="pdf-cancel" onClick={close} disabled={busy}>{t('common.cancel')}</button>
          <button className="primary" data-action="pdf-import" onClick={() => void runPdfImport()} disabled={busy}>{t('imp.pdf.import')}</button>
        </div>
      </div>
    </div>
  )
}
