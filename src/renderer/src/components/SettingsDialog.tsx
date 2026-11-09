import { useEffect, useState } from 'react'
import { LOCALES } from '@shared/i18n'
import { recapHidden, setRecapHidden } from '@/store/timingRecap'
import { useLocale, useT } from '@/i18n'
import { useSettingsDialog } from '@/store/settingsDialog'
import { useUpdate } from '@/store/update'
import { useView, type ViewSettings } from '@/store/view'
import type { SpellUiState } from '../../../preload'

const SPELL_NAMES: Record<string, string> = { fr: 'Français', en: 'English', de: 'Deutsch', es: 'Español' }
const VIEW_ROWS: Array<{ key: keyof ViewSettings; label: 'view.rulers' | 'view.guides' | 'view.snap'; title: 'view.rulers.title' | 'view.guides.title' | 'view.snap.title' }> = [
  { key: 'rulers', label: 'view.rulers', title: 'view.rulers.title' },
  { key: 'guides', label: 'view.guides', title: 'view.guides.title' },
  { key: 'snap', label: 'view.snap', title: 'view.snap.title' }
]

/**
 * Fenêtre « Réglages » : les réglages généraux de l'application au même endroit. Chaque réglage garde son stockage d'origine (la langue et
 * l'affichage sur cet ordinateur, le correcteur et « rouvrir le dernier document » côté système) ; la fenêtre ne fait que les réunir,
 * et chaque changement s'applique tout de suite.
 */
export function SettingsDialog(): React.JSX.Element | null {
  const open = useSettingsDialog((s) => s.open)
  return open ? <Dialog /> : null
}

function Dialog(): React.JSX.Element {
  const t = useT()
  const locale = useLocale((s) => s.locale)
  const view = useView((s) => s.settings)
  const update = useUpdate((s) => s.state)
  const [reopen, setReopen] = useState<boolean | null>(null)
  const [spell, setSpell] = useState<SpellUiState | null>(null)
  const [recapOff, setRecapOff] = useState(recapHidden)
  const close = (): void => useSettingsDialog.getState().setOpen(false)

  useEffect(() => {
    let live = true
    void window.trame.getAppSettings().then((s) => live && setReopen(s.reopenLast))
    void window.trame.spellState().then((s) => live && setSpell(s))
    return () => {
      live = false
    }
  }, [])
  // Échap ferme la fenêtre, même si le focus n'y est plus
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') useSettingsDialog.getState().setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const pending = update?.phase === 'available' || update?.phase === 'ready'

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={t('settings.dialog.title')} data-settings-dialog onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="modal wide settings-dialog">
        <h3>{t('settings.dialog.title')}</h3>

        <section>
          <h4>{t('settings.section.general')}</h4>
          <label className="settings-line" title={t('lang.title')}>
            <span>{t('lang.title')}</span>
            <select data-field="language" value={locale} aria-label={t('lang.title')} onChange={(e) => useLocale.getState().setLocale(e.target.value)}>
              {LOCALES.map((l) => (
                <option key={l.code} value={l.code} lang={l.code}>{l.name}</option>
              ))}
            </select>
          </label>
          <label className="check">
            <input
              type="checkbox"
              data-field="reopenLast"
              checked={reopen ?? true}
              disabled={reopen === null}
              onChange={(e) => {
                setReopen(e.target.checked)
                void window.trame.setAppSettings({ reopenLast: e.target.checked }).then((s) => setReopen(s.reopenLast))
              }}
            />{' '}
            {t('settings.reopenLast')}
          </label>
          <p className="hint">{t('settings.reopenLast.hint')}</p>
        </section>

        <section>
          <h4>{t('settings.section.view')}</h4>
          {VIEW_ROWS.map((r) => (
            <label key={r.key} className="check" title={t(r.title)}>
              <input type="checkbox" data-field={`view-${r.key}`} checked={view[r.key]} onChange={() => useView.getState().toggleSetting(r.key)} /> {t(r.label)}
            </label>
          ))}
        </section>

        {spell && (
          <section data-settings-spell>
            <h4>{t('settings.section.spell')}</h4>
            <label className="check">
              <input type="checkbox" data-field="settingsSpellEnabled" checked={spell.enabled} onChange={(e) => void window.trame.setSpell({ enabled: e.target.checked }).then(setSpell)} /> {t('spell.enabled')}
            </label>
            <label className="settings-line">
              <span>{t('spell.language')}</span>
              <select data-field="settingsSpellLanguage" value={spell.language} disabled={spell.systemManaged || !spell.enabled} onChange={(e) => void window.trame.setSpell({ language: e.target.value }).then(setSpell)}>
                <option value="auto">{t('spell.language.auto')}</option>
                {spell.languages.map((l) => (
                  <option key={l} value={l}>{SPELL_NAMES[l] ?? l}</option>
                ))}
              </select>
            </label>
            {spell.systemManaged && <p className="hint">{t('spell.system')}</p>}
          </section>
        )}

        <section>
          <h4>{t('settings.section.presentation')}</h4>
          <label className="check">
            <input
              type="checkbox"
              data-field="timingRecap"
              checked={!recapOff}
              onChange={(e) => {
                setRecapOff(!e.target.checked)
                setRecapHidden(!e.target.checked)
              }}
            />{' '}
            {t('settings.timingRecap')}
          </label>
        </section>

        {update?.current && (
          <section>
            <h4>{t('settings.section.updates')}</h4>
            <button
              className="settings-update"
              data-action="update-open"
              title={t('update.open.title')}
              onClick={() => {
                close()
                useUpdate.getState().setOpen(true)
              }}
            >
              {t('update.footer', { version: update.current })}
              {pending ? ` · ${t('settings.updateAvailable')}` : ''}
            </button>
          </section>
        )}

        <div className="row end">
          <button className="primary" data-action="settings-close" onClick={close}>{t('common.close')}</button>
        </div>
      </div>
    </div>
  )
}
