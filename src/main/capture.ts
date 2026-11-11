import { app, BrowserWindow, desktopCapturer, globalShortcut, ipcMain, nativeImage, screen, session, shell, systemPreferences, Tray } from 'electron'
import type { CaptureError, CaptureSource, CaptureStill } from '../shared/capture'

/** Raccourci qui arrête l'enregistrement quand la fenêtre de Trame est réduite (le témoin de la barre de menus fait de même). */
export const CAPTURE_STOP_SHORTCUT = 'CommandOrControl+Alt+R'

const THUMB = { width: 320, height: 200 }
const MAX_STILL_SIDE = 7680

interface Deps {
  getWindow: () => BrowserWindow | null
  /** Mode des tests de bout en bout : aucune question d'autorisation, pas de réduction de la fenêtre. */
  testMode: boolean
}

let armed: string | null = null
let tray: Tray | null = null
let shortcutOn = false
let hidden = false

/** macOS demande l'autorisation « Enregistrement de l'écran » ; tant qu'elle manque, le système rend des images vides. */
const screenAccess = (testMode: boolean): boolean => testMode || process.platform !== 'darwin' || systemPreferences.getMediaAccessStatus('screen') === 'granted'

/** Pastille rouge de 16 × 16 pixels, dessinée à la main : Windows et Linux veulent une icône pour la zone de notification. */
function redDot(): Electron.NativeImage {
  const size = 16
  const buf = Buffer.alloc(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - 7.5, y - 7.5)
      const o = (y * size + x) * 4
      if (d <= 6.5) {
        buf[o] = 0x3c // B
        buf[o + 1] = 0x3c // G
        buf[o + 2] = 0xe0 // R
        buf[o + 3] = 255
      }
    }
  }
  return nativeImage.createFromBitmap(buf, { width: size, height: size })
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

export function registerCapture({ getWindow, testMode }: Deps): void {
  // getDisplayMedia() côté interface : on répond par la source que la personne a choisie dans la fenêtre de Trame (pas de sélecteur du système)
  session.defaultSession.setDisplayMediaRequestHandler(
    (_request, callback) => {
      const wanted = armed
      armed = null
      if (!wanted) return callback({})
      desktopCapturer
        .getSources({ types: ['screen', 'window'], thumbnailSize: { width: 0, height: 0 } })
        .then((sources) => {
          const source = sources.find((s) => s.id === wanted)
          callback(source ? { video: source } : {})
        })
        .catch(() => callback({}))
    },
    { useSystemPicker: false }
  )

  const ownId = (): string | null => {
    try {
      return getWindow()?.getMediaSourceId() ?? null
    } catch {
      return null
    }
  }

  ipcMain.handle('capture:sources', async (): Promise<{ sources: CaptureSource[] } | { error: CaptureError }> => {
    try {
      const sources = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: THUMB, fetchWindowIcons: false })
      const own = ownId()
      const list: CaptureSource[] = sources
        .filter((s) => s.id !== own && !s.thumbnail.isEmpty())
        .map((s) => ({ id: s.id, name: s.name || (s.id.startsWith('screen') ? 'Screen' : 'Window'), kind: s.id.startsWith('screen') ? ('screen' as const) : ('window' as const), thumb: s.thumbnail.toDataURL() }))
      if (!list.length && !screenAccess(testMode)) return { error: 'denied' }
      return { sources: list }
    } catch {
      return { error: screenAccess(testMode) ? 'failed' : 'denied' }
    }
  })

  ipcMain.handle('capture:open-settings', async (): Promise<boolean> => {
    if (process.platform !== 'darwin') return false
    await shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture').catch(() => {})
    return true
  })

  // image fixe : la fenêtre de Trame est réduite pour ne pas figurer sur la capture d'un écran entier
  ipcMain.handle('capture:still', async (_e, id: unknown, hideApp: unknown): Promise<CaptureStill | { error: CaptureError }> => {
    if (typeof id !== 'string' || id.length > 200) return { error: 'failed' }
    const win = getWindow()
    const hide = hideApp === true && !testMode && !!win && !win.isMinimized()
    try {
      if (hide) {
        win!.minimize()
        await sleep(900) // la fin de l'animation du système
      }
      const display = screen.getAllDisplays().find((d) => id.startsWith('screen:') && id.split(':')[1] === String(d.id))
      const scale = display?.scaleFactor ?? 1
      const size = display ? { width: Math.round(display.size.width * scale), height: Math.round(display.size.height * scale) } : { width: 3840, height: 2160 }
      const sources = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: Math.min(size.width, MAX_STILL_SIDE), height: Math.min(size.height, MAX_STILL_SIDE) }, fetchWindowIcons: false })
      const source = sources.find((s) => s.id === id)
      if (!source || source.thumbnail.isEmpty()) return { error: screenAccess(testMode) ? 'failed' : 'denied' }
      const { width, height } = source.thumbnail.getSize()
      return { dataUrl: source.thumbnail.toDataURL(), width, height }
    } catch {
      return { error: 'failed' }
    } finally {
      if (hide && win && !win.isDestroyed()) {
        win.restore()
        win.focus()
      }
    }
  })

  // vidéo : la source est « armée » juste avant getDisplayMedia()
  ipcMain.handle('capture:arm', (_e, id: unknown): boolean => {
    if (typeof id !== 'string' || id.length > 200) return false
    armed = id
    return true
  })

  const stopRequested = (): void => {
    const win = getWindow()
    if (win && !win.isDestroyed()) win.webContents.send('capture:stop')
  }

  // enregistrement commencé : témoin dans la barre de menus (ou la zone de notification), raccourci d'arrêt, fenêtre réduite si demandé
  ipcMain.handle('capture:started', (_e, hideApp: unknown): boolean => {
    const win = getWindow()
    try {
      if (!tray) {
        tray = new Tray(process.platform === 'darwin' ? nativeImage.createEmpty() : redDot())
        tray.setToolTip('Trame')
        tray.on('click', stopRequested)
        if (process.platform === 'darwin') tray.setTitle('● 0:00')
      }
    } catch {
      tray = null
    }
    try {
      shortcutOn = globalShortcut.register(CAPTURE_STOP_SHORTCUT, stopRequested)
    } catch {
      shortcutOn = false
    }
    hidden = false
    if (hideApp === true && !testMode && win && !win.isMinimized()) {
      win.minimize()
      hidden = true
    }
    return !!tray || shortcutOn
  })

  ipcMain.on('capture:tick', (_e, label: unknown) => {
    if (typeof label !== 'string' || label.length > 16) return
    if (process.platform === 'darwin') tray?.setTitle(`● ${label}`)
    else tray?.setToolTip(`Trame — ${label}`)
  })

  ipcMain.handle('capture:ended', (): void => {
    armed = null
    if (tray) {
      tray.destroy()
      tray = null
    }
    if (shortcutOn) {
      globalShortcut.unregister(CAPTURE_STOP_SHORTCUT)
      shortcutOn = false
    }
    const win = getWindow()
    if (hidden && win && !win.isDestroyed()) {
      win.restore()
      win.focus()
    }
    hidden = false
  })

  app.on('will-quit', () => globalShortcut.unregister(CAPTURE_STOP_SHORTCUT))
}
