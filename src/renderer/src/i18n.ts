import { useCallback } from 'react'
import { create } from 'zustand'
import { DEFAULT_LOCALE, LOCALES, isLocale, resolveLocale, translator, type MessageKey, type Params } from '@shared/i18n'

const KEY = 'trame.lang'

/** Langue au démarrage : choix enregistré, sinon langue du système (imposée par `TRAME_LANG` en test), sinon l'anglais. */
function initialLocale(): string {
  const forced = window.trame?.forcedLocale
  if (isLocale(forced)) return forced
  try {
    const stored = localStorage.getItem(KEY)
    if (isLocale(stored)) return stored
  } catch {
    /* stockage indisponible : on suit le système */
  }
  return resolveLocale(typeof navigator === 'undefined' ? [] : navigator.languages?.length ? navigator.languages : [navigator.language])
}

const apply = (code: string): void => {
  if (typeof document !== 'undefined') document.documentElement.lang = code
  // le processus principal traduit ses boîtes de dialogue dans la même langue
  if (typeof window !== 'undefined') void window.trame?.setLocale?.(code)
}

export const useLocale = create<{ locale: string; setLocale: (code: string) => void }>((set, get) => ({
  locale: typeof window === 'undefined' ? DEFAULT_LOCALE : initialLocale(),
  setLocale: (code) => {
    if (!isLocale(code) || code === get().locale) return
    try {
      localStorage.setItem(KEY, code)
    } catch {
      /* le choix vaut pour la session */
    }
    set({ locale: code })
    apply(code)
  }
}))

/** Le nom est-il celui d'un document sans titre, dans n'importe quelle langue ? (un document créé en français reste « Sans titre » après un changement de langue) */
export const isUntitledName = (name: string): boolean => LOCALES.some((l) => l.catalog['doc.untitled'] === name)

/** Traduction hors composant (actions, messages d'erreur) : langue courante au moment de l'appel. */
export const t = (key: MessageKey, params?: Params): string => translator(useLocale.getState().locale)(key, params)

/** Traduction dans un composant : le composant se redessine quand la langue change. */
export function useT(): (key: MessageKey, params?: Params) => string {
  const locale = useLocale((s) => s.locale)
  return useCallback((key, params) => translator(locale)(key, params), [locale])
}

if (typeof window !== 'undefined') {
  apply(useLocale.getState().locale)
  // l'écran de l'orateur est une autre fenêtre : il suit le choix fait dans la fenêtre principale
  window.addEventListener('storage', (e) => {
    if (e.key === KEY && isLocale(e.newValue) && e.newValue !== useLocale.getState().locale) {
      useLocale.setState({ locale: e.newValue })
      apply(e.newValue)
    }
  })
}
