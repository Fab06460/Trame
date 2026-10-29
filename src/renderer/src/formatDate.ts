import { t, useLocale } from '@/i18n'

/** Date relative lisible : « à l'instant », « il y a 3 heures », « hier », puis la date complète au-delà d'une semaine. */
export function formatRelative(ms: number, now: number = Date.now()): string {
  const locale = useLocale.getState().locale
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  const seconds = Math.round((ms - now) / 1000)
  const abs = Math.abs(seconds)
  if (abs < 60) return t('time.justNow')
  if (abs < 3600) return rtf.format(Math.round(seconds / 60), 'minute')
  if (abs < 86400) return rtf.format(Math.round(seconds / 3600), 'hour')
  if (abs < 7 * 86400) return rtf.format(Math.round(seconds / 86400), 'day')
  return new Date(ms).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })
}
