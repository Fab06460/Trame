import { useEffect } from 'react'
import { useRecovery, discardRecovery, resumeRecovery } from '@/recoveryActions'
import { formatDateTime } from '@/formatDate'
import { useT } from '@/i18n'

/** Proposée au lancement quand la session précédente s'est interrompue avec des modifications non enregistrées. */
export function RecoveryDialog(): React.JSX.Element | null {
  const t = useT()
  const items = useRecovery((s) => s.items)

  useEffect(() => {
    if (!items.length) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') useRecovery.getState().set([])
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [items.length])

  if (!items.length) return null
  const later = (): void => useRecovery.getState().set([])
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={t('recovery.title')} data-recovery>
      <div className="modal wide">
        <h3>{t('recovery.title')}</h3>
        <p>{t('recovery.body', { count: items.length })}</p>
        <ul className="recovery-list">
          {items.map((i) => (
            <li key={i.id} data-recovery-item={i.id}>
              <span>
                <strong>{i.name || t('doc.untitled')}</strong>
                <span className="hint"> · {formatDateTime(i.at)}{i.path ? ` · ${i.path.split(/[\\/]/).pop()}` : ` · ${t('recovery.neverSaved')}`}</span>
              </span>
              <span className="row">
                <button data-action="recovery-discard" onClick={() => void discardRecovery(i)}>{t('recovery.discard')}</button>
                <button className="primary" data-action="recovery-resume" onClick={() => void resumeRecovery(i).then((ok) => ok && later())}>{t('recovery.resume')}</button>
              </span>
            </li>
          ))}
        </ul>
        <p className="hint">{t('recovery.hint')}</p>
        <div className="row end">
          <button data-action="recovery-later" onClick={later}>{t('recovery.later')}</button>
        </div>
      </div>
    </div>
  )
}
