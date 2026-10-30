import type { SidebarTab } from '@/store/sidebar'

/** Icônes de la colonne d'onglets : même grille 24 × 24, même trait (1,7), couleur du texte courant. Dessinées ici, sans bibliothèque. */
const PATHS: Record<SidebarTab, React.JSX.Element> = {
  recents: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  templates: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <path d="M3.5 9.5h17M10 9.5v10" />
    </>
  ),
  elements: (
    <>
      <circle cx="8.5" cy="8.5" r="4.5" />
      <rect x="12" y="12" width="8.5" height="8.5" rx="1.5" />
    </>
  ),
  photos: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <circle cx="9" cy="10" r="1.7" />
      <path d="M4 18.5l5.5-5 3.5 3.2 2.5-2.2 4.5 4" />
    </>
  ),
  ai: (
    <>
      <path d="M11 3.5l1.9 5.6 5.6 1.9-5.6 1.9L11 18.5l-1.9-5.6L3.5 11l5.6-1.9z" />
      <path d="M18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" />
    </>
  ),
  layers: (
    <>
      <path d="M12 3.5l9 5-9 5-9-5z" />
      <path d="M3 12.5l9 5 9-5M3 16.5l9 5 9-5" />
    </>
  ),
  brand: <path d="M12 3.5c3.2 4 6 6.8 6 10.5a6 6 0 0 1-12 0c0-3.7 2.8-6.5 6-10.5z" />
}

export function SideIcon({ tab }: { tab: SidebarTab }): React.JSX.Element {
  return (
    <svg className="side-icon" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">
      {PATHS[tab]}
    </svg>
  )
}
