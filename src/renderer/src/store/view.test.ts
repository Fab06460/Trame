import { describe, expect, it } from 'vitest'
import { MAX_ZOOM, MIN_ZOOM, useView, zoomAround, type ViewGeometry } from '@/store/view'

const g = (over: Partial<ViewGeometry> = {}): ViewGeometry => ({
  zoom: 1, panX: 0, panY: 0, fit: 0.5, viewW: 1000, viewH: 800, docW: 1080, docH: 1080, ...over
})

/** Position écran d'un point de design pour une géométrie donnée. */
const toScreen = (v: ViewGeometry, d: { x: number; y: number }): { x: number; y: number } => {
  const s = v.fit * v.zoom
  return { x: (v.viewW - v.docW * s) / 2 + v.panX + d.x * s, y: (v.viewH - v.docH * s) / 2 + v.panY + d.y * s }
}

describe('zoomAround', () => {
  it('zoomer au centre sans décalage garde la page centrée', () => {
    const r = zoomAround(g(), 2)
    expect(r.zoom).toBe(2)
    expect(r.panX).toBeCloseTo(0)
    expect(r.panY).toBeCloseTo(0)
  })

  it('garde fixe le point de design situé sous le curseur', () => {
    const before = g({ zoom: 1.3, panX: 40, panY: -25 })
    const anchor = { x: 300, y: 200 }
    // point de design actuellement sous l'ancre
    const s = before.fit * before.zoom
    const design = {
      x: (anchor.x - ((before.viewW - before.docW * s) / 2 + before.panX)) / s,
      y: (anchor.y - ((before.viewH - before.docH * s) / 2 + before.panY)) / s
    }
    const after = { ...before, ...zoomAround(before, 2.4, anchor) }
    const p = toScreen(after, design)
    expect(p.x).toBeCloseTo(anchor.x)
    expect(p.y).toBeCloseTo(anchor.y)
  })

  it('borne le zoom', () => {
    expect(zoomAround(g(), 1000).zoom).toBe(MAX_ZOOM)
    expect(zoomAround(g(), 0.0001).zoom).toBe(MIN_ZOOM)
  })

  it('ne laisse jamais la page entièrement hors de la zone', () => {
    const r = zoomAround(g({ zoom: 4 }), 4, { x: 0, y: 0 })
    const v = { ...g({ zoom: 4 }), ...r, panX: 1e6, panY: -1e6 }
    const clamped = useView.getState()
    clamped.setLayout({ fit: v.fit, viewW: v.viewW, viewH: v.viewH, docW: v.docW, docH: v.docH })
    clamped.fitToScreen()
    clamped.zoomTo(4)
    clamped.setPan(1e6, -1e6)
    const { panX, panY, zoom } = useView.getState()
    const w = v.docW * v.fit * zoom
    const h = v.docH * v.fit * zoom
    const left = (v.viewW - w) / 2 + panX
    const top = (v.viewH - h) / 2 + panY
    expect(left).toBeLessThanOrEqual(v.viewW - 80 + 1e-6) // bord gauche de la page encore dans la zone
    expect(top + h).toBeGreaterThanOrEqual(80 - 1e-6) // bord bas encore visible
  })
})

describe('useView', () => {
  const layout = { fit: 0.5, viewW: 1000, viewH: 800, docW: 1080, docH: 1080 }

  it('fitToScreen remet zoom et décalage à zéro', () => {
    useView.getState().setLayout(layout)
    useView.getState().zoomTo(3)
    useView.getState().setPan(50, 50)
    useView.getState().fitToScreen()
    const s = useView.getState()
    expect([s.zoom, s.panX, s.panY]).toEqual([1, 0, 0])
  })

  it('actualSize affiche la page à 1 px de design = 1 px écran', () => {
    useView.getState().setLayout(layout)
    useView.getState().fitToScreen()
    useView.getState().actualSize()
    const s = useView.getState()
    expect(s.fit * s.zoom).toBeCloseTo(1)
  })

  it('zoomBy est multiplicatif', () => {
    useView.getState().setLayout(layout)
    useView.getState().fitToScreen()
    useView.getState().zoomBy(2)
    useView.getState().zoomBy(1.5)
    expect(useView.getState().zoom).toBeCloseTo(3)
  })
})
