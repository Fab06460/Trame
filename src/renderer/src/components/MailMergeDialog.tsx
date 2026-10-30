import { useEffect, useMemo, useState } from 'react'
import { distinctValues, fieldsUsed, mergeDocument, parseRowRange, rowFileNames, selectRows, unknownFields } from '@/mailMerge'
import { MAX_GRID, layoutProblem, sheetsFromMerged, suggestGrid, type SheetLayout } from '@/mergeSheets'
import { exportMerge, pickMergeData } from '@/mailMergeActions'
import { useEditor } from '@/store/editor'
import { useMailMerge } from '@/store/mailMerge'
import { useT } from '@/i18n'
import { PageThumb } from './PageThumb'

/**
 * Publipostage : un tableau CSV dont chaque ligne remplit les champs « {{colonne}} » des textes. La fenêtre sert à choisir le fichier,
 * insérer les champs, contrôler le résultat ligne par ligne et exporter en PDF (un fichier, ou un par ligne). Rien ne quitte le poste.
 */
export function MailMergeDialog(): React.JSX.Element | null {
  const t = useT()
  const open = useMailMerge((s) => s.open)
  const doc = useEditor((s) => s.doc)
  const data = doc.mailMerge
  const [row, setRow] = useState(0)
  const [mode, setMode] = useState<'single' | 'folder'>('single')
  const [nameColumn, setNameColumn] = useState<number | null>(0)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [message, setMessage] = useState('')
  const [which, setWhich] = useState<'all' | 'range'>('all')
  const [range, setRange] = useState('')
  const [filterColumn, setFilterColumn] = useState<number | null>(null)
  const [filterValue, setFilterValue] = useState('')
  const [sheet, setSheet] = useState(false)
  const [layout, setLayout] = useState<SheetLayout>({ paper: 'a4', landscape: false, cols: 2, rows: 4, marginMm: 10, gapMm: 2, cutMarks: true, mirrorBacks: true })

  const shown = data ? Math.min(row, data.rows.length - 1) : 0
  const preview = useMemo(() => (data ? mergeDocument(doc, data, [shown]).pages : []), [doc, data, shown])
  const unknown = useMemo(() => (data ? unknownFields(doc, data.columns) : []), [doc, data])
  const used = useMemo(() => fieldsUsed(doc), [doc])
  const only = useMemo(() => {
    if (!data || which === 'all') return { ok: true as const, rows: null as number[] | null }
    const r = parseRowRange(range, data.rows.length)
    return r.ok ? { ok: true as const, rows: r.rows } : r
  }, [data, which, range])
  const values = useMemo(() => (data && filterColumn !== null ? distinctValues(data, filterColumn) : []), [data, filterColumn])
  const selected = useMemo(
    () => (data && only.ok ? selectRows(data, only.rows, filterColumn !== null && filterValue !== '' ? { column: filterColumn, value: filterValue } : null) : []),
    [data, only, filterColumn, filterValue]
  )
  const perCard = doc.pages.length
  const problem = sheet && mode === 'single' ? layoutProblem(layout) : null
  const sheetPreview = useMemo(() => {
    if (!data || !sheet || mode !== 'single' || problem || selected.length === 0) return null
    const perSheet = layout.cols * layout.rows
    return sheetsFromMerged(mergeDocument(doc, data, selected.slice(0, perSheet)), perCard, layout)
  }, [doc, data, sheet, mode, problem, selected, layout, perCard])

  const busyNow = progress !== null
  // Échap ferme la fenêtre même quand le focus n'est plus dans elle (un bouton disparu après un clic le fait perdre)
  useEffect(() => {
    if (!open || busyNow) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') useMailMerge.getState().setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, busyNow])

  // une autre fiche (autre modèle, autre format) : la grille proposée suit sa taille
  useEffect(() => {
    setLayout((l) => ({ ...l, ...suggestGrid({ width: doc.width, height: doc.height }, l) }))
  }, [doc.width, doc.height])

  if (!open) return null
  const close = (): void => useMailMerge.getState().setOpen(false)
  const busy = progress !== null
  const total = data?.rows.length ?? 0
  const names = data && selected.length ? rowFileNames(doc.name, data, [selected[0]], nameColumn, 'pdf') : []

  const choose = async (): Promise<void> => {
    setMessage('')
    const res = await pickMergeData()
    if (!res.ok) {
      if (res.error === 'empty') setMessage(t('mm.empty'))
      return
    }
    useEditor.getState().setMergeData(res.data)
    setRow(0)
    setNameColumn(0)
    setWhich('all')
    setFilterColumn(null)
    setFilterValue('')
    if (res.truncated) setMessage(t('mm.truncated'))
  }

  const insert = (field: string): void => {
    const state = useEditor.getState()
    const sel = state.selectedIds.length === 1 ? state.doc.pages.flatMap((p) => p.elements).find((e) => e.id === state.selectedIds[0]) : undefined
    const token = `{{${field}}}`
    if (sel?.type === 'text') state.updateElement(sel.id, { text: `${sel.text ?? ''}${sel.text ? ' ' : ''}${token}` })
    else state.addElement({ type: 'text', text: token }, { edit: false })
  }

  const run = async (): Promise<void> => {
    setMessage('')
    setProgress({ done: 0, total: selected.length })
    try {
      const res = await exportMerge({ mode, rows: selected, layout: sheet && mode === 'single' ? layout : null, nameColumn, onProgress: (done, all) => setProgress({ done, total: all }) })
      if (res.saved) close()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err))
    } finally {
      setProgress(null)
    }
  }

  const patchLayout = (patch: Partial<SheetLayout>, regrid = false): void => {
    setLayout((l) => {
      const next = { ...l, ...patch }
      return regrid ? { ...next, ...suggestGrid({ width: doc.width, height: doc.height }, next) } : next
    })
  }
  const num = (v: string, min: number, max: number, fallback: number): number => (Number.isFinite(Number(v)) && v !== '' ? Math.min(max, Math.max(min, Math.round(Number(v) * 10) / 10)) : fallback)
  const perSheet = layout.cols * layout.rows
  const sheetCount = Math.ceil(selected.length / Math.max(1, perSheet)) * perCard

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={t('mm.title')}>
      <div className="modal wide mail-merge">
        <h3>{t('mm.title')}</h3>
        {!data ? (
          <>
            <p className="hint">{t('mm.intro', { example: '{{prénom}}' })}</p>
            <p className="hint">{t('mm.format')}</p>
            {message && <div className="warn" role="status" data-mm-message>{message}</div>}
            <div className="row end">
              <button onClick={close}>{t('common.cancel')}</button>
              <button className="primary" data-action="mm-choose" onClick={() => void choose()}>{t('mm.choose')}</button>
            </div>
          </>
        ) : (
          <>
            <div className="row wrap">
              <span data-mm-summary>{t('mm.summary', { count: data.rows.length, cols: data.columns.length })}</span>
              <button data-action="mm-choose" disabled={busy} onClick={() => void choose()}>{t('mm.replace')}</button>
              <button className="danger" data-action="mm-remove" disabled={busy} onClick={() => { useEditor.getState().setMergeData(null); setMessage('') }}>{t('mm.remove')}</button>
            </div>

            <fieldset className="pages-choice" disabled={busy}>
              <legend>{t('mm.fields')}</legend>
              <div className="chips">
                {data.columns.map((c) => (
                  <button key={c} data-mm-field={c} className={used.some((u) => u.toLowerCase() === c.toLowerCase()) ? 'active' : ''} title={t('mm.insert', { field: `{{${c}}}` })} onClick={() => insert(c)}>
                    {c}
                  </button>
                ))}
              </div>
            </fieldset>
            {used.length === 0 && <div className="warn" role="status" data-mm-none>{t('mm.noneUsed')}</div>}
            {unknown.length > 0 && <div className="warn" role="status" data-mm-unknown>{t('mm.unknown', { fields: unknown.join(', ') })}</div>}

            <fieldset className="pages-choice">
              <legend>{t('mm.preview')}</legend>
              {sheetPreview ? (
                <div className="mm-preview" data-mm-sheet-preview>
                  {sheetPreview.doc.pages.slice(0, 2).map((p) => (
                    <PageThumb key={p.id} page={p} width={sheetPreview.doc.width} height={sheetPreview.doc.height} maxW={230} maxH={300} />
                  ))}
                </div>
              ) : (
              <>
              <div className="row">
                <button data-action="mm-prev" aria-label={t('mm.prev')} title={t('mm.prev')} disabled={shown <= 0} onClick={() => setRow(shown - 1)}>‹</button>
                <span data-mm-row={shown + 1}>{t('mm.row', { row: shown + 1, total })}</span>
                <button data-action="mm-next" aria-label={t('mm.next')} title={t('mm.next')} disabled={shown >= total - 1} onClick={() => setRow(shown + 1)}>›</button>
              </div>
              <div className="mm-preview">
                {preview.slice(0, 3).map((p) => (
                  <PageThumb key={p.id} page={p} width={doc.width} height={doc.height} maxW={250} maxH={200} />
                ))}
              </div>
              </>
              )}
            </fieldset>

            <fieldset className="pages-choice" disabled={busy}>
              <legend>{t('mm.rows')}</legend>
              <label className="choice-row"><input type="radio" name="mm-which" data-mm-which="all" checked={which === 'all'} onChange={() => setWhich('all')} /> {t('mm.rows.all', { count: total })}</label>
              <label className="choice-row">
                <input type="radio" name="mm-which" data-mm-which="range" checked={which === 'range'} onChange={() => setWhich('range')} />
                <input type="text" data-field="mmRange" placeholder={t('mm.rows.placeholder')} value={range} onFocus={() => setWhich('range')} onChange={(e) => { setRange(e.target.value); setWhich('range') }} />
              </label>
              <div className="row">
                <select data-field="mmFilterColumn" aria-label={t('mm.filter')} value={filterColumn ?? ''} onChange={(e) => { setFilterColumn(e.target.value === '' ? null : Number(e.target.value)); setFilterValue('') }}>
                  <option value="">{t('mm.filter.none')}</option>
                  {data.columns.map((c, i) => (
                    <option key={c} value={i}>{t('mm.filter.on', { column: c })}</option>
                  ))}
                </select>
                {filterColumn !== null && (
                  <select data-field="mmFilterValue" aria-label={t('mm.filter.value')} value={filterValue} onChange={(e) => setFilterValue(e.target.value)}>
                    <option value="">{t('mm.filter.any')}</option>
                    {values.map((v) => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>
                )}
              </div>
              {!only.ok && <div className="warn" role="status" data-mm-range-error>{only.error}</div>}
              <span className="hint" data-mm-selected={selected.length}>{t('mm.rows.selected', { count: selected.length })}</span>
            </fieldset>

            <fieldset className="pages-choice" disabled={busy}>
              <legend>{t('mm.export')}</legend>
              <label className="choice-row"><input type="radio" name="mm-mode" data-mm-mode="single" checked={mode === 'single'} onChange={() => setMode('single')} /> {t('mm.mode.single')}</label>
              <label className="choice-row"><input type="radio" name="mm-mode" data-mm-mode="folder" checked={mode === 'folder'} onChange={() => setMode('folder')} /> {t('mm.mode.folder')}</label>
              {mode === 'folder' && (
                <label>
                  {t('mm.fileName')}
                  <select data-field="mmNameColumn" value={nameColumn ?? ''} onChange={(e) => setNameColumn(e.target.value === '' ? null : Number(e.target.value))}>
                    {data.columns.map((c, i) => (
                      <option key={c} value={i}>{c}</option>
                    ))}
                    <option value="">{t('mm.fileName.number')}</option>
                  </select>
                </label>
              )}
            </fieldset>

            {mode === 'single' && (
              <fieldset className="pages-choice" disabled={busy}>
                <legend>{t('mm.layout')}</legend>
                <label className="choice-row"><input type="radio" name="mm-layout" data-mm-layout="page" checked={!sheet} onChange={() => setSheet(false)} /> {t('mm.layout.page')}</label>
                <label className="choice-row"><input type="radio" name="mm-layout" data-mm-layout="sheet" checked={sheet} onChange={() => { setSheet(true); patchLayout({}, true) }} /> {t('mm.layout.sheet')}</label>
                {sheet && (
                  <div className="mm-sheet">
                    <div className="row wrap">
                      <label>
                        {t('mm.paper')}
                        <select data-field="mmPaper" value={layout.paper} onChange={(e) => patchLayout({ paper: e.target.value as SheetLayout['paper'] }, true)}>
                          <option value="a4">A4</option>
                          <option value="letter">{t('mm.paper.letter')}</option>
                        </select>
                      </label>
                      <label>
                        {t('mm.orientation')}
                        <select data-field="mmOrientation" value={layout.landscape ? 'landscape' : 'portrait'} onChange={(e) => patchLayout({ landscape: e.target.value === 'landscape' }, true)}>
                          <option value="portrait">{t('mm.orientation.portrait')}</option>
                          <option value="landscape">{t('mm.orientation.landscape')}</option>
                        </select>
                      </label>
                    </div>
                    <div className="mm-grid">
                      <label>{t('mm.cols')}<input type="number" data-field="mmCols" min={1} max={MAX_GRID.cols} value={layout.cols} onChange={(e) => patchLayout({ cols: num(e.target.value, 1, MAX_GRID.cols, layout.cols) })} /></label>
                      <label>{t('mm.rowsGrid')}<input type="number" data-field="mmRows" min={1} max={MAX_GRID.rows} value={layout.rows} onChange={(e) => patchLayout({ rows: num(e.target.value, 1, MAX_GRID.rows, layout.rows) })} /></label>
                      <label>{t('mm.margin')}<input type="number" data-field="mmMargin" min={0} max={50} value={layout.marginMm} onChange={(e) => patchLayout({ marginMm: num(e.target.value, 0, 50, layout.marginMm) })} /></label>
                      <label>{t('mm.gap')}<input type="number" data-field="mmGap" min={0} max={50} value={layout.gapMm} onChange={(e) => patchLayout({ gapMm: num(e.target.value, 0, 50, layout.gapMm) })} /></label>
                    </div>
                    <label className="choice-row"><input type="checkbox" data-field="mmCut" checked={layout.cutMarks} onChange={(e) => patchLayout({ cutMarks: e.target.checked })} /> {t('mm.cut')}</label>
                    {perCard > 1 && <label className="choice-row"><input type="checkbox" data-field="mmMirror" checked={layout.mirrorBacks} onChange={(e) => patchLayout({ mirrorBacks: e.target.checked })} /> {t('mm.mirror')}</label>}
                    {problem === 'grid' && <div className="warn" role="status" data-mm-layout-error>{t('mm.layout.badGrid')}</div>}
                    {problem === 'room' && <div className="warn" role="status" data-mm-layout-error>{t('mm.layout.tooSmall')}</div>}
                    {sheetPreview && sheetPreview.overflow > 0 && <div className="warn" role="status" data-mm-overflow>{t('mm.layout.overflow', { count: Math.ceil(sheetPreview.overflow / Math.max(1, Math.min(selected.length, perSheet))) })}</div>}
                  </div>
                )}
              </fieldset>
            )}
            <p className="hint" data-mm-export-summary>
              {mode === 'single'
                ? sheet
                  ? t('mm.summary.sheets', { count: sheetCount, rows: selected.length, per: perSheet })
                  : t('mm.summary.single', { pages: selected.length * perCard, rows: selected.length })
                : t('mm.summary.folder', { count: selected.length, example: names[0] ?? '' })}
            </p>
            <p className="hint">{t('mm.dataSaved')}</p>
            {busy && mode === 'folder' && <p className="hint" role="status" data-mm-progress>{t('mm.progress', { done: Math.min(progress.done + 1, progress.total), total: progress.total })}</p>}
            {busy && mode === 'single' && <p className="hint" role="status" data-mm-progress>{t('mm.working')}</p>}
            {message && <div className="warn" role="status" data-mm-message>{message}</div>}
            <div className="row end">
              <button data-action="mm-close" onClick={close} disabled={busy}>{t('mm.close')}</button>
              <button className="primary" data-action="mm-export" onClick={() => void run()} disabled={busy || selected.length === 0 || !!problem}>{t('xp.export')}</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
