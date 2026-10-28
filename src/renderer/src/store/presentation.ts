import { create } from 'zustand'
import type { TrameDocument } from '@/types'
import { useEditor } from '@/store/editor'
import type { PageTransition } from '@/transition'

/** Mode présentation : le document est figé au lancement (on ne modifie rien pendant qu'on présente) et la page affichée est suivie ici. */
export const usePresentation = create<{
  active: boolean
  doc: TrameDocument | null
  index: number
  start: (fromPage?: number) => void
  go: (index: number) => void
  /** Change la transition du document (et de la présentation en cours). */
  setTransition: (transition: PageTransition) => void
  stop: () => void
}>((set, get) => ({
  active: false,
  doc: null,
  index: 0,
  start: (fromPage) => {
    const { doc, pageId } = useEditor.getState()
    const current = doc.pages.findIndex((p) => p.id === pageId)
    set({ active: true, doc, index: Math.max(0, Math.min(doc.pages.length - 1, fromPage ?? current)) })
  },
  go: (index) => {
    const doc = get().doc
    if (doc) set({ index: Math.max(0, Math.min(doc.pages.length - 1, index)) })
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
