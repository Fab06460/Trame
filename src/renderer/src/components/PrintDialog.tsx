import { useEffect, useMemo, useState } from 'react'
import { fileSafeName } from '@/docName'
import { NUP_PRESETS, bookletBlanks, bookletDocument, nUpDocument, ratioMismatch, sheetCount, type NUpPresetId, type Paper } from '@/imposition'
import { cells, sheetSize } from '@/mergeSheets'
import { exportImposed, printImposed } from '@/printActions'
import { useEditor } from '@/store/editor'
import { usePrintDialog } from '@/store/printDialog'
import { t as translate, useT } from '@/i18n'
import { PageThumb } from './PageThumb'

/**
 * Impression pratique : un PDF de livret (feuilles recto-verso pliées en deux) ou de plusieurs pages par feuille, prêt à imprimer. Rien ne
 * change dans le document ; le PDF est fabriqué à partir de ses pages.
 */
export function PrintDialog(): React.JSX.Element | null {
  const t = useT()
  const open = usePrintDialog((s) => s.open)
  const doc = useEditor((s) => s.doc)
  const [mode, setMode] = useState<'sheet' | 'booklet' | 'nup'>('sheet')
  const [sheetMargin, setSheetMargin] = useState<number | null>(null)
  const [paper, setPaper] = useState<Paper>('a4')
  const [foldLine, setFoldLine] = useState(false)
  const [preset, setPreset] = useState<NUpPresetId>('4')
  const [marginMm, setMarginMm] = useState(10)
  const [gapMm, setGapMm] = useState(4)
  const [border, setBorder] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  const nup = NUP_PRESETS.find((p) => p.id === preset) ?? NUP_PRESETS[1]
  // une page déjà à la taille du papier s'imprime sans marge ; sinon une petite marge que l'imprimante pourra couvrir
  const pageLandscape = doc.width > doc.height
  const paperPx = sheetSize({ paper, landscape: pageLandscape })
  const exactPaper = Math.abs(doc.width - paperPx.width) <= 2 && Math.abs(doc.height - paperPx.height) <= 2
  const sheetMm = sheetMargin ?? (exactPaper ? 0 : 8)
  const imposed = useMemo(
    () =>
      open
        ? mode === 'booklet'
          ? bookletDocument(doc, { paper, foldLine })
          : mode === 'sheet'
            ? nUpDocument(doc, { paper, landscape: pageLandscape, cols: 1, rows: 1, marginMm: sheetMm, gapMm: 0, border: false })
            : nUpDocument(doc, { paper, landscape: nup.landscape, cols: nup.cols, rows: nup.rows, marginMm, gapMm, border })
        : null,
    [open, doc, mode, paper, foldLine, nup, marginMm, gapMm, border, pageLandscape, sheetMm]
  )

  // Échap ferme la fenêtre, même si le focus n'y est plus
  useEffect(() => {
    if (!open || busy) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') usePrintDialog.getState().setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, busy])

  if (!open || !imposed) return null
  const close = (): void => usePrintDialog.getState().setOpen(false)
  const pages = doc.pages.length
  const blanks = bookletBlanks(pages)
  const slot = mode === 'sheet' ? cells({ paper, landscape: pageLandscape, cols: 1, rows: 1, marginMm: sheetMm, gapMm: 0, cutMarks: false, mirrorBacks: false, fillCell: false })[0] : mode === 'booklet' ? { width: sheetSize({ paper, landscape: true }).width / 2, height: sheetSize({ paper, landscape: true }).height } : cells({ paper, landscape: nup.landscape, cols: nup.cols, rows: nup.rows, marginMm, gapMm, cutMarks: false, mirrorBacks: false, fillCell: false })[0]
  const mismatch = ratioMismatch(doc, slot)
  const stem = mode === 'sheet' ? fileSafeName(doc.name) : mode === 'booklet' ? translate('print.file.booklet', { name: fileSafeName(doc.name) }) : translate('print.file.nup', { name: fileSafeName(doc.name), n: nup.cols * nup.rows })

  const run = async (): Promise<void> => {
    setBusy(true)
    setMessage('')
    try {
      if (await exportImposed(imposed, stem)) close()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }
  const print = async (): Promise<void> => {
    setBusy(true)
    setMessage('')
    try {
      const res = await printImposed(imposed, mode === 'booklet' ? 'shortEdge' : 'simplex')
      if (res.status === 'printed') close()
      else if (res.status === 'failed') setMessage(translate('print.failed', { reason: res.reason }))
    } catch (err) {
      setMessage(translate('print.failed', { reason: err instanceof Error ? err.message : String(err) }))
    } finally {
      setBusy(false)
    }
  }
  const num = (v: string, min: number, max: number, fallback: number): number => (Number.isFinite(Number(v)) && v !== '' ? Math.min(max, Math.max(min, Math.round(Number(v) * 10) / 10)) : fallback)

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={t('print.title')}>
      <div className="modal wide print-dialog">
        <h3>{t('print.title')}</h3>
        <fieldset className="pages-choice" disabled={busy}>
          <legend>{t('print.mode')}</legend>
          <label className="choice-row"><input type="radio" name="print-mode" data-print-mode="sheet" checked={mode === 'sheet'} onChange={() => setMode('sheet')} /> {t('print.mode.sheet')}</label>
          <label className="choice-row"><input type="radio" name="print-mode" data-print-mode="booklet" checked={mode === 'booklet'} onChange={() => setMode('booklet')} /> {t('print.mode.booklet')}</label>
          <label className="choice-row"><input type="radio" name="print-mode" data-print-mode="nup" checked={mode === 'nup'} onChange={() => setMode('nup')} /> {t('print.mode.nup')}</label>
        </fieldset>

        <div className="row wrap">
          <label>
            {t('print.paper')}
            <select data-field="printPaper" value={paper} disabled={busy} onChange={(e) => setPaper(e.target.value as Paper)}>
              <option value="a4">A4</option>
              <option value="letter">{t('mm.paper.letter')}</option>
            </select>
          </label>
          {mode === 'nup' && (
            <label>
              {t('print.perSheet')}
              <select data-field="printPerSheet" value={preset} disabled={busy} onChange={(e) => setPreset(e.target.value as NUpPresetId)}>
                {NUP_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>{t('print.perSheet.n', { count: p.cols * p.rows })}</option>
                ))}
              </select>
            </label>
          )}
        </div>
        {mode === 'nup' && (
          <>
            <div className="mm-grid">
              <label>{t('print.margin')}<input type="number" data-field="printMargin" min={0} max={50} value={marginMm} disabled={busy} onChange={(e) => setMarginMm(num(e.target.value, 0, 50, marginMm))} /></label>
              <label>{t('print.gap')}<input type="number" data-field="printGap" min={0} max={50} value={gapMm} disabled={busy} onChange={(e) => setGapMm(num(e.target.value, 0, 50, gapMm))} /></label>
            </div>
            <label className="choice-row"><input type="checkbox" data-field="printBorder" checked={border} disabled={busy} onChange={(e) => setBorder(e.target.checked)} /> {t('print.border')}</label>
          </>
        )}
        {mode === 'sheet' && (
          <div className="mm-grid">
            <label>{t('print.margin')}<input type="number" data-field="printSheetMargin" min={0} max={50} value={sheetMm} disabled={busy} onChange={(e) => setSheetMargin(num(e.target.value, 0, 50, sheetMm))} /></label>
          </div>
        )}
        {mode === 'booklet' && <label className="choice-row"><input type="checkbox" data-field="printFold" checked={foldLine} disabled={busy} onChange={(e) => setFoldLine(e.target.checked)} /> {t('print.fold')}</label>}

        <div className="mm-preview" data-print-preview>
          {imposed.doc.pages.slice(0, 2).map((p) => (
            <PageThumb key={p.id} page={p} width={imposed.doc.width} height={imposed.doc.height} maxW={280} maxH={230} />
          ))}
        </div>

        <p data-print-summary>
          {mode === 'sheet'
            ? t('print.summary.sheet', { count: pages, pages, sheets: pages })
            : mode === 'booklet'
              ? t('print.summary.booklet', { count: pages, pages, sheets: imposed.sides / 2, sides: imposed.sides, blanks })
              : t('print.summary.nup', { count: pages, pages, sheets: sheetCount(pages, nup.cols * nup.rows) })}
        </p>
        {mode === 'booklet' && blanks > 0 && <p className="hint" data-print-blanks>{t('print.pagesMultiple')}</p>}
        {mismatch && mode !== 'sheet' && <div className="warn" role="status" data-print-ratio>{t('print.ratio')}</div>}
        <p className="hint" data-print-how>{mode === 'sheet' ? t('print.how.sheet') : mode === 'booklet' ? t('print.how.booklet') : t('print.how.nup')}</p>
        {mode === 'booklet' && <p className="hint" data-print-duplex>{t('print.duplex.hint')}</p>}
        {message && <div className="warn" role="status" data-print-message>{message}</div>}
        <div className="row end">
          <button data-action="print-close" onClick={close} disabled={busy}>{t('common.close')}</button>
          <button data-action="print-export" onClick={() => void run()} disabled={busy}>{t('print.export')}</button>
          <button className="primary" data-action="print-now" onClick={() => void print()} disabled={busy}>{busy ? t('print.printing') : t('print.print')}</button>
        </div>
      </div>
    </div>
  )
}
