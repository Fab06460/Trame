import { makeTranslator, matchLocale, type LocaleInfo, type Translate } from './core'
import { fr, type Catalog, type MessageKey } from './locales/fr'
import { en } from './locales/en'
import { de } from './locales/de'
import { es } from './locales/es'

export type { Catalog, MessageKey } from './locales/fr'
export type { Params, Plural, Message, Translate } from './core'
export { variablesOf } from './core'

/**
 * Langues disponibles. **Pour en ajouter une** : copier `locales/en.ts` vers `locales/<code>.ts`, traduire les textes
 * (le compilateur signale toute clé manquante) et ajouter une ligne ici — rien d'autre. Voir docs/I18N.md.
 */
export const LOCALES: readonly (LocaleInfo & { catalog: Catalog })[] = [
  { code: 'fr', name: 'Français', catalog: fr },
  { code: 'en', name: 'English', catalog: en },
  { code: 'de', name: 'Deutsch', catalog: de },
  { code: 'es', name: 'Español', catalog: es }
]

/** Langue de repli quand aucune préférence ne correspond. */
export const DEFAULT_LOCALE = 'en'
/** Langue de référence (celle dans laquelle l'application a été écrite). */
export const SOURCE_LOCALE = 'fr'

export const isLocale = (code: unknown): code is string => typeof code === 'string' && LOCALES.some((l) => l.code === code)

/** Langue à partir des préférences du système, dans l'ordre. */
export const resolveLocale = (preferred: readonly string[]): string =>
  matchLocale(preferred, LOCALES.map((l) => l.code), DEFAULT_LOCALE)

const translators = new Map<string, Translate<MessageKey>>()

/** Traducteur d'une langue (mis en cache). Une langue inconnue donne le français. */
export function translator(code: string): Translate<MessageKey> {
  const locale = LOCALES.find((l) => l.code === code) ?? LOCALES[0]
  let t = translators.get(locale.code)
  if (!t) {
    t = makeTranslator<MessageKey>(locale.code, locale.catalog, fr)
    translators.set(locale.code, t)
  }
  return t
}
