import { usePdfImport } from '@/store/pdfImport'
import { MAX_IMPORT_PAGES } from '@/pdfImport/importPdf'
import { runPdfImport } from '@/pdfImport/actions'
import { OCR_LANGUAGES, isOcrLanguage, saveOcrLanguage } from '@/ocr/languages'
import { NumberField } from './NumberField'
import { useT } from '@/i18n'

/** Le nom de chaque langue dans sa propre langue : un nom propre, jamais traduit. */
const OCR_NAMES = { fra: 'Français', eng: 'English', deu: 'Deutsch', spa: 'Español' } as const

/** Options d'import d'un PDF : texte reconstruit en éléments modifiables, ou pages en image à annoter. */
export function PdfImportDialog(): React.JSX.Element | null {
  const t = useT()
  const { pdf, name, mode, pages, progress, scanned, ocr, ocrLanguage, abort, set, close } = usePdfImport()
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
        {mode === 'editable' && (
          <div className="choice-row" data-pdf-ocr-row>
            <input type="checkbox" id="pdf-ocr" data-field="pdfOcr" checked={ocr} disabled={busy} onChange={(e) => set({ ocr: e.target.checked })} />
            <span>
              <strong><label htmlFor="pdf-ocr">{t('imp.pdf.ocr.label')}</label></strong>
              <em>{scanned ? t('imp.pdf.ocr.scanned') : t('imp.pdf.ocr.desc')}</em>
              {ocr && (
                <label>
                  {t('ocr.language')}
                  <select
                    data-field="pdfOcrLanguage"
                    value={ocrLanguage}
                    disabled={busy}
                    onChange={(e) => {
                      if (!isOcrLanguage(e.target.value)) return
                      saveOcrLanguage(e.target.value)
                      set({ ocrLanguage: e.target.value })
                    }}
                  >
                    {OCR_LANGUAGES.map((l) => (
                      <option key={l} value={l}>{OCR_NAMES[l]}</option>
                    ))}
                  </select>
                </label>
              )}
            </span>
          </div>
        )}
        {pdf.numPages > 1 && (
          <NumberField label={t('imp.pdf.pages', { max })} field="pdfPages" value={pages} min={1} max={max} onCommit={(v) => set({ pages: Math.round(v) })} disabled={busy} />
        )}
        {busy && (
          <p className="hint" role="status" data-pdf-progress>
            {t(ocr && mode === 'editable' ? 'imp.pdf.progress.ocr' : 'imp.pdf.progress', { page: Math.min(progress.done + 1, progress.total), total: progress.total })}
          </p>
        )}
        <div className="row end">
          {busy ? (
            <button data-action="pdf-stop" onClick={() => abort?.abort()}>{t('imp.pdf.stop')}</button>
          ) : (
            <button data-action="pdf-cancel" onClick={close}>{t('common.cancel')}</button>
          )}
          <button className="primary" data-action="pdf-import" onClick={() => void runPdfImport()} disabled={busy}>{t('imp.pdf.import')}</button>
        </div>
      </div>
    </div>
  )
}
