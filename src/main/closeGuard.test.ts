import { describe, expect, it } from 'vitest'
import { createCloseGuard } from './closeGuard'

describe('closeGuard', () => {
  it('ne bloque rien sans modifications', () => {
    const g = createCloseGuard()
    expect(g.onClose()).toBe(false)
  })

  it('bloque la fermeture avec des modifications puis laisse passer après confirmation', () => {
    const g = createCloseGuard()
    g.setDirty(true)
    expect(g.onClose()).toBe(true)
    expect(g.onConfirmed()).toBe('close')
    expect(g.onClose()).toBe(false)
  })

  it('une sortie (⌘Q) interrompue est relancée après confirmation : le bug « l’appli ne quitte pas »', () => {
    const g = createCloseGuard()
    g.setDirty(true)
    g.onBeforeQuit()
    expect(g.onClose()).toBe(true) // la fermeture bloquée annule la sortie d'Electron…
    expect(g.onConfirmed()).toBe('quit') // …donc il faut quitter explicitement
    g.onBeforeQuit() // app.quit() relancé
    expect(g.onClose()).toBe(false) // la fenêtre se ferme cette fois
  })

  it('annuler une sortie ne transforme pas la fermeture suivante de la fenêtre en sortie', () => {
    const g = createCloseGuard()
    g.setDirty(true)
    g.onBeforeQuit()
    expect(g.onClose()).toBe(true) // ⌘Q puis « Annuler » : pas de onConfirmed
    expect(g.onClose()).toBe(true) // plus tard, clic sur la croix de la fenêtre
    expect(g.onConfirmed()).toBe('close') // simple fermeture, l'application reste ouverte
  })

  it('fermer la fenêtre sans quitter reste une simple fermeture', () => {
    const g = createCloseGuard()
    g.setDirty(true)
    expect(g.onClose()).toBe(true)
    expect(g.onConfirmed()).toBe('close')
  })

  it('onClosed réinitialise tout pour la fenêtre suivante', () => {
    const g = createCloseGuard()
    g.setDirty(true)
    g.onBeforeQuit()
    g.onClose()
    g.onConfirmed()
    g.onClosed()
    expect(g.onClose()).toBe(false) // nouvelle fenêtre, document propre
    g.setDirty(true)
    expect(g.onClose()).toBe(true)
    expect(g.onConfirmed()).toBe('close')
  })
})
