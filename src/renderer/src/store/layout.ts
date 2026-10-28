import { create } from 'zustand'
import { clampSize, isCompact, sanitizeLayout, type Side } from '@/layout'

const KEY = 'trame.layout'

type Prefs = ReturnType<typeof sanitizeLayout>

function load(): Prefs {
  try {
    return sanitizeLayout(JSON.parse(localStorage.getItem(KEY) ?? 'null'))
  } catch {
    return sanitizeLayout(null)
  }
}

const save = (p: Prefs): void => {
  try {
    localStorage.setItem(KEY, JSON.stringify(p))
  } catch {
    /* stockage indisponible : la disposition reste valable pour la session */
  }
}

interface LayoutState extends Prefs {
  /** fenêtre trop étroite pour ancrer les panneaux ouverts : ils s'ouvrent en recouvrement, à la demande */
  compact: boolean
  /** panneau actuellement ouvert en recouvrement (mode compact seulement) */
  overlay: Side | null
  windowWidth: number
  windowHeight: number
  setWindow: (width: number, height: number) => void
  setSize: (kind: Side | 'strip', value: number) => void
  /** Ancré : masque / affiche le panneau (préférence enregistrée). Compact : ouvre / ferme son recouvrement. */
  toggle: (side: Side) => void
  toggleStrip: () => void
  closeOverlay: () => void
  reset: () => void
}

const prefsOf = (s: Prefs): Prefs => ({
  leftOpen: s.leftOpen,
  rightOpen: s.rightOpen,
  stripOpen: s.stripOpen,
  leftWidth: s.leftWidth,
  rightWidth: s.rightWidth,
  stripHeight: s.stripHeight
})

export const useLayout = create<LayoutState>((set, get) => ({
  ...load(),
  compact: false,
  overlay: null,
  windowWidth: typeof window === 'undefined' ? 1400 : window.innerWidth,
  windowHeight: typeof window === 'undefined' ? 900 : window.innerHeight,

  setWindow: (windowWidth, windowHeight) => {
    const s = get()
    const compact = isCompact(windowWidth, s)
    // fenêtre agrandie : retour au mode ancré, donc plus de recouvrement
    set({ windowWidth, windowHeight, compact, overlay: compact ? s.overlay : null })
  },

  setSize: (kind, value) => {
    const s = get()
    const next = clampSize(kind, value)
    const patch = kind === 'left' ? { leftWidth: next } : kind === 'right' ? { rightWidth: next } : { stripHeight: next }
    const merged = { ...prefsOf(s), ...patch }
    set({ ...patch, compact: isCompact(s.windowWidth, merged) })
    save(merged)
  },

  toggle: (side) => {
    const s = get()
    if (s.compact) {
      set({ overlay: s.overlay === side ? null : side })
      return
    }
    const patch = side === 'left' ? { leftOpen: !s.leftOpen } : { rightOpen: !s.rightOpen }
    const merged = { ...prefsOf(s), ...patch }
    set({ ...patch, compact: isCompact(s.windowWidth, merged), overlay: null })
    save(merged)
  },

  toggleStrip: () => {
    const s = get()
    const merged = { ...prefsOf(s), stripOpen: !s.stripOpen }
    set({ stripOpen: merged.stripOpen })
    save(merged)
  },

  closeOverlay: () => set({ overlay: null }),

  reset: () => {
    const d = sanitizeLayout(null)
    set({ ...d, compact: isCompact(get().windowWidth, d), overlay: null })
    save(d)
  }
}))
