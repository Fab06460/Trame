import { create } from 'zustand'

/** Ouverture de la fenêtre « Notes de l'orateur et polycopié » (export PDF). */
export const useHandoutDialog = create<{ open: boolean; setOpen: (open: boolean) => void }>((set) => ({ open: false, setOpen: (open) => set({ open }) }))
