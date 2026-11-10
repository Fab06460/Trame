import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import type { UpdateSettings, UpdateState } from '../shared/update'
import { createUpdater, type UpdateEngine } from './updater'

class FakeEngine extends EventEmitter implements UpdateEngine {
  autoDownload = true
  autoInstallOnAppQuit = true
  checks = 0
  downloads = 0
  installs = 0
  failCheck: Error | null = null
  failDownload: Error | null = null
  checkForUpdates = vi.fn(async () => {
    this.checks++
    this.emit('checking-for-update')
    if (this.failCheck) {
      this.emit('error', this.failCheck)
      throw this.failCheck
    }
    return null
  })
  downloadUpdate = vi.fn(async () => {
    this.downloads++
    if (this.failDownload) throw this.failDownload
    this.emit('download-progress', { percent: 42.4 })
    this.emit('update-downloaded', { version: '2.0.0' })
  })
  quitAndInstall = vi.fn(() => {
    this.installs++
  })
}

function setup(over: Partial<{ disabled: 'dev' | 'unconfigured' | 'test' | null; manual: boolean; settings: UpdateSettings; now: number }> = {}) {
  const engine = new FakeEngine()
  const states: UpdateState[] = []
  let saved: UpdateSettings = over.settings ?? { auto: true }
  const beforeInstall = vi.fn()
  const u = createUpdater({
    engine,
    current: '1.0.0',
    disabled: over.disabled ?? null,
    manual: over.manual ?? false,
    loadSettings: async () => saved,
    saveSettings: async (s) => {
      saved = s
    },
    emit: (s) => states.push(s),
    beforeInstall,
    now: () => over.now ?? 1_000_000_000_000
  })
  const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0))
  return { engine, u, states, beforeInstall, saved: () => saved, flush }
}

describe('createUpdater', () => {
  it('ne télécharge ni n\'installe jamais tout seul', () => {
    const { engine } = setup()
    expect(engine.autoDownload).toBe(false)
    expect(engine.autoInstallOnAppQuit).toBe(false)
  })

  it('une mise à jour téléchargée sur clic s\'installe à la fermeture, même après « Plus tard »', async () => {
    const s = setup()
    s.engine.emit('update-available', { version: '2.0.0' })
    await s.flush()
    expect(s.engine.autoInstallOnAppQuit).toBe(false) // pas encore téléchargée : rien à installer
    await s.u.download()
    expect(s.u.state()).toMatchObject({ phase: 'ready' })
    expect(s.engine.autoInstallOnAppQuit).toBe(true)
    expect(s.engine.installs).toBe(0) // rien n'est relancé sans clic
  })

  it('au lancement : vérifie si c\'est activé et si la dernière vérification date', async () => {
    const a = setup()
    await a.u.init()
    expect(a.engine.checks).toBe(1)
    const recent = setup({ settings: { auto: true, lastCheck: 1_000_000_000_000 - 3600 * 1000 } })
    await recent.u.init()
    expect(recent.engine.checks).toBe(0)
    const off = setup({ settings: { auto: false } })
    await off.u.init()
    expect(off.engine.checks).toBe(0)
  })

  it('désactivé (développement, dépôt non renseigné, test) : ne vérifie rien et reste dans cet état', async () => {
    const s = setup({ disabled: 'dev' })
    await s.u.init()
    await s.u.check()
    await s.u.download()
    expect(s.engine.checks).toBe(0)
    expect(s.u.state()).toMatchObject({ phase: 'disabled', reason: 'dev' })
  })

  it('une mise à jour disponible est proposée et la date de vérification mémorisée', async () => {
    const s = setup()
    await s.u.init()
    s.engine.emit('update-available', { version: '2.0.0' })
    await s.flush()
    expect(s.u.state()).toMatchObject({ phase: 'available', version: '2.0.0' })
    expect(s.saved().lastCheck).toBe(1_000_000_000_000)
  })

  it('télécharge à la demande, signale l\'avancement puis « prête »', async () => {
    const s = setup()
    await s.u.init()
    s.engine.emit('update-available', { version: '2.0.0' })
    await s.flush()
    await s.u.download()
    expect(s.states.some((x) => x.phase === 'downloading' && x.percent === 42)).toBe(true)
    expect(s.u.state()).toMatchObject({ phase: 'ready', version: '2.0.0' })
  })

  it('ne télécharge pas sans mise à jour proposée, ni quand l\'installation est manuelle', async () => {
    const none = setup()
    await none.u.download()
    expect(none.engine.downloads).toBe(0)
    const manual = setup({ manual: true })
    manual.engine.emit('update-available', { version: '2.0.0' })
    await manual.flush()
    await manual.u.download()
    expect(manual.engine.downloads).toBe(0)
  })

  it('installe seulement quand la mise à jour est prête, en levant la garde juste avant', async () => {
    const s = setup()
    s.u.install()
    expect(s.engine.installs).toBe(0)
    s.engine.emit('update-available', { version: '2.0.0' })
    await s.flush()
    await s.u.download()
    s.u.install()
    expect(s.beforeInstall).toHaveBeenCalledTimes(1)
    expect(s.engine.installs).toBe(1)
    // installeur silencieux (sans redemander par utilisateur / par machine), puis relance de l'application
    expect(s.engine.quitAndInstall).toHaveBeenCalledWith(true, true)
  })

  it('une erreur de la vérification automatique reste silencieuse, celle d\'une vérification demandée est montrée', async () => {
    const auto = setup()
    auto.engine.failCheck = new Error('net::ERR_INTERNET_DISCONNECTED')
    await auto.u.init()
    expect(auto.u.state().phase).toBe('idle')
    const manual = setup({ settings: { auto: false } })
    manual.engine.failCheck = new Error('net::ERR_INTERNET_DISCONNECTED\nlong détail')
    await manual.u.init()
    await manual.u.check()
    expect(manual.u.state()).toMatchObject({ phase: 'error', error: 'net::ERR_INTERNET_DISCONNECTED' })
  })

  it('une erreur de téléchargement ou d\'installation est montrée', async () => {
    const s = setup()
    await s.u.init()
    s.engine.emit('update-available', { version: '2.0.0' })
    await s.flush()
    s.engine.failDownload = new Error('signature invalide')
    await s.u.download()
    expect(s.u.state()).toMatchObject({ phase: 'error', error: 'signature invalide' })
  })

  it('« à jour » est un état à part, et le réglage automatique se mémorise', async () => {
    const s = setup({ settings: { auto: false } })
    await s.u.init()
    await s.u.check()
    s.engine.emit('update-not-available', {})
    await s.flush()
    expect(s.u.state().phase).toBe('none')
    await s.u.setAuto(true)
    expect(s.saved().auto).toBe(true)
    expect(s.u.state().auto).toBe(true)
  })
})
