import { create } from 'zustand'
import { resolveTheme, sanitizeThemeMode, type ThemeMode } from '@/theme'

const KEY = 'trame.theme'

const load = (): ThemeMode => {
  try {
    return sanitizeThemeMode(localStorage.getItem(KEY))
  } catch {
    return 'auto'
  }
}

const systemDark = (): boolean => !!window.matchMedia?.('(prefers-color-scheme: dark)').matches

interface ThemeState {
  mode: ThemeMode
  /** thème appliqué (le système tranche en mode automatique) */
  theme: 'light' | 'dark'
  setMode: (mode: ThemeMode) => void
}

export const useTheme = create<ThemeState>((set) => ({
  mode: load(),
  theme: resolveTheme(load(), systemDark()),
  setMode: (mode) => {
    try {
      localStorage.setItem(KEY, mode)
    } catch {
      /* stockage indisponible : le choix vaut pour cette session */
    }
    set({ mode, theme: resolveTheme(mode, systemDark()) })
  }
}))

/** Pose le thème sur la page (attribut `data-theme`, lu par la feuille de style) et le suit quand il change ou que le système change. */
export function startTheme(): void {
  const apply = (): void => {
    document.documentElement.dataset.theme = useTheme.getState().theme
  }
  apply()
  useTheme.subscribe(apply)
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener('change', () => {
    const { mode } = useTheme.getState()
    useTheme.setState({ theme: resolveTheme(mode, systemDark()) })
  })
}
