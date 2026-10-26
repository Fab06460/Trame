import { create } from 'zustand'
import { registerExtraFont, subscribeFonts } from '@/fonts'

/**
 * Polices ajoutées en ligne : `version` change à chaque ajout ou retrait (les composants qui listent les polices ou mesurent du texte
 * s'en servent pour se redessiner) ; `dialogOpen` ouvre le catalogue.
 */
export const useFonts = create<{
  version: number
  dialogOpen: boolean
  setDialog: (open: boolean) => void
}>((set) => ({
  version: 0,
  dialogOpen: false,
  setDialog: (dialogOpen) => set({ dialogOpen })
}))

subscribeFonts(() => useFonts.setState((s) => ({ version: s.version + 1 })))

/** Au démarrage : rend disponibles les polices installées sur ce poste (dossier de données). Une erreur n'empêche jamais l'application de démarrer. */
export async function loadInstalledFonts(): Promise<void> {
  try {
    for (const f of await window.trame.installedFonts()) await registerExtraFont(f)
  } catch {
    /* confort seulement */
  }
}

