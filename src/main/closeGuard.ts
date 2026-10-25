/**
 * Machine à états de la fermeture de fenêtre / de la sortie de l'application avec modifications non enregistrées.
 *
 * Contrainte d'Electron : bloquer la fermeture d'une fenêtre pendant `app.quit()` **annule la sortie**. Une fois
 * que l'utilisateur a tranché (« Ne pas enregistrer » ou après enregistrement), refermer seulement la fenêtre
 * laisserait l'application ouverte sans fenêtre (macOS) : il faut relancer `app.quit()` si c'est une sortie
 * qui avait été interrompue.
 */
export function createCloseGuard(): {
  setDirty: (dirty: boolean) => void
  /** `app` « before-quit » */
  onBeforeQuit: () => void
  /** fenêtre « close » : true = empêcher la fermeture et demander au renderer de trancher */
  onClose: () => boolean
  /** le renderer a confirmé : quoi faire maintenant */
  onConfirmed: () => 'quit' | 'close'
  /** fenêtre « closed » */
  onClosed: () => void
} {
  let dirty = false
  let confirmed = false
  let quitting = false
  let quitAfterClose = false

  return {
    setDirty: (d) => {
      dirty = d
    },
    onBeforeQuit: () => {
      quitting = true
    },
    onClose: () => {
      if (!dirty || confirmed) return false
      // on retient l'origine (sortie ou simple fermeture) puis on réarme : si l'utilisateur annule, une
      // fermeture ultérieure de la fenêtre ne doit pas être prise pour une sortie
      quitAfterClose = quitting
      quitting = false
      return true
    },
    onConfirmed: () => {
      confirmed = true
      const action = quitAfterClose ? 'quit' : 'close'
      quitAfterClose = false
      return action
    },
    onClosed: () => {
      dirty = false
      confirmed = false
      quitting = false
      quitAfterClose = false
    }
  }
}
