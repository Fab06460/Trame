/**
 * Distingue les sorties du plein écran voulues par l'application (déplacer la présentation sur un autre écran, laisser la place à
 * l'écran de l'orateur) de celles de l'utilisateur (bouton du système, Échap du système) : seules ces dernières terminent la
 * présentation. Chaque sortie programmée attend UN événement « leave-full-screen ».
 */
export function createFullscreenGuard(): {
  /** à appeler juste avant une sortie du plein écran provoquée par l'application */
  expectLeave: () => void
  /** à appeler à chaque événement de sortie : vrai s'il faut le signaler à l'interface (sortie de l'utilisateur) */
  onLeave: () => boolean
  /** à appeler à l'entrée en plein écran : une sortie attendue qui ne s'est pas produite ne doit pas masquer une vraie sortie plus tard */
  onEnter: () => void
} {
  let expected = 0
  return {
    expectLeave: () => {
      expected++
    },
    onLeave: () => {
      if (expected > 0) {
        expected--
        return false
      }
      return true
    },
    onEnter: () => {
      expected = 0
    }
  }
}

/** Ce dont la séquence a besoin d'une fenêtre (BrowserWindow en production, une fausse fenêtre dans les tests). */
export interface FullscreenWindow {
  isFullScreen: () => boolean
  setFullScreen: (on: boolean) => void
  once: (event: 'leave-full-screen', listener: () => void) => void
}

/**
 * Sort du plein écran **sans** que l'interface y voie la fin de la présentation, puis attend la fin de l'animation du système
 * (au plus `timeoutMs`). Sans effet si la fenêtre n'est pas en plein écran.
 */
export function leaveFullscreenQuietly(win: FullscreenWindow, guard: ReturnType<typeof createFullscreenGuard>, timeoutMs = 3000): Promise<void> {
  return new Promise((resolve) => {
    if (!win.isFullScreen()) return resolve()
    guard.expectLeave()
    const timeout = setTimeout(resolve, timeoutMs)
    win.once('leave-full-screen', () => {
      clearTimeout(timeout)
      resolve()
    })
    win.setFullScreen(false)
  })
}
