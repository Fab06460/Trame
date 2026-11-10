import { create } from 'zustand'
import type { Outline } from '@/outlineImport/outline'

/** Document texte lu, en attente des choix de l'utilisateur (fenêtre « Importer un document »). */
export interface PendingDocument {
  outline: Outline
  /** nom du fichier, sans l'extension */
  name: string
}

export const useOutlineImport = create<{ pending: PendingDocument | null; open: (p: PendingDocument) => void; close: () => void }>((set) => ({
  pending: null,
  open: (pending) => set({ pending }),
  close: () => set({ pending: null })
}))
