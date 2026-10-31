import { create } from 'zustand'

/** Ouverture de la fenêtre « Livret et impression groupée ». */
export const usePrintDialog = create<{ open: boolean; setOpen: (open: boolean) => void }>((set) => ({ open: false, setOpen: (open) => set({ open }) }))
