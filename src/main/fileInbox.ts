/**
 * Fichiers ouverts depuis le système (double-clic dans le Finder, glisser sur l'icône du Dock, « Ouvrir récent »)
 * à transmettre au renderer. macOS peut envoyer `open-file` **avant** que la fenêtre existe ou que l'interface soit
 * montée : on garde alors le dernier fichier reçu jusqu'à ce que le renderer se déclare prêt.
 * (Si plusieurs fichiers arrivent d'un coup, seul le dernier est ouvert : un document à la fois.)
 */
export function createFileInbox<T>(): {
  /** Retourne l'élément à envoyer tout de suite, ou null s'il est mis en attente (renderer pas prêt). */
  push: (item: T) => T | null
  /** Le renderer est monté et écoute : retourne l'élément en attente, le cas échéant. */
  onRendererReady: () => T | null
  /** La page se (re)charge ou la fenêtre se ferme : les prochains éléments seront mis en attente. */
  onRendererGone: () => void
} {
  let ready = false
  let pending: T | null = null

  return {
    push: (item) => {
      if (ready) return item
      pending = item
      return null
    },
    onRendererReady: () => {
      ready = true
      const item = pending
      pending = null
      return item
    },
    onRendererGone: () => {
      ready = false
    }
  }
}
