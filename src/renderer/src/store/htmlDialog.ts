import { create } from 'zustand'

/** Ouverture de la fenêtre d'export « Présentation web » (proposée seulement quand le document porte des clips vidéo). */
export const useHtmlDialog = create<{ open: boolean; setOpen: (open: boolean) => void }>((set) => ({ open: false, setOpen: (open) => set({ open }) }))
