import { create } from 'zustand'

/** Fenêtre « Capture d'écran » : ouverte (avec le mode proposé d'abord) ou fermée. */
export const useCapture = create<{ mode: 'image' | 'video' | null; show: (mode: 'image' | 'video') => void; close: () => void }>((set) => ({
  mode: null,
  show: (mode) => set({ mode }),
  close: () => set({ mode: null })
}))
