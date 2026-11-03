import { create } from 'zustand'

/** Fenêtre « Style d'après une image » : ouverte ou non, et l'image de départ (data URL ; null = l'utilisateur la choisira). */
export const useStyleMatch = create<{ open: boolean; source: string | null; show: (source?: string | null) => void; close: () => void }>((set) => ({
  open: false,
  source: null,
  show: (source = null) => set({ open: true, source }),
  close: () => set({ open: false })
}))
