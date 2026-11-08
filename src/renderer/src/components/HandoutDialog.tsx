import { useEffect, useMemo, useState } from 'react'
import { fileSafeName } from '@/docName'
import { LINES_PER_PAGE, handoutDocument, type HandoutLayout, type HandoutPaper } from '@/handout'
import { measureNotes } from '@/handoutActions'
import { exportImposed } from '@/printActions'
import { useEditor } from '@/store/editor'
import { useHandoutDialog } from '@/store/handoutDialog'
import { t as translate, useT } from '@/i18n'
import { PageThumb } from './PageThumb'

/**
 * Export PDF des notes de l'orateur (une diapositive par feuille, ses notes dessous) ou d'un polycopié (plusieurs diapositives par feuille,
 * avec des lignes pour prendre des notes). Rien ne change dans le document ; le PDF est fabriqué à partir de ses pages.
 */
export function HandoutDialog(): React.JSX.Element | null {
  const t = useT()
  const open = useHandoutDialog((s) => s.open)
  const doc = useEditor((s) => s.doc)
  const [layout, setLayout] = useState<HandoutLayout>('notes')
  const [paper, setPaper] = useState<HandoutPaper>('a4')
  const [perPage, setPerPage] = useState<(typeof LINES_PER_PAGE)[number]>(3)
  const [border, setBorder] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  const result = useMemo(
    () => (open ? handoutDocument(doc, { layout, paper, perPage, border }, { notes: translate('handout.label.notes'), continued: translate('handout.label.continued') }, measureNotes) : null),
    [open, doc, layout, paper, perPage, border]
  )

  // Échap ferme la fenêtre, même si le focus n'y est plus
  useEffect(() => {
    if (!open || busy) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') useHandoutDialog.getState().setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, busy])

  if (!open || !result) return null
  const close = (): void => useHandoutDialog.getState().setOpen(false)
  const noted = doc.pages.filter((p) => p.notes).length
  const run = async (): Promise<void> => {
    setBusy(true)
    setMessage('')
    try {
      const stem = translate(layout === 'notes' ? 'handout.file.notes' : 'handout.file.lines', { name: fileSafeName(doc.name) })
      if (await exportImposed({ doc: result.doc, sides: result.sheets }, stem)) close()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={t('handout.title')}>
      <div className="modal wide print-dialog">
        <h3>{t('handout.title')}</h3>
        <fieldset className="pages-choice" disabled={busy}>
          <legend>{t('print.mode')}</legend>
          <label className="choice-row"><input type="radio" name="handout-mode" data-handout-mode="notes" checked={layout === 'notes'} onChange={() => setLayout('notes')} /> {t('handout.mode.notes')}</label>
          <label className="choice-row"><input type="radio" name="handout-mode" data-handout-mode="lines" checked={layout === 'lines'} onChange={() => setLayout('lines')} /> {t('handout.mode.lines')}</label>
        </fieldset>

        <div className="row wrap">
          <label>
            {t('print.paper')}
            <select data-field="handoutPaper" value={paper} disabled={busy} onChange={(e) => setPaper(e.target.value as HandoutPaper)}>
              <option value="a4">A4</option>
              <option value="letter">{t('mm.paper.letter')}</option>
            </select>
          </label>
          {layout === 'lines' && (
            <label>
              {t('print.perSheet')}
              <select data-field="handoutPerPage" value={perPage} disabled={busy} onChange={(e) => setPerPage(Number(e.target.value) as (typeof LINES_PER_PAGE)[number])}>
                {LINES_PER_PAGE.map((n) => (
                  <option key={n} value={n}>{t('handout.perPage.n', { count: n })}</option>
                ))}
              </select>
            </label>
          )}
        </div>
        <label className="choice-row"><input type="checkbox" data-field="handoutBorder" checked={border} disabled={busy} onChange={(e) => setBorder(e.target.checked)} /> {t('handout.border')}</label>

        <div className="mm-preview" data-handout-preview>
          {result.doc.pages.slice(0, 2).map((p) => (
            <PageThumb key={p.id} page={p} width={result.doc.width} height={result.doc.height} maxW={230} maxH={300} />
          ))}
        </div>

        <p data-handout-summary data-handout-sheets={result.sheets}>
          {t('handout.summary', { count: doc.pages.length, pages: doc.pages.length, sheets: result.sheets })}
        </p>
        {layout === 'notes' && (
          <p className="hint" data-handout-notes>
            {noted === 0 ? t('handout.notes.none') : t('handout.notes.some', { count: noted, noted })}
            {result.continued > 0 ? ` ${t('handout.notes.continued', { count: result.continued })}` : ''}
          </p>
        )}
        <p className="hint">{layout === 'notes' ? t('handout.how.notes') : t('handout.how.lines')}</p>
        {message && <div className="warn" role="status" data-handout-message>{message}</div>}
        <div className="row end">
          <button data-action="handout-close" onClick={close} disabled={busy}>{t('common.close')}</button>
          <button className="primary" data-action="handout-export" onClick={() => void run()} disabled={busy}>{busy ? t('print.printing') : t('print.export')}</button>
        </div>
      </div>
    </div>
  )
}
