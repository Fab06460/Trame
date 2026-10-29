/**
 * Cœur de l'internationalisation, partagé par le processus principal et l'interface (aucune dépendance, tourne hors ligne).
 *
 * Un catalogue est un objet à clés plates (`'toolbar.save'`) dont les valeurs sont un texte ou un pluriel `{ one, other }`.
 * Le français (`locales/fr.ts`) est la référence : son type impose les clés des autres langues, et un test vérifie aussi
 * que chaque langue garde les mêmes `{variables}` que le français.
 */

/** Pluriel : `one` pour 1 (et 0 en français), `other` pour le reste ; `zero` facultatif pour « aucun ». */
export interface Plural {
  zero?: string
  one: string
  other: string
}
export type Message = string | Plural
export type Params = Record<string, string | number>

export interface LocaleInfo {
  /** code BCP 47 court : « fr », « en », « de »… */
  code: string
  /** nom de la langue dans cette langue (affiché dans le sélecteur) */
  name: string
}

/** Cherche « {nom} » dans un texte. */
const VARIABLE = /\{(\w+)\}/g

/** Variables d'un message (tous les textes d'un pluriel confondus), pour vérifier la cohérence entre langues. */
export function variablesOf(message: Message): string[] {
  const texts = typeof message === 'string' ? [message] : Object.values(message)
  const found = new Set<string>()
  for (const text of texts) for (const m of text.matchAll(VARIABLE)) found.add(m[1])
  return [...found].sort()
}

/** Remplace les `{variables}` ; une variable absente reste visible telle quelle (une erreur de traduction se voit). */
export function interpolate(text: string, params?: Params): string {
  if (!params) return text
  return text.replace(VARIABLE, (whole, name: string) => (name in params ? String(params[name]) : whole))
}

/** Choisit la forme d'un message selon `params.count` (règles de la langue : `Intl.PluralRules`). */
export function pick(message: Message, locale: string, params?: Params): string {
  if (typeof message === 'string') return message
  const count = Number(params?.count ?? 0)
  if (count === 0 && message.zero !== undefined) return message.zero
  const rule = new Intl.PluralRules(locale).select(count)
  return rule === 'one' ? message.one : message.other
}

export type Translate<K extends string> = (key: K, params?: Params) => string

/**
 * Traducteur d'une langue : clé absente de la langue → texte français ; absente aussi du français → la clé elle-même
 * (visible à l'écran plutôt qu'un trou).
 */
export function makeTranslator<K extends string>(locale: string, catalog: Partial<Record<K, Message>>, fallback: Record<K, Message>): Translate<K> {
  return (key, params) => {
    const message = catalog[key] ?? fallback[key]
    if (message === undefined) return key
    return interpolate(pick(message, catalog[key] !== undefined ? locale : 'fr', params), params)
  }
}

/** Langue à utiliser : la première préférence (« fr-CA », « de_DE »…) dont la langue de base est disponible. */
export function matchLocale(preferred: readonly string[], available: readonly string[], fallback: string): string {
  for (const pref of preferred) {
    const base = pref.toLowerCase().split(/[-_]/)[0]
    if (available.includes(base)) return base
  }
  return fallback
}
