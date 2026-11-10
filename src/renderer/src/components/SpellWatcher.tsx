import { useEffect } from 'react'
import { useEditor } from '@/store/editor'
import { useSpell } from '@/store/spell'
import { scanDocument } from '@/spellScan'

/**
 * Relit l'orthographe de tout le document dès qu'il change (après une courte pause), que l'onglet « Orthographe » soit ouvert ou non :
 * le résultat alimente la pastille de l'onglet, sa liste et le soulignement des fautes sur le canevas. Ne rend rien.
 */
export function SpellWatcher(): null {
  const doc = useEditor((s) => s.doc)
  const ignored = useSpell((s) => s.ignored)
  const enabled = useSpell((s) => s.enabled)
  const version = useSpell((s) => s.version)

  useEffect(() => {
    void window.trame.spellState().then((s) => useSpell.getState().setEnabled(s.enabled))
  }, [])
  useEffect(() => {
    if (!enabled) {
      useSpell.getState().setIssues(null)
      return
    }
    const timer = setTimeout(() => useSpell.getState().setIssues(scanDocument(doc, (words) => window.trame.spellCheck(words), ignored)), 350)
    return () => clearTimeout(timer)
  }, [doc, ignored, enabled, version])
  return null
}
