import { useEffect, type RefObject } from 'react'

/** Ferme un menu déroulant : clic en dehors de `root`, ou Échap (capturé : la touche ne désélectionne rien dans l'éditeur). */
export function useDismiss(open: boolean, root: RefObject<HTMLElement | null>, close: () => void): void {
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      if (!root.current?.contains(e.target as Node)) close()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        close()
      }
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [open, root, close])
}
