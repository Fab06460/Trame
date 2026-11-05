import { create } from 'zustand'
import type { TrameDocument } from '@/types'
import { useEditor } from '@/store/editor'
import { endOf, nextPosition, prevPosition, stepsOf } from '@/builds'
import type { PageTransition } from '@/transition'

/** Mode présentation : le document est figé au lancement (on ne modifie rien pendant qu'on présente) et la page affichée est suivie ici. */
export const usePresentation = create<{
  active: boolean
  doc: TrameDocument | null
  index: number
  /** clics déjà faits sur la page affichée (éléments qui apparaissent pas à pas), de 0 à `stepsOf(page)` */
  step: number
  /** début de la présentation (ms depuis 1970), partagé avec l'écran de l'orateur */
  startedAt: number
  start: (fromPage?: number) => void
  /** Va à une page, au début (`step` 0) ou entièrement montrée (`'end'`). */
  go: (index: number, step?: number | 'end') => void
  /** Un clic de plus (ou la page suivante), un clic de moins (ou la page précédente entièrement montrée). */
  next: () => void
  prev: () => void
  /** Change la transition du document (et de la présentation en cours). */
  setTransition: (transition: PageTransition) => void
  stop: () => void
}>((set, get) => ({
  active: false,
  doc: null,
  index: 0,
  step: 0,
  startedAt: 0,
  start: (fromPage) => {
    const { doc, pageId } = useEditor.getState()
    const current = doc.pages.findIndex((p) => p.id === pageId)
    set({ active: true, startedAt: Date.now(), doc, step: 0, index: Math.max(0, Math.min(doc.pages.length - 1, fromPage ?? current)) })
  },
  go: (to, step = 0) => {
    const doc = get().doc
    if (!doc) return
    const index = Math.max(0, Math.min(doc.pages.length - 1, to))
    set({ index, step: step === 'end' ? endOf(doc, index).step : Math.max(0, Math.min(stepsOf(doc.pages[index]), Math.floor(step))) })
  },
  next: () => {
    const { doc, index, step } = get()
    if (doc) set(nextPosition(doc, { index, step }))
  },
  prev: () => {
    const { doc, index, step } = get()
    if (doc) set(prevPosition(doc, { index, step }))
  },
  setTransition: (transition) => {
    useEditor.getState().setTransition(transition)
    const doc = get().doc
    if (doc) set({ doc: { ...doc, transition: useEditor.getState().doc.transition } })
  },
  stop: () => {
    const { doc, index, active } = get()
    if (!active) return
    // on revient dans l'éditeur sur la page où l'on s'est arrêté
    const page = doc?.pages[index]
    if (page && useEditor.getState().doc.pages.some((p) => p.id === page.id)) useEditor.getState().setPage(page.id)
    set({ active: false, doc: null })
  }
}))
