import { useEffect, useMemo, useState } from 'react'
import { describePages, effectiveScale, parsePageRange } from '@/pageExport'
import { exportPagesImages } from '@/pageExportActions'
import { useEditor } from '@/store/editor'
import { useExportPages } from '@/store/exportPages'

type Which = 'all' | 'current' | 'range'

/** Exporter les pages en images : format, qualité, taille et choix des pages ; plusieurs pages donnent une archive ZIP. */
export function ExportPagesDialog(): React.JSX.Element | null {
  const open = useExportPages((s) => s.open)
  const doc = useEditor((s) => s.doc)
  const pageId = useEditor((s) => s.pageId)
  const [format, setFormat] = useState<'png' | 'jpg'>('png')
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
      const res = await exportPagesImages({ format, pages: choice.pages, scale, quality: quality / 100, onProgress: (done, total) => setProgress({ done, total }) })
      if (res.saved) {
        close()
        if (res.scale < scale) await window.trame.showInfo('Images réduites', `Pour ne pas dépasser 8 000 px de côté, les images ont été exportées à l'échelle ×${res.scale.toFixed(2)} au lieu de ×${scale}.`)
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err))
    } finally {
      setProgress(null)
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Exporter les pages" onKeyDown={(e) => e.key === 'Escape' && !busy && close()}>
      <div className="modal">
        <h3>Exporter les pages en images</h3>
        <div className="row">
          <label className="seg-label">Format</label>
          <div className="seg" role="group" aria-label="Format">
            {(['png', 'jpg'] as const).map((f) => (
              <button key={f} data-export-format={f} aria-pressed={format === f} className={format === f ? 'active' : ''} disabled={busy} onClick={() => setFormat(f)}>
                {f.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        {format === 'jpg' && (
          <label>
            Qualité JPEG : {quality} %
            <input type="range" data-field="exportQuality" min={50} max={100} value={quality} disabled={busy} onChange={(e) => setQuality(Number(e.target.value))} />
          </label>
        )}
        <label>
          Taille
          <select data-field="exportScale" value={scale} disabled={busy} onChange={(e) => setScale(Number(e.target.value))}>
            {[1, 2, 3].map((k) => (
              <option key={k} value={k}>
                ×{k} — {Math.round(doc.width * effectiveScale(doc.width, doc.height, k))} × {Math.round(doc.height * effectiveScale(doc.width, doc.height, k))} px
              </option>
            ))}
          </select>
        </label>
        <fieldset className="pages-choice" disabled={busy}>
          <legend>Pages</legend>
          <label className="choice-row"><input type="radio" name="which" data-export-which="all" checked={which === 'all'} onChange={() => setWhich('all')} /> Toutes les pages ({doc.pages.length})</label>
          <label className="choice-row"><input type="radio" name="which" data-export-which="current" checked={which === 'current'} onChange={() => setWhich('current')} /> Page courante ({current})</label>
          <label className="choice-row">
            <input type="radio" name="which" data-export-which="range" checked={which === 'range'} onChange={() => setWhich('range')} />
            <input type="text" data-field="exportRange" placeholder="ex. : 1-3, 5" value={range} onFocus={() => setWhich('range')} onChange={(e) => { setRange(e.target.value); setWhich('range') }} />
          </label>
        </fieldset>
        <p className="hint" data-export-summary>
          {choice.ok ? `${describePages(choice.pages)} — ${choice.pages.length > 1 ? 'archive ZIP' : 'un fichier image'}.` : choice.error}
          {applied < scale ? ` Taille limitée à ×${applied.toFixed(2)} (8 000 px au plus).` : ''}
        </p>
        {busy && <p className="hint" role="status" data-export-progress>Rendu en cours… page {Math.min(progress.done + 1, progress.total)} / {progress.total}</p>}
        {message && <div className="warn" role="status">{message}</div>}
        <div className="row end">
          <button data-action="export-cancel" onClick={close} disabled={busy}>Annuler</button>
          <button className="primary" data-action="export-run" onClick={() => void run()} disabled={busy || !choice.ok}>Exporter</button>
        </div>
      </div>
    </div>
  )
}
