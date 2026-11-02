import { create } from 'zustand'

/** Ouverture de la fenêtre « Outils PDF ». */
export const usePdfTools = create<{ open: boolean; setOpen: (open: boolean) => void }>((set) => ({ open: false, setOpen: (open) => set({ open }) }))
