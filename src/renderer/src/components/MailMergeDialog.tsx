import { useEffect, useMemo, useState } from 'react'
import { fieldsUsed, mergeDocument, rowFileNames, unknownFields } from '@/mailMerge'
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

  const shown = data ? Math.min(row, data.rows.length - 1) : 0
  const preview = useMemo(() => (data ? mergeDocument(doc, data, [shown]).pages : []), [doc, data, shown])
  const unknown = useMemo(() => (data ? unknownFields(doc, data.columns) : []), [doc, data])
  const used = useMemo(() => fieldsUsed(doc), [doc])

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

  if (!open) return null
  const close = (): void => useMailMerge.getState().setOpen(false)
  const busy = progress !== null
  const total = data?.rows.length ?? 0
  const names = data ? rowFileNames(doc.name, data, [0], nameColumn, 'pdf') : []

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
    setProgress({ done: 0, total })
    try {
      const res = await exportMerge({ mode, nameColumn, onProgress: (done, all) => setProgress({ done, total: all }) })
      if (res.saved) close()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err))
    } finally {
      setProgress(null)
    }
  }

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
            <p className="hint" data-mm-export-summary>
              {mode === 'single' ? t('mm.summary.single', { pages: data.rows.length * doc.pages.length, rows: data.rows.length }) : t('mm.summary.folder', { count: data.rows.length, example: names[0] ?? '' })}
            </p>
            <p className="hint">{t('mm.dataSaved')}</p>
            {busy && mode === 'folder' && <p className="hint" role="status" data-mm-progress>{t('mm.progress', { done: Math.min(progress.done + 1, progress.total), total: progress.total })}</p>}
            {busy && mode === 'single' && <p className="hint" role="status" data-mm-progress>{t('mm.working')}</p>}
            {message && <div className="warn" role="status" data-mm-message>{message}</div>}
            <div className="row end">
              <button data-action="mm-close" onClick={close} disabled={busy}>{t('mm.close')}</button>
              <button className="primary" data-action="mm-export" onClick={() => void run()} disabled={busy || total === 0}>{t('xp.export')}</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
