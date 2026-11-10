import { create } from 'zustand'

/** Visite guidée : ouverte ou non, et l'étape courante. */
export const useTour = create<{ open: boolean; step: number; start: () => void; close: () => void; go: (step: number) => void }>((set) => ({
  open: false,
  step: 0,
  start: () => set({ open: true, step: 0 }),
  close: () => set({ open: false }),
  go: (step) => set({ step })
}))

const KEY = 'trame.tour'

/** La visite a-t-elle déjà été proposée sur cet ordinateur ? (Sans stockage utilisable, on ne la repropose pas à chaque lancement.) */
export function tourSeen(): boolean {
  try {
    return localStorage.getItem(KEY) !== null
  } catch {
    return true
  }
}

export function markTourSeen(): void {
  try {
    localStorage.setItem(KEY, '1')
  } catch {
    /* sans stockage : tant pis */
  }
}
