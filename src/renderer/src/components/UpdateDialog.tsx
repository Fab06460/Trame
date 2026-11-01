import { useEffect } from 'react'
import { useUpdate } from '@/store/update'
import { installUpdate } from '@/updateActions'
import { formatDateTime } from '@/formatDate'
import { useT } from '@/i18n'

/** Fenêtre « Mises à jour » : version installée, état, vérification à la demande, réglage de la vérification automatique. */
export function UpdateDialog(): React.JSX.Element | null {
  const t = useT()
  const open = useUpdate((s) => s.open)
  const state = useUpdate((s) => s.state)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') useUpdate.getState().setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  if (!open || !state) return null
  const close = (): void => useUpdate.getState().setOpen(false)
  const busy = state.phase === 'checking' || state.phase === 'downloading'
  const version = state.version ?? ''
  const line =
    state.phase === 'disabled'
      ? t(`update.disabled.${state.reason ?? 'dev'}` as 'update.disabled.dev')
      : state.phase === 'checking'
        ? t('update.checking')
        : state.phase === 'none'
          ? t('update.none')
          : state.phase === 'available'
            ? t('update.available', { version })
            : state.phase === 'downloading'
              ? t('update.downloading', { version, percent: state.percent ?? 0 })
              : state.phase === 'ready'
                ? t('update.ready', { version })
                : state.phase === 'error'
                  ? t('update.error', { error: state.error ?? '' })
                  : t('update.idle')

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={t('update.title')} data-update-dialog>
      <div className="modal">
        <h3>{t('update.title')}</h3>
        <p data-update-version>{t('update.current', { version: state.current })}</p>
        <p data-update-status role="status">{line}</p>
        {state.phase === 'downloading' && <progress max={100} value={state.percent ?? 0} aria-label={t('update.progress')} />}
        {state.lastCheck && state.phase !== 'disabled' && <p className="hint">{t('update.lastCheck', { date: formatDateTime(state.lastCheck) })}</p>}
        {state.manual && state.phase === 'available' && <p className="hint">{t('update.manual')}</p>}
        {state.phase !== 'disabled' && (
          <label className="choice-row">
            <input type="checkbox" data-field="updateAuto" checked={state.auto} onChange={(e) => void window.trame.setAutoUpdate(e.target.checked)} /> {t('update.auto')}
          </label>
        )}
        {state.phase !== 'disabled' && <p className="hint">{t('update.privacy')}</p>}
        <div className="row end wrap">
          <button data-action="update-close" onClick={close}>{t('common.close')}</button>
          {(state.phase === 'error' || (state.manual && state.phase === 'available')) && (
            <button data-action="update-page" onClick={() => void window.trame.openUpdatePage()}>{t('update.page')}</button>
          )}
          {state.phase !== 'disabled' && state.phase !== 'ready' && !(state.phase === 'available' && !state.manual) && (
            <button data-action="update-check" disabled={busy} onClick={() => void window.trame.checkForUpdates()}>{t('update.check')}</button>
          )}
          {state.phase === 'available' && !state.manual && (
            <button className="primary" data-action="update-download" onClick={() => void window.trame.downloadUpdate()}>{t('update.download')}</button>
          )}
          {state.phase === 'ready' && (
            <button className="primary" data-action="update-install" onClick={() => void installUpdate()}>{t('update.install')}</button>
          )}
        </div>
      </div>
    </div>
  )
}
