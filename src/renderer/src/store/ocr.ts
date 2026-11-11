import { create } from 'zustand'

/** Fenêtre « Texte de l'image » : l'image dont on lit le texte (identifiant de l'élément), ou null quand elle est fermée. */
export const useOcr = create<{ elementId: string | null; show: (elementId: string) => void; close: () => void }>((set) => ({
  elementId: null,
  show: (elementId) => set({ elementId }),
  close: () => set({ elementId: null })
}))
