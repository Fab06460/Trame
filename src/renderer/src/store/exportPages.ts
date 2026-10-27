import { create } from 'zustand'

/** Ouverture de la fenêtre « Exporter les pages ». */
export const useExportPages = create<{ open: boolean; setOpen: (open: boolean) => void }>((set) => ({ open: false, setOpen: (open) => set({ open }) }))
