import { create } from 'zustand'
import type { UserTemplateMeta } from '../../../preload'

/** Modèles de l'utilisateur et modèles intégrés masqués, partagés par les deux sections de l'onglet « Modèles ». */
export const useTemplates = create<{
  user: UserTemplateMeta[]
  hidden: string[]
  refresh: () => Promise<void>
}>((set) => ({
  user: [],
  hidden: [],
  refresh: async () => {
    try {
      const [user, hidden] = await Promise.all([window.trame.listUserTemplates(), window.trame.listHiddenTemplates()])
      set({ user, hidden })
    } catch {
      /* la liste reste celle d'avant : mieux vaut un affichage périmé qu'une erreur */
    }
  }
}))
