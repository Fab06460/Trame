import { create } from 'zustand'

/** Mots que l'on a choisi d'ignorer le temps de la session (en minuscules) : ils ne sont pas enregistrés, contrairement au dictionnaire personnel. */
export const useSpell = create<{ ignored: string[]; ignore: (word: string) => void; resetIgnored: () => void }>((set) => ({
  ignored: [],
  ignore: (word) => set((s) => (s.ignored.includes(word.toLowerCase()) ? s : { ignored: [...s.ignored, word.toLowerCase()] })),
  resetIgnored: () => set({ ignored: [] })
}))
