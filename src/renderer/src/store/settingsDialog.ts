import { create } from 'zustand'

/** Ouverture de la fenêtre « Réglages » (réglages généraux de l'application). */
export const useSettingsDialog = create<{ open: boolean; setOpen: (open: boolean) => void }>((set) => ({ open: false, setOpen: (open) => set({ open }) }))
