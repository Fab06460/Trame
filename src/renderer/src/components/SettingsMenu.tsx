import { useCallback, useEffect, useRef, useState } from 'react'
import { LOCALES } from '@shared/i18n'
import { useLocale, useT } from '@/i18n'
import { useUpdate } from '@/store/update'
import { SettingsIcon } from './SideIcons'
import { useDismiss } from './useDismiss'

/**
 * Bouton « Réglages » fixé au bas de la colonne d'onglets (il ne défile jamais avec le contenu du panneau) : une petite fenêtre avec la
 * langue de l'interface (changement immédiat, mémorisé) et la version installée, qui ouvre la fenêtre des mises à jour. Un point signale
 * une mise à jour proposée. La fenêtre est positionnée par rapport à l'écran (`fixed`) : la barre latérale coupe tout ce qui dépasse.
 */
export function SettingsMenu(): React.JSX.Element {
  const t = useT()
  const locale = useLocale((s) => s.locale)
  const update = useUpdate((s) => s.state)
  const [open, setOpen] = useState(false)
  const [at, setAt] = useState<{ left: number; bottom: number }>({ left: 0, bottom: 0 })
  const root = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const close = useCallback(() => setOpen(false), [])
  useDismiss(open, root, close)

  const place = useCallback((): void => {
    const r = button.current?.getBoundingClientRect()
    if (r) setAt({ left: Math.round(r.right + 8), bottom: Math.max(8, Math.round(window.innerHeight - r.bottom)) })
  }, [])
  useEffect(() => {
    if (!open) return
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [open, place])

  const pending = update?.phase === 'available' || update?.phase === 'ready'

  return (
    <div className="side-settings" ref={root}>
      <button
        ref={button}
        className={`side-tab${open ? ' active' : ''}`}
        data-action="settings-open"
        aria-haspopup="dialog"
        aria-expanded={open}
        title={pending ? `${t('settings.title')} · ${t('settings.updateAvailable')}` : t('settings.title')}
        onClick={() => setOpen((o) => !o)}
      >
        <SettingsIcon />
        {pending && <span className="side-dot" data-side-alert="update" aria-hidden="true" />}
        <span className="side-label">{t('settings.label')}</span>
      </button>
      {open && (
        <div className="settings-popup" role="dialog" aria-label={t('settings.title')} data-settings-popup style={{ left: at.left, bottom: at.bottom }}>
          <label className="settings-row" title={t('lang.title')}>
            <span aria-hidden>🌐</span>
            <select data-field="language" value={locale} aria-label={t('lang.title')} onChange={(e) => useLocale.getState().setLocale(e.target.value)}>
              {LOCALES.map((l) => (
                <option key={l.code} value={l.code} lang={l.code}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
          {update?.current && (
            <button
              className="settings-row settings-version"
              data-action="update-open"
              title={t('update.open.title')}
              onClick={() => {
                setOpen(false)
                useUpdate.getState().setOpen(true)
              }}
            >
              {t('update.footer', { version: update.current })}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
