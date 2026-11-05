import { create } from 'zustand'

/** Ouverture de la fenêtre « Signature ». */
export const useSignature = create<{ open: boolean; setOpen: (open: boolean) => void }>((set) => ({ open: false, setOpen: (open) => set({ open }) }))
