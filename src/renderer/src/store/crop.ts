import { create } from 'zustand'

/** Image en cours de recadrage sur le canvas (poignées sur ses bords) ; null = aucun. État d'affichage : ni sauvegardé, ni dans l'historique. */
interface CropMode {
  id: string | null
  set: (id: string | null) => void
}

export const useCropMode = create<CropMode>((set) => ({ id: null, set: (id) => set({ id }) }))
