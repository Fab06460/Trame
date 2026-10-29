import { LOCALES } from '@shared/i18n'
import { useLocale, useT } from '@/i18n'

/** Choix de la langue de l'interface (pied de la barre latérale) : changement immédiat, mémorisé. Chaque langue porte son propre nom. */
export function LanguageSelect(): React.JSX.Element {
  const t = useT()
  const locale = useLocale((s) => s.locale)
  return (
    <label className="sidebar-footer" title={t('lang.title')}>
      <span aria-hidden>🌐</span>
      <select data-field="language" value={locale} aria-label={t('lang.title')} onChange={(e) => useLocale.getState().setLocale(e.target.value)}>
        {LOCALES.map((l) => (
          <option key={l.code} value={l.code} lang={l.code}>
            {l.name}
          </option>
        ))}
      </select>
    </label>
  )
}
