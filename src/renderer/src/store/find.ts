import { create } from 'zustand'

/** Panneau « Rechercher et remplacer » : réglages et occurrence courante. Les résultats se calculent à partir du document (rien n'est mémorisé ici). */
export const useFind = create<{
  open: boolean
  query: string
  replacement: string
  caseSensitive: boolean
  wholeWord: boolean
  ignoreAccents: boolean
  /** `page` : seulement la page courante */
  scope: 'all' | 'page'
  index: number
  /** incrémenté à chaque ouverture / ⌘F : le champ de recherche reprend le focus */
  focusTick: number
  set: (p: Partial<{ query: string; replacement: string; caseSensitive: boolean; wholeWord: boolean; ignoreAccents: boolean; scope: 'all' | 'page'; index: number }>) => void
  show: () => void
  hide: () => void
}>((set) => ({
  open: false,
  query: '',
  replacement: '',
  caseSensitive: false,
  wholeWord: false,
  ignoreAccents: false,
  scope: 'all',
  index: 0,
  focusTick: 0,
  set: (p) => set(p),
  show: () => set((s) => ({ open: true, focusTick: s.focusTick + 1 })),
  hide: () => set({ open: false })
}))
