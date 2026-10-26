import { usePdfImport } from '@/store/pdfImport'
import { MAX_IMPORT_PAGES } from '@/pdfImport/importPdf'
import { runPdfImport } from '@/pdfImport/actions'
import { NumberField } from './NumberField'

/** Options d'import d'un PDF : texte reconstruit en éléments modifiables, ou pages en image à annoter. */
export function PdfImportDialog(): React.JSX.Element | null {
  const { pdf, name, mode, pages, progress, set, close } = usePdfImport()
  if (!pdf) return null
  const max = Math.min(pdf.numPages, MAX_IMPORT_PAGES)
  const busy = progress !== null
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Importer un PDF">
      <div className="modal">
        <h3>Importer « {name} »</h3>
        <p className="hint">
          {pdf.numPages} page{pdf.numPages > 1 ? 's' : ''}. Le PDF devient un nouveau document : chaque page est dessinée en fond (verrouillé), le reste se modifie par-dessus.
        </p>
        <label className="choice-row">
          <input type="radio" name="pdf-mode" data-pdf-mode="editable" checked={mode === 'editable'} disabled={busy} onChange={() => set({ mode: 'editable' })} />
          <span>
            <strong>Texte modifiable</strong>
            <em>Le texte est reconstruit en blocs que vous pouvez éditer. Fidèle pour les PDF simples (flyers, CV, exports Canva) ; les polices absentes sont remplacées.</em>
          </span>
        </label>
        <label className="choice-row">
          <input type="radio" name="pdf-mode" data-pdf-mode="image" checked={mode === 'image'} disabled={busy} onChange={() => set({ mode: 'image' })} />
          <span>
            <strong>Page en image</strong>
            <em>La page reste intacte, comme une image. Idéal pour annoter : ajoutez texte, formes et signature par-dessus.</em>
          </span>
        </label>
        {pdf.numPages > 1 && (
          <NumberField label={`Pages à importer (max. ${max})`} field="pdfPages" value={pages} min={1} max={max} onCommit={(v) => set({ pages: Math.round(v) })} disabled={busy} />
        )}
        {busy && (
          <p className="hint" role="status" data-pdf-progress>
            Import en cours… page {Math.min(progress.done + 1, progress.total)} / {progress.total}
          </p>
        )}
        <div className="row end">
          <button data-action="pdf-cancel" onClick={close} disabled={busy}>Annuler</button>
          <button className="primary" data-action="pdf-import" onClick={() => void runPdfImport()} disabled={busy}>Importer</button>
        </div>
      </div>
    </div>
  )
}
