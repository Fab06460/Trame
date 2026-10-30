import { create } from 'zustand'

/** Ouverture de la fenêtre « Publipostage ». */
export const useMailMerge = create<{ open: boolean; setOpen: (open: boolean) => void }>((set) => ({ open: false, setOpen: (open) => set({ open }) }))
