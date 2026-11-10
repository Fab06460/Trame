import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { DEFAULT_SETTINGS, shouldAutoCheck, type UpdateSettings, type UpdateState } from '../shared/update'

/** Ce que Trame utilise d'`electron-updater` (et ce que les tests simulent). */
export interface UpdateEngine {
  on: (event: string, listener: (...args: any[]) => void) => unknown
  checkForUpdates: () => Promise<unknown>
  downloadUpdate: () => Promise<unknown>
  quitAndInstall: (isSilent?: boolean, isForceRunAfter?: boolean) => void
  autoDownload: boolean
  autoInstallOnAppQuit: boolean
}

export interface UpdaterDeps {
  engine: UpdateEngine
  current: string
  /** null = mises à jour possibles ; sinon la raison de leur désactivation */
  disabled: 'dev' | 'unconfigured' | 'test' | null
  /** l'installation ne peut pas se faire seule sur cette installation */
  manual: boolean
  loadSettings: () => Promise<UpdateSettings>
  saveSettings: (s: UpdateSettings) => Promise<void>
  /** appelé à chaque changement d'état */
  emit: (state: UpdateState) => void
  /** juste avant de relancer pour installer : lève la garde « modifications non enregistrées » (l'interface a déjà posé la question) */
  beforeInstall: () => void
  now?: () => number
}

const message = (err: unknown): string => (err instanceof Error ? err.message : String(err)).split('\n')[0].slice(0, 300)

/**
 * Cycle de vie des mises à jour : vérifier (au lancement si c'est activé, ou à la demande), proposer, télécharger SUR DEMANDE, puis
 * installer à la demande. Rien n'est téléchargé ni installé sans clic ; rien n'est vérifié sans réseau ni sans que l'utilisateur
 * l'ait laissé faire (le réglage est modifiable).
 */
export function createUpdater(deps: UpdaterDeps): {
  state: () => UpdateState
  init: () => Promise<void>
  check: () => Promise<void>
  download: () => Promise<void>
  install: () => void
  setAuto: (auto: boolean) => Promise<void>
} {
  const now = deps.now ?? Date.now
  let settings: UpdateSettings = { ...DEFAULT_SETTINGS }
  let st: UpdateState = { phase: deps.disabled ? 'disabled' : 'idle', current: deps.current, manual: deps.manual, auto: true, ...(deps.disabled ? { reason: deps.disabled } : {}) }
  // une vérification lancée à la demande montre ses erreurs ; celle du lancement reste silencieuse (pas de réseau = normal)
  let userInitiated = false

  const set = (patch: Partial<UpdateState>): void => {
    st = { ...st, ...patch, auto: settings.auto, ...(settings.lastCheck ? { lastCheck: settings.lastCheck } : {}) }
    deps.emit(st)
  }
  const touch = async (): Promise<void> => {
    settings = { ...settings, lastCheck: now() }
    await deps.saveSettings(settings).catch(() => {})
  }

  const e = deps.engine
  e.autoDownload = false
  e.autoInstallOnAppQuit = false
  e.on('checking-for-update', () => set({ phase: 'checking', error: undefined }))
  e.on('update-available', (info: { version?: string }) => {
    void touch().then(() => set({ phase: 'available', version: String(info?.version ?? ''), percent: undefined }))
  })
  e.on('update-not-available', () => void touch().then(() => set({ phase: 'none', version: undefined })))
  e.on('download-progress', (p: { percent?: number }) => set({ phase: 'downloading', percent: Math.max(0, Math.min(100, Math.round(Number(p?.percent) || 0))) }))
  e.on('update-downloaded', () => {
    // le téléchargement a été demandé par un clic : si l'utilisateur répond « Plus tard », la mise à jour s'installe à la fermeture de
    // l'application (la relance ouvre alors la nouvelle version). Avant tout téléchargement, rien ne s'installe jamais tout seul.
    e.autoInstallOnAppQuit = true
    set({ phase: 'ready', percent: 100 })
  })
  e.on('error', (err: unknown) => {
    if (st.phase === 'checking' && !userInitiated) {
      // vérification automatique sans réseau, ou dépôt injoignable : on ne dérange pas
      set({ phase: 'idle' })
      return
    }
    set({ phase: 'error', error: message(err) })
  })

  return {
    state: () => st,
    init: async () => {
      settings = await deps.loadSettings().catch(() => ({ ...DEFAULT_SETTINGS }))
      set({})
      if (!deps.disabled && shouldAutoCheck(settings, now())) {
        userInitiated = false
        await e.checkForUpdates().catch(() => {})
      }
    },
    check: async () => {
      if (deps.disabled || st.phase === 'checking' || st.phase === 'downloading') return
      userInitiated = true
      try {
        await e.checkForUpdates()
      } catch (err) {
        set({ phase: 'error', error: message(err) })
      }
    },
    download: async () => {
      if (deps.disabled || deps.manual || st.phase !== 'available') return
      set({ phase: 'downloading', percent: 0 })
      try {
        await e.downloadUpdate()
      } catch (err) {
        set({ phase: 'error', error: message(err) })
      }
    },
    install: () => {
      if (st.phase !== 'ready') return
      deps.beforeInstall()
      // Windows : installeur silencieux (il reprend l'installation en place, par utilisateur ou par machine, sans rien redemander) puis relance
      e.quitAndInstall(true, true)
    },
    setAuto: async (auto) => {
      settings = { ...settings, auto }
      await deps.saveSettings(settings).catch(() => {})
      set({})
    }
  }
}

/**
 * Moteur de remplacement pour les tests de bout en bout (`TRAME_TEST_EXPORT_DIR`) : aucune requête réseau. Une vérification trouve toujours
 * la version 9.9.9 ; « installer » écrit un fichier au lieu de relancer l'application.
 */
export function testUpdateEngine(dir: string): UpdateEngine {
  const listeners = new Map<string, Array<(...a: any[]) => void>>()
  const emit = (event: string, ...args: any[]): void => (listeners.get(event) ?? []).forEach((l) => l(...args))
  return {
    autoDownload: false,
    autoInstallOnAppQuit: false,
    on: (event, listener) => {
      listeners.set(event, [...(listeners.get(event) ?? []), listener])
    },
    checkForUpdates: async () => {
      emit('checking-for-update')
      setTimeout(() => emit('update-available', { version: '9.9.9' }), 50)
    },
    downloadUpdate: async () => {
      for (const percent of [10, 55, 100]) emit('download-progress', { percent })
      emit('update-downloaded', { version: '9.9.9' })
    },
    quitAndInstall: () => void writeFile(join(dir, 'update-installed.txt'), 'installé', 'utf-8')
  }
}
