import { create } from 'zustand'
import type { TrameDocument } from '@/types'

/** L'autre document en cours de comparaison (fichier choisi ou version de l'historique) ; null = fenêtre fermée. */
export interface CompareTarget {
  doc: TrameDocument
  /** nom affiché : le fichier, ou la version de l'historique */
  label: string
}

export const useCompare = create<{ other: CompareTarget | null; start: (other: CompareTarget) => void; close: () => void }>((set) => ({
  other: null,
  start: (other) => set({ other }),
  close: () => set({ other: null })
}))
