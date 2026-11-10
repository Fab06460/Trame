import { useT } from '@/i18n'
import { useSettingsDialog } from '@/store/settingsDialog'
import { useUpdate } from '@/store/update'
import { useHelp } from '@/store/help'
import { HelpIcon, SettingsIcon } from './SideIcons'

/**
 * Bouton « Réglages » fixé au bas de la colonne d'onglets (il ne défile jamais avec le contenu du panneau) : il ouvre la fenêtre des
 * réglages généraux (⌘,). Un point signale une mise à jour proposée.
 */
export function SettingsMenu(): React.JSX.Element {
  const t = useT()
  const update = useUpdate((s) => s.state)
  const open = useSettingsDialog((s) => s.open)
  const helpOpen = useHelp((s) => s.open)
  const pending = update?.phase === 'available' || update?.phase === 'ready'

  return (
    <div className="side-settings">
      <button
        className={`side-tab${helpOpen ? ' active' : ''}`}
        data-action="help-open"
        aria-haspopup="dialog"
        aria-expanded={helpOpen}
        title={t('help.title')}
        onClick={() => useHelp.getState().show()}
      >
        <HelpIcon />
        <span className="side-label">{t('help.label')}</span>
      </button>
      <button
        className={`side-tab${open ? ' active' : ''}`}
        data-action="settings-open"
        aria-haspopup="dialog"
        aria-expanded={open}
        title={pending ? `${t('settings.title')} · ${t('settings.updateAvailable')}` : t('settings.title')}
        onClick={() => useSettingsDialog.getState().setOpen(true)}
      >
        <SettingsIcon />
        {pending && <span className="side-dot" data-side-alert="update" aria-hidden="true" />}
        <span className="side-label">{t('settings.label')}</span>
      </button>
    </div>
  )
}
