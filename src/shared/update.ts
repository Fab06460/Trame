/** État des mises à jour, partagé entre le processus principal (qui le calcule) et l'interface (qui l'affiche). */
export type UpdatePhase = 'idle' | 'checking' | 'none' | 'available' | 'downloading' | 'ready' | 'error' | 'disabled'

export interface UpdateState {
  phase: UpdatePhase
  /** version installée */
  current: string
  /** version proposée (phases available, downloading, ready) */
  version?: string
  /** avancement du téléchargement, 0 à 100 */
  percent?: number
  /** message technique de la dernière erreur (phase error) */
  error?: string
  /** pourquoi les mises à jour sont désactivées (phase disabled) */
  reason?: 'dev' | 'unconfigured' | 'test'
  /** l'installation ne peut pas se faire seule (ex. Linux hors AppImage) : on propose la page de téléchargement */
  manual: boolean
  /** vérification automatique au lancement */
  auto: boolean
  /** date de la dernière vérification terminée, en ms */
  lastCheck?: number
}

export interface UpdateSettings {
  auto: boolean
  lastCheck?: number
}

export const DEFAULT_SETTINGS: UpdateSettings = { auto: true }

/** Lit le fichier de réglages ; tout contenu illisible redonne les réglages par défaut. */
export function parseUpdateSettings(raw: string): UpdateSettings {
  try {
    const d = JSON.parse(raw)
    return {
      auto: d?.auto !== false,
      ...(typeof d?.lastCheck === 'number' && Number.isFinite(d.lastCheck) && d.lastCheck > 0 ? { lastCheck: d.lastCheck } : {})
    }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

/** Intervalle minimal entre deux vérifications automatiques : on ne sollicite pas GitHub à chaque lancement. */
export const MIN_CHECK_INTERVAL_MS = 12 * 3600 * 1000

export const shouldAutoCheck = (s: UpdateSettings, now: number): boolean => s.auto && (s.lastCheck === undefined || now - s.lastCheck >= MIN_CHECK_INTERVAL_MS || s.lastCheck > now)

/** Le dépôt est-il renseigné ? (Le dépôt d'origine contient un nom provisoire tant que la première publication n'a pas eu lieu.) */
export const isRepoConfigured = (owner: unknown, repo: unknown): boolean =>
  typeof owner === 'string' && typeof repo === 'string' && /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(owner) && /^[A-Za-z0-9._-]{1,100}$/.test(repo) && owner !== 'OWNER'

export const releasesUrl = (owner: string, repo: string): string => `https://github.com/${owner}/${repo}/releases/latest`

/** Dépôt GitHub d'après le champ `repository` de package.json (chaîne ou `{ url }`) : `https://github.com/utilisateur/depot(.git)`, `github:utilisateur/depot`, `git@github.com:utilisateur/depot.git`. */
export function parseRepository(repository: unknown): { owner: string; repo: string } | null {
  const url = typeof repository === 'string' ? repository : typeof (repository as { url?: unknown })?.url === 'string' ? (repository as { url: string }).url : ''
  const m = /^(?:github:|(?:git\+)?(?:https?:\/\/|ssh:\/\/git@|git@)github\.com[/:])([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/.exec(url.trim())
  return m && isRepoConfigured(m[1], m[2]) ? { owner: m[1], repo: m[2] } : null
}
