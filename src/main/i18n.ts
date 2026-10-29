import { DEFAULT_LOCALE, isLocale, resolveLocale, translator, type MessageKey, type Params } from '../shared/i18n'

let current = DEFAULT_LOCALE

/** Langue du processus principal : celle choisie dans l'interface (reçue au démarrage de la fenêtre), sinon celle du système. */
export function initMainLocale(preferred: readonly string[], forced?: string): void {
  current = isLocale(forced) ? forced : resolveLocale(preferred)
}

export function setMainLocale(code: unknown): void {
  if (isLocale(code)) current = code
}

export const mainLocale = (): string => current

/** Texte traduit pour les boîtes de dialogue et les messages d'erreur du processus principal. */
export const tm = (key: MessageKey, params?: Params): string => translator(current)(key, params)
