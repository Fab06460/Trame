import { create } from 'zustand'

export const MIN_ZOOM = 0.1
export const MAX_ZOOM = 8
/** Part minimale du design (en px écran) qui doit rester visible : on ne peut pas « perdre » la page hors champ. */
const KEEP_VISIBLE = 80

export interface ViewGeometry {
  /** zoom relatif à l'ajustement : 1 = la page tient en entier dans la zone */
  zoom: number
  /** décalage par rapport à la page centrée, en pixels écran */
  panX: number
  panY: number
  /** échelle (px écran par px de design) qui ajuste la page à la zone */
  fit: number
  viewW: number
  viewH: number
  docW: number
  docH: number
}

const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v))

/** Rapproche le décalage de sorte qu'au moins KEEP_VISIBLE px de la page restent dans la zone. */
function clampPan(g: ViewGeometry, panX: number, panY: number): { panX: number; panY: number } {
  const s = g.fit * g.zoom
  const w = g.docW * s
  const h = g.docH * s
  const limit = (pan: number, view: number, size: number): number => {
    const center = (view - size) / 2
    const min = KEEP_VISIBLE - size - center // bord droit de la page ≥ KEEP_VISIBLE
    const max = view - KEEP_VISIBLE - center // bord gauche de la page ≤ view - KEEP_VISIBLE
    return clamp(pan, min, max)
  }
  return { panX: limit(panX, g.viewW, w), panY: limit(panY, g.viewH, h) }
}

/** Nouveau zoom/décalage qui garde fixe le point de design situé sous `anchor` (centre de la zone par défaut). */
export function zoomAround(
  g: ViewGeometry,
  zoom: number,
  anchor?: { x: number; y: number }
): Pick<ViewGeometry, 'zoom' | 'panX' | 'panY'> {
  const z = clamp(zoom, MIN_ZOOM, MAX_ZOOM)
  const a = anchor ?? { x: g.viewW / 2, y: g.viewH / 2 }
  const s = g.fit * g.zoom
  const offX = (g.viewW - g.docW * s) / 2 + g.panX
  const offY = (g.viewH - g.docH * s) / 2 + g.panY
  const dx = (a.x - offX) / s
  const dy = (a.y - offY) / s
  const s2 = g.fit * z
  const next = {
    zoom: z,
    panX: a.x - dx * s2 - (g.viewW - g.docW * s2) / 2,
    panY: a.y - dy * s2 - (g.viewH - g.docH * s2) / 2
  }
  return { zoom: z, ...clampPan({ ...g, zoom: z }, next.panX, next.panY) }
}

interface ViewState extends ViewGeometry {
  /** Appelé par le canvas à chaque changement de taille de zone ou de document. */
  setLayout: (l: Pick<ViewGeometry, 'fit' | 'viewW' | 'viewH' | 'docW' | 'docH'>) => void
  zoomTo: (zoom: number, anchor?: { x: number; y: number }) => void
  zoomBy: (factor: number, anchor?: { x: number; y: number }) => void
  setPan: (panX: number, panY: number) => void
  /** Ajuste la page à la zone. */
  fitToScreen: () => void
  /** Affiche la page à 100 % (1 px de design = 1 px écran). */
  actualSize: () => void
}

export const useView = create<ViewState>((set, get) => ({
  zoom: 1,
  panX: 0,
  panY: 0,
  fit: 1,
  viewW: 800,
  viewH: 600,
  docW: 1080,
  docH: 1080,

  setLayout: (l) => set(l),
  zoomTo: (zoom, anchor) => set(zoomAround(get(), zoom, anchor)),
  zoomBy: (factor, anchor) => set(zoomAround(get(), get().zoom * factor, anchor)),
  setPan: (panX, panY) => set(clampPan(get(), panX, panY)),
  fitToScreen: () => set({ zoom: 1, panX: 0, panY: 0 }),
  actualSize: () => set(zoomAround({ ...get(), panX: 0, panY: 0 }, 1 / get().fit))
}))
