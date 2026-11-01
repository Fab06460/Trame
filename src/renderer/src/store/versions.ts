import { create } from 'zustand'

/** Ouverture de la fenêtre « Historique des versions ». */
export const useVersions = create<{ open: boolean; setOpen: (open: boolean) => void }>((set) => ({ open: false, setOpen: (open) => set({ open }) }))
