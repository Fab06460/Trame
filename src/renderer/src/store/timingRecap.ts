import { create } from 'zustand'
import type { TrameDocument } from '@/types'

const KEY = 'trame.timingRecap'

/** Le récapitulatif est-il masqué par l'utilisateur ? (préférence de cet ordinateur seulement) */
export function recapHidden(): boolean {
  try {
    return localStorage.getItem(KEY) === 'off'
  } catch {
    return false
  }
}

export function setRecapHidden(hidden: boolean): void {
  try {
    if (hidden) localStorage.setItem(KEY, 'off')
    else localStorage.removeItem(KEY)
  } catch {
    /* préférence seulement */
  }
}

/** Récapitulatif des temps passés sur chaque page, proposé à la fin d'une présentation. */
export const useTimingRecap = create<{
  doc: TrameDocument | null
  spent: number[]
  show: (doc: TrameDocument, spent: number[]) => void
  close: () => void
}>((set) => ({
  doc: null,
  spent: [],
  show: (doc, spent) => {
    if (!recapHidden()) set({ doc, spent })
  },
  close: () => set({ doc: null, spent: [] })
}))
