import { useEffect, useState } from 'react'
import { recap, secondsFromSpent } from '@/timing'
import { formatElapsed } from '@/speakerFormat'
import { useEditor } from '@/store/editor'
import { recapHidden, setRecapHidden, useTimingRecap } from '@/store/timingRecap'
import { formatDrift } from '@/timing'
import { useT } from '@/i18n'

/**
 * Temps passé sur chaque page à la fin d'une présentation (une répétition, par exemple), comparé au temps prévu (la durée de la page).
 * On peut reprendre ces temps comme temps prévus : un seul pas d'annulation. Rien n'est enregistré sans ce clic.
 */
export function TimingRecapDialog(): React.JSX.Element | null {
  const t = useT()
  const doc = useTimingRecap((s) => s.doc)
  const spent = useTimingRecap((s) => s.spent)
  const [hide, setHide] = useState(recapHidden())
  const [applied, setApplied] = useState<number | null>(null)

  useEffect(() => {
    if (doc) setApplied(null)
  }, [doc])
  useEffect(() => {
    if (!doc) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') useTimingRecap.getState().close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [doc])

  if (!doc) return null
  const r = recap(doc, spent)
  const close = (): void => {
    setRecapHidden(hide)
    useTimingRecap.getState().close()
  }
  const apply = (): void => {
    const changes = r.rows.flatMap((row) => {
      const seconds = secondsFromSpent(row.spent)
      return seconds === null ? [] : [{ pageId: row.pageId, seconds }]
    })
    setApplied(useEditor.getState().setPagesSeconds(changes))
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={t('timing.title')} data-timing-recap>
      <div className="modal wide">
        <h3>{t('timing.title')}</h3>
        <table className="timing-table">
          <thead>
            <tr>
              <th>{t('timing.col.page')}</th>
              <th>{t('timing.col.spent')}</th>
              <th>{t('timing.col.planned')}</th>
              <th>{t('timing.col.diff')}</th>
            </tr>
          </thead>
          <tbody>
            {r.rows.map((row) => (
              <tr key={row.pageId} data-timing-row={row.index + 1}>
                <td>{row.index + 1}</td>
                <td data-timing="spent">{formatElapsed(row.spent)}</td>
                <td data-timing="planned">{row.planned > 0 ? formatElapsed(row.planned) : '–'}</td>
                <td data-timing="diff" className={row.diff !== null && row.diff > 1000 ? 'late' : undefined}>{row.diff === null ? '–' : formatDrift(row.diff)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p data-timing-total data-timing-spent={Math.round(r.spent / 1000)}>
          {t('timing.total', { time: formatElapsed(r.spent) })}
          {r.planned > 0 ? ` · ${t('timing.planned', { time: formatElapsed(r.planned) })} (${formatDrift(r.spent - r.planned)})` : ''}
        </p>
        <p className="hint">{t('timing.hint')}</p>
        {applied !== null && <p className="hint" role="status" data-timing-applied>{t('timing.applied', { count: applied })}</p>}
        <label className="choice-row"><input type="checkbox" data-field="timingHide" checked={hide} onChange={(e) => setHide(e.target.checked)} /> {t('timing.hide')}</label>
        <div className="row end">
          <button data-action="timing-apply" onClick={apply} title={t('timing.apply.title')}>{t('timing.apply')}</button>
          <button className="primary" data-action="timing-close" onClick={close}>{t('common.close')}</button>
        </div>
      </div>
    </div>
  )
}
