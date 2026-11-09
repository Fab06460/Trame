/** Apparence de l'interface de l'éditeur : clair, sombre, ou celle du système. */
export type ThemeMode = 'auto' | 'light' | 'dark'
export const THEME_MODES: ThemeMode[] = ['auto', 'light', 'dark']

/** Un réglage lu du stockage : tout ce qui n'est pas connu retombe sur « automatique ». */
export const sanitizeThemeMode = (v: unknown): ThemeMode => (v === 'light' || v === 'dark' ? v : 'auto')

/** Le thème réellement appliqué : le choix, ou celui du système en mode automatique. */
export const resolveTheme = (mode: ThemeMode, systemDark: boolean): 'light' | 'dark' => (mode === 'auto' ? (systemDark ? 'dark' : 'light') : mode)
