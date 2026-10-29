import { useEffect, useMemo, useState } from 'react'
import { describePages, effectiveScale, parsePageRange } from '@/pageExport'
import { exportPagesImages, type PageFormat } from '@/pageExportActions'
import { useEditor } from '@/store/editor'
import { useExportPages } from '@/store/exportPages'
import { useT } from '@/i18n'

type Which = 'all' | 'current' | 'range'

/** Exporter les pages en images : format, qualité, taille et choix des pages ; plusieurs pages donnent une archive ZIP. */
export function ExportPagesDialog(): React.JSX.Element | null {
  const t = useT()
  const open = useExportPages((s) => s.open)
  const doc = useEditor((s) => s.doc)
  const pageId = useEditor((s) => s.pageId)
  const [format, setFormat] = useState<PageFormat>('png')
  const [destination, setDestination] = useState<'archive' | 'folder'>('archive')
  const [quality, setQuality] = useState(90)
  const [scale, setScale] = useState(1)
  const [which, setWhich] = useState<Which>('all')
  const [range, setRange] = useState('')
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [message, setMessage] = useState('')

  const current = doc.pages.findIndex((p) => p.id === pageId) + 1
  const choice = useMemo(() => {
    if (which === 'all') return { ok: true as const, pages: doc.pages.map((_, i) => i + 1) }
    if (which === 'current') return { ok: true as const, pages: [current] }
    return parsePageRange(range, doc.pages.length)
  }, [which, range, doc.pages, current])

  useEffect(() => {
    if (open) {
      setMessage('')
      setProgress(null)
    }
  }, [open])

  if (!open) return null
  const close = (): void => useExportPages.getState().setOpen(false)
  const busy = progress !== null
  const applied = effectiveScale(doc.width, doc.height, scale)

  const run = async (): Promise<void> => {
    if (!choice.ok) return
    setProgress({ done: 0, total: choice.pages.length })
    setMessage('')
    try {
      const res = await exportPagesImages({ format, pages: choice.pages, scale, quality: quality / 100, destination, onProgress: (done, total) => setProgress({ done, total }) })
      if (res.saved) {
        close()
        if (res.scale < scale) await window.trame.showInfo(t('xp.reduced.title'), t('xp.reduced', { applied: res.scale.toFixed(2), requested: scale }))
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err))
    } finally {
      setProgress(null)
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={t('xp.title')} onKeyDown={(e) => e.key === 'Escape' && !busy && close()}>
      <div className="modal">
        <h3>{t('xp.title')}</h3>
        <div className="row">
          <label className="seg-label">{t('xp.format')}</label>
          <div className="seg" role="group" aria-label={t('xp.format')}>
            {(['png', 'jpg', 'svg'] as const).map((f) => (
              <button key={f} data-export-format={f} aria-pressed={format === f} className={format === f ? 'active' : ''} disabled={busy} onClick={() => setFormat(f)}>
                {f.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        {format === 'jpg' && (
          <label>
            {t('xp.quality', { quality })}
            <input type="range" data-field="exportQuality" min={50} max={100} value={quality} disabled={busy} onChange={(e) => setQuality(Number(e.target.value))} />
          </label>
        )}
        {format === 'svg' && <p className="hint">{t('xp.svgHint')}</p>}
        {format !== 'svg' && <label>
          {t('xp.size')}
          <select data-field="exportScale" value={scale} disabled={busy} onChange={(e) => setScale(Number(e.target.value))}>
            {[1, 2, 3].map((k) => (
              <option key={k} value={k}>
                ×{k} — {Math.round(doc.width * effectiveScale(doc.width, doc.height, k))} × {Math.round(doc.height * effectiveScale(doc.width, doc.height, k))} px
              </option>
            ))}
          </select>
        </label>}
        <fieldset className="pages-choice" disabled={busy}>
          <legend>{t('xp.pages')}</legend>
          <label className="choice-row"><input type="radio" name="which" data-export-which="all" checked={which === 'all'} onChange={() => setWhich('all')} /> {t('xp.all', { count: doc.pages.length })}</label>
          <label className="choice-row"><input type="radio" name="which" data-export-which="current" checked={which === 'current'} onChange={() => setWhich('current')} /> {t('xp.current', { page: current })}</label>
          <label className="choice-row">
            <input type="radio" name="which" data-export-which="range" checked={which === 'range'} onChange={() => setWhich('range')} />
            <input type="text" data-field="exportRange" placeholder={t('xp.range.placeholder')} value={range} onFocus={() => setWhich('range')} onChange={(e) => { setRange(e.target.value); setWhich('range') }} />
          </label>
        </fieldset>
        {choice.ok && choice.pages.length > 1 && (
          <fieldset className="pages-choice" disabled={busy}>
            <legend>{t('xp.destination')}</legend>
            <label className="choice-row"><input type="radio" name="dest" data-export-dest="archive" checked={destination === 'archive'} onChange={() => setDestination('archive')} /> {t('xp.dest.archive')}</label>
            <label className="choice-row"><input type="radio" name="dest" data-export-dest="folder" checked={destination === 'folder'} onChange={() => setDestination('folder')} /> {t('xp.dest.folder')}</label>
          </fieldset>
        )}
        <p className="hint" data-export-summary>
          {choice.ok ? t('xp.summary', { pages: describePages(choice.pages), what: choice.pages.length > 1 ? (destination === 'folder' ? t('xp.summary.folder') : t('xp.summary.zip')) : format === 'svg' ? t('xp.summary.svg') : t('xp.summary.image') }) : choice.error}
          {format !== 'svg' && applied < scale ? t('xp.limited', { scale: applied.toFixed(2) }) : ''}
        </p>
        {busy && <p className="hint" role="status" data-export-progress>{t('xp.progress', { page: Math.min(progress.done + 1, progress.total), total: progress.total })}</p>}
        {message && <div className="warn" role="status">{message}</div>}
        <div className="row end">
          <button data-action="export-cancel" onClick={close} disabled={busy}>{t('common.cancel')}</button>
          <button className="primary" data-action="export-run" onClick={() => void run()} disabled={busy || !choice.ok}>{t('xp.export')}</button>
        </div>
      </div>
    </div>
  )
}
