import { create } from 'zustand'
import type { TrameDocument } from '@/types'
import { useEditor } from '@/store/editor'
import { endOf, nextPosition, prevPosition, stepsOf } from '@/builds'
import type { PageTransition } from '@/transition'
import { useTimingRecap } from '@/store/timingRecap'

/** Une présentation plus courte que cela (ms) n'affiche pas de récapitulatif des temps : c'est un simple coup d'œil. */
export const MIN_RECAP_MS = 20_000

/** Mode présentation : le document est figé au lancement (on ne modifie rien pendant qu'on présente) et la page affichée est suivie ici. */
/** Temps cumulés quand on quitte la page affichée pour `to` (rien ne change si l'on reste sur la même page ; `-1` : on quitte pour de bon). */
function leaving(s: { index: number; spent: number[]; enteredAt: number }, to: number): { spent: number[]; enteredAt: number } {
  if (to === s.index) return { spent: s.spent, enteredAt: s.enteredAt }
  const now = Date.now()
  const spent = [...s.spent]
  spent[s.index] = (spent[s.index] ?? 0) + Math.max(0, now - s.enteredAt)
  return { spent, enteredAt: now }
}

export const usePresentation = create<{
  active: boolean
  doc: TrameDocument | null
  index: number
  /** clics déjà faits sur la page affichée (éléments qui apparaissent pas à pas), de 0 à `stepsOf(page)` */
  step: number
  /** début de la présentation (ms depuis 1970), partagé avec l'écran de l'orateur */
  startedAt: number
  /** millisecondes passées sur chaque page avant la visite en cours (une case par page du document) */
  spent: number[]
  /** instant d'arrivée sur la page affichée (ms depuis 1970) */
  enteredAt: number
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
  spent: [],
  enteredAt: 0,
  start: (fromPage) => {
    const { doc, pageId } = useEditor.getState()
    const current = doc.pages.findIndex((p) => p.id === pageId)
    const now = Date.now()
    set({ active: true, startedAt: now, enteredAt: now, spent: doc.pages.map(() => 0), doc, step: 0, index: Math.max(0, Math.min(doc.pages.length - 1, fromPage ?? current)) })
  },
  go: (to, step = 0) => {
    const doc = get().doc
    if (!doc) return
    const index = Math.max(0, Math.min(doc.pages.length - 1, to))
    set({ ...leaving(get(), index), index, step: step === 'end' ? endOf(doc, index).step : Math.max(0, Math.min(stepsOf(doc.pages[index]), Math.floor(step))) })
  },
  next: () => {
    const { doc, index, step } = get()
    if (doc) {
      const to = nextPosition(doc, { index, step })
      set({ ...leaving(get(), to.index), ...to })
    }
  },
  prev: () => {
    const { doc, index, step } = get()
    if (doc) {
      const to = prevPosition(doc, { index, step })
      set({ ...leaving(get(), to.index), ...to })
    }
  },
  setTransition: (transition) => {
    useEditor.getState().setTransition(transition)
    const doc = get().doc
    if (doc) set({ doc: { ...doc, transition: useEditor.getState().doc.transition } })
  },
  stop: () => {
    const { doc, index, active } = get()
    if (!active) return
    // temps passé sur chaque page, la dernière comprise : récapitulatif proposé si la présentation a duré assez longtemps
    const timed = leaving(get(), -1)
    const total = timed.spent.reduce((sum, ms) => sum + ms, 0)
    if (doc && total >= MIN_RECAP_MS) useTimingRecap.getState().show(doc, timed.spent)
    // on revient dans l'éditeur sur la page où l'on s'est arrêté
    const page = doc?.pages[index]
    if (page && useEditor.getState().doc.pages.some((p) => p.id === page.id)) useEditor.getState().setPage(page.id)
    set({ active: false, doc: null })
  }
}))
