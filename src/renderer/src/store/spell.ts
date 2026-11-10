import { create } from 'zustand'
import type { Issue } from '@/spellScan'

interface SpellState {
  /** Mots que l'on a choisi d'ignorer le temps de la session (en minuscules) : ils ne sont pas enregistrés, contrairement au dictionnaire personnel. */
  ignored: string[]
  ignore: (word: string) => void
  resetIgnored: () => void
  /** Correcteur activé (null tant qu'on ne le sait pas) */
  enabled: boolean | null
  /** Change quand le dictionnaire, la langue ou l'activation changent : le document doit être relu */
  version: number
  /** Les fautes possibles de tout le document (null = correcteur éteint ou pas encore relu) */
  issues: Issue[] | null
  setEnabled: (enabled: boolean) => void
  bump: () => void
  setIssues: (issues: Issue[] | null) => void
}

export const useSpell = create<SpellState>((set) => ({
  ignored: [],
  ignore: (word) => set((s) => (s.ignored.includes(word.toLowerCase()) ? s : { ignored: [...s.ignored, word.toLowerCase()] })),
  resetIgnored: () => set({ ignored: [] }),
  enabled: null,
  version: 0,
  issues: null,
  setEnabled: (enabled) => set((s) => ({ enabled, version: s.version + 1 })),
  bump: () => set((s) => ({ version: s.version + 1 })),
  setIssues: (issues) => set({ issues })
}))
