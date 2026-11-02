import { create } from 'zustand'

/** Ouverture de la fenêtre « Nuage de mots ». */
export const useWordCloud = create<{ open: boolean; setOpen: (open: boolean) => void }>((set) => ({ open: false, setOpen: (open) => set({ open }) }))
