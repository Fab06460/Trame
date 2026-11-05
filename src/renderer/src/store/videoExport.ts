import { create } from 'zustand'

/** Ouverture de la fenêtre « Exporter en vidéo ». */
export const useVideoExport = create<{ open: boolean; setOpen: (open: boolean) => void }>((set) => ({ open: false, setOpen: (open) => set({ open }) }))
