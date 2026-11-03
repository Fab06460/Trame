import { create } from 'zustand'
import { useLayout } from '@/store/layout'

export type SidebarTab = 'recents' | 'templates' | 'elements' | 'icons' | 'layers' | 'brand' | 'photos' | 'ai' | 'a11y' | 'review'

/** Onglet de la barre latérale gauche (état partagé : un autre panneau peut demander d'ouvrir un onglet). */
export const useSidebar = create<{ tab: SidebarTab; setTab: (tab: SidebarTab) => void }>((set) => ({
  tab: 'templates',
  setTab: (tab) => set({ tab })
}))

/** Ouvre un onglet de la barre latérale, en affichant la barre si elle est masquée (ancrée) ou fermée (fenêtre étroite). */
export function openSidebarTab(tab: SidebarTab): void {
  useSidebar.getState().setTab(tab)
  const l = useLayout.getState()
  if (l.compact) {
    if (l.overlay !== 'left') l.toggle('left')
  } else if (!l.leftOpen) l.toggle('left')
}
