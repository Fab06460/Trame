import { BrowserWindow, ipcMain, screen, shell, systemPreferences } from 'electron'
import { displayOfSource } from './capture'
import { CLICK_MIN_GAP_MS, clickFraction, type ClickTrackProblem } from '../shared/capture'

interface Deps {
  getWindow: () => BrowserWindow | null
  /** Tests de bout en bout : jamais de suivi de la souris. */
  testMode: boolean
  /** Session Linux « Wayland » : le système interdit de suivre la souris en dehors de ses fenêtres. */
  portalSession: () => boolean
}

type Hook = typeof import('uiohook-napi').uIOhook

let hook: Hook | null = null
let running = false
let listener: ((e: { button: unknown; x: number; y: number }) => void) | null = null

async function loadHook(): Promise<Hook | null> {
  if (hook) return hook
  try {
    hook = (await import('uiohook-napi')).uIOhook
    return hook
  } catch {
    return null
  }
}

function stopTracking(): void {
  if (!running) return
  running = false
  try {
    if (listener) hook?.off('mousedown', listener as never)
    hook?.stop()
  } catch {
    /* déjà arrêté */
  }
  listener = null
}

/**
 * Suivi des clics de souris pendant l'enregistrement d'un écran (tutoriel automatique). Chaque clic gauche donne sa position dans l'écran
 * enregistré, en fractions ; Trame y prend l'image et pose un repère. Les clics faits sur la fenêtre de Trame elle-même (le bouton d'arrêt) et ceux d'un
 * autre écran sont ignorés.
 */
export function registerClicks({ getWindow, testMode, portalSession }: Deps): void {
  ipcMain.handle('capture:clicks-start', async (_e, id: unknown): Promise<'ok' | ClickTrackProblem> => {
    if (typeof id !== 'string' || id.length > 200) return 'failed'
    if (testMode) return 'failed'
    if (portalSession()) return 'portal'
    if (!id.startsWith('screen:')) return 'window'
    const display = displayOfSource(id)
    if (!display) return 'failed'
    // macOS : suivre la souris en dehors de la fenêtre demande l'autorisation « Accessibilité » (la question est posée ici, une seule fois)
    if (process.platform === 'darwin' && !systemPreferences.isTrustedAccessibilityClient(true)) {
      void shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility').catch(() => {})
      return 'denied'
    }
    const h = await loadHook()
    if (!h) return 'failed'
    stopTracking()
    let last = 0
    listener = (e) => {
      if (e.button !== 1) return // le clic gauche seulement
      const now = Date.now()
      if (now - last < CLICK_MIN_GAP_MS) return
      // Windows et Linux donnent des pixels de l'écran ; le reste de Trame compte en points du bureau
      const point = process.platform === 'darwin' ? { x: e.x, y: e.y } : screen.screenToDipPoint({ x: e.x, y: e.y })
      const win = getWindow()
      if (win && !win.isDestroyed() && win.isVisible() && !win.isMinimized()) {
        const b = win.getBounds()
        if (point.x >= b.x && point.x <= b.x + b.width && point.y >= b.y && point.y <= b.y + b.height) return
      }
      const fraction = clickFraction(point, display.bounds)
      if (!fraction) return
      last = now
      if (win && !win.isDestroyed()) win.webContents.send('capture:click', fraction)
    }
    try {
      h.on('mousedown', listener as never)
      h.start()
      running = true
      return 'ok'
    } catch {
      stopTracking()
      return 'failed'
    }
  })

  ipcMain.handle('capture:clicks-stop', (): void => stopTracking())
}

export const stopClickTracking = stopTracking
