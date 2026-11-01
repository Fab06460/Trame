import { updateKey, useUpdate } from '@/store/update'
import { installUpdate } from '@/updateActions'
import { useT } from '@/i18n'

/** Petit bandeau en bas à gauche : une nouvelle version existe, se télécharge ou est prête. Jamais bloquant, « Plus tard » le masque. */
export function UpdateBanner(): React.JSX.Element | null {
  const t = useT()
  const state = useUpdate((s) => s.state)
  const dismissed = useUpdate((s) => s.dismissed)
  const open = useUpdate((s) => s.open)
  if (!state || open || !['available', 'downloading', 'ready', 'error'].includes(state.phase) || dismissed === updateKey(state)) return null
  const later = (): void => useUpdate.getState().dismiss(updateKey(state))
  const version = state.version ?? ''
  return (
    <div className="update-banner" role="status" data-update-banner={state.phase}>
      {state.phase === 'available' && (
        <>
          <span>{t('update.banner.available', { version })}</span>
          {state.manual ? (
            <button className="primary" data-action="update-page" onClick={() => void window.trame.openUpdatePage()}>{t('update.page')}</button>
          ) : (
            <button className="primary" data-action="update-download" onClick={() => void window.trame.downloadUpdate()}>{t('update.download')}</button>
          )}
          <button onClick={later}>{t('update.later')}</button>
        </>
      )}
      {state.phase === 'downloading' && <span>{t('update.banner.downloading', { version, percent: state.percent ?? 0 })}</span>}
      {state.phase === 'ready' && (
        <>
          <span>{t('update.banner.ready', { version })}</span>
          <button className="primary" data-action="update-install" onClick={() => void installUpdate()}>{t('update.install')}</button>
          <button onClick={later}>{t('update.later')}</button>
        </>
      )}
      {state.phase === 'error' && (
        <>
          <span>{t('update.banner.error')}</span>
          <button onClick={() => useUpdate.getState().setOpen(true)}>{t('update.details')}</button>
          <button onClick={later}>{t('common.close')}</button>
        </>
      )}
    </div>
  )
}
