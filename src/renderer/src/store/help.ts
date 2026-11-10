import { create } from 'zustand'

/** Fenêtre « Aide » : ouverte ou non, et la rubrique à montrer (la première si absente). */
export const useHelp = create<{ open: boolean; topic: string | null; show: (topic?: string) => void; setOpen: (open: boolean) => void }>((set) => ({
  open: false,
  topic: null,
  show: (topic) => set({ open: true, topic: topic ?? null }),
  setOpen: (open) => set({ open })
}))
