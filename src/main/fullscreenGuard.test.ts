import { describe, expect, it } from 'vitest'
import { createFullscreenGuard, leaveFullscreenQuietly, type FullscreenWindow } from './fullscreenGuard'

describe('garde du plein écran', () => {
  it('une sortie de l\'utilisateur est signalée', () => {
    expect(createFullscreenGuard().onLeave()).toBe(true)
  })
  it('une sortie programmée n\'est pas signalée, la suivante l\'est', () => {
    const g = createFullscreenGuard()
    g.expectLeave()
    expect(g.onLeave()).toBe(false)
    expect(g.onLeave()).toBe(true)
  })
  it('chaque sortie programmée couvre exactement un événement', () => {
    const g = createFullscreenGuard()
    g.expectLeave()
    g.expectLeave()
    expect([g.onLeave(), g.onLeave(), g.onLeave()]).toEqual([false, false, true])
  })
  it('l\'entrée en plein écran oublie une sortie attendue qui n\'est jamais venue', () => {
    const g = createFullscreenGuard()
    g.expectLeave()
    g.onEnter()
    expect(g.onLeave()).toBe(true)
  })
})

/** Fausse fenêtre : comme Electron, setFullScreen(false) déclenche « leave-full-screen » un peu plus tard (animation du système). */
function fakeWindow(guard: ReturnType<typeof createFullscreenGuard>) {
  let full = true
  const onceListeners: Array<() => void> = []
  const relayed: string[] = []
  const emitLeave = (): void => {
    full = false
    // même câblage que la fenêtre principale : l'écouteur permanent d'abord, puis ceux de once()
    if (guard.onLeave()) relayed.push('window:left-fullscreen')
    for (const l of onceListeners.splice(0)) l()
  }
  const win: FullscreenWindow & { relayed: string[]; userLeaves: () => void } = {
    isFullScreen: () => full,
    setFullScreen: (on) => {
      if (on) {
        full = true
        guard.onEnter()
      } else setTimeout(emitLeave, 5)
    },
    once: (_e, l) => void onceListeners.push(l),
    relayed,
    userLeaves: emitLeave
  }
  return win
}

describe('ouverture de l\'écran de l\'orateur avec un seul écran', () => {
  it('quitter le plein écran exprès ne termine pas la présentation (régression : retour à l\'éditeur)', async () => {
    const guard = createFullscreenGuard()
    const win = fakeWindow(guard)
    await leaveFullscreenQuietly(win, guard)
    expect(win.isFullScreen()).toBe(false)
    expect(win.relayed).toEqual([]) // l'interface n'a rien reçu : la présentation continue
  })
  it('une sortie de l\'utilisateur juste après reste signalée', async () => {
    const guard = createFullscreenGuard()
    const win = fakeWindow(guard)
    await leaveFullscreenQuietly(win, guard)
    win.setFullScreen(true)
    win.userLeaves()
    expect(win.relayed).toEqual(['window:left-fullscreen'])
  })
  it('sans plein écran, rien à faire et rien n\'est masqué ensuite', async () => {
    const guard = createFullscreenGuard()
    const win = fakeWindow(guard)
    win.userLeaves() // la fenêtre n'est plus en plein écran
    win.relayed.length = 0
    await leaveFullscreenQuietly(win, guard)
    win.setFullScreen(true)
    win.userLeaves()
    expect(win.relayed).toEqual(['window:left-fullscreen'])
  })
  it('si l\'événement n\'arrive jamais, on ne reste pas bloqué', async () => {
    const guard = createFullscreenGuard()
    const stuck: FullscreenWindow = { isFullScreen: () => true, setFullScreen: () => {}, once: () => {} }
    await leaveFullscreenQuietly(stuck, guard, 20)
  })
})
