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
  /** panneau actuellement ouvert en recouvrement (fenêtre étroite, ou panneau masqué) */
  overlay: Side | null
  /** recouvrement ouvert par le survol du bord : il se referme quand la souris s'éloigne (sinon il reste jusqu'à Échap / clic ailleurs) */
  peek: boolean
  windowWidth: number
  windowHeight: number
  setWindow: (width: number, height: number) => void
  setSize: (kind: Side | 'strip', value: number) => void
  /** Ancré : masque / affiche le panneau (préférence enregistrée). Compact : ouvre / ferme son recouvrement. */
  toggle: (side: Side) => void
  toggleStrip: () => void
  /** Survol du bord de la fenêtre : montre un panneau non ancré, le temps du survol. */
  peekOpen: (side: Side) => void
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
  peek: false,
  windowWidth: typeof window === 'undefined' ? 1400 : window.innerWidth,
  windowHeight: typeof window === 'undefined' ? 900 : window.innerHeight,

  setWindow: (windowWidth, windowHeight) => {
    const s = get()
    const compact = isCompact(windowWidth, s)
    // un recouvrement n'a de sens que pour un panneau qui n'est pas ancré
    const stillFloating = s.overlay !== null && (compact || !(s.overlay === 'left' ? s.leftOpen : s.rightOpen))
    set({ windowWidth, windowHeight, compact, overlay: stillFloating ? s.overlay : null, peek: stillFloating ? s.peek : false })
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
      // un clic sur le bouton « épingle » un recouvrement ouvert par le survol
      set({ overlay: s.overlay === side && !s.peek ? null : side, peek: false })
      return
    }
    const patch = side === 'left' ? { leftOpen: !s.leftOpen } : { rightOpen: !s.rightOpen }
    const merged = { ...prefsOf(s), ...patch }
    set({ ...patch, compact: isCompact(s.windowWidth, merged), overlay: null, peek: false })
    save(merged)
  },

  toggleStrip: () => {
    const s = get()
    const merged = { ...prefsOf(s), stripOpen: !s.stripOpen }
    set({ stripOpen: merged.stripOpen })
    save(merged)
  },

  peekOpen: (side) => {
    const s = get()
    const docked = !s.compact && (side === 'left' ? s.leftOpen : s.rightOpen)
    // un panneau ancré n'a pas à être montré ; un recouvrement ouvert au bouton n'est pas remplacé par un survol
    if (docked || (s.overlay !== null && !s.peek)) return
    set({ overlay: side, peek: true })
  },

  closeOverlay: () => set({ overlay: null, peek: false }),

  reset: () => {
    const d = sanitizeLayout(null)
    set({ ...d, compact: isCompact(get().windowWidth, d), overlay: null, peek: false })
    save(d)
  }
}))
