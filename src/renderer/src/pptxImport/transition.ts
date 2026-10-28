import { transitionFromEffect } from '@/pptxTransition'
import type { PageTransition } from '@/transition'
import { deep, kids, nameOfEl } from './xml'

/**
 * Transition d'une diapositive : `<p:transition>` de la diapositive. PowerPoint récent l'écrit dans un `AlternateContent` (effet moderne
 * dans `Choice`, équivalent classique dans `Fallback`) : on lit le **repli**, que Trame sait interpréter. Pas de transition = « aucune ».
 */
export function readTransition(slideDoc: Document | null): PageTransition {
  const root = slideDoc?.documentElement
  if (!root) return 'none'
  const all = deep(root, 'transition')
  if (all.length === 0) return 'none'
  const inFallback = (el: Element): boolean => {
    for (let p = el.parentNode; p; p = p.parentNode) if (p.nodeType === 1 && nameOfEl(p as Element) === 'Fallback') return true
    return false
  }
  const chosen = all.find((t) => t.parentNode === root) ?? all.find(inFallback) ?? all[0]
  const effect = kids(chosen).find((k) => !['sndAc'].includes(nameOfEl(k)))
  return transitionFromEffect(effect ? nameOfEl(effect) : null)
}
