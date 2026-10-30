import { useEffect, useRef } from 'react'
import { extend, HIGHLIGHT_ALPHA, INK_WIDTH, pageRect, toPage, type InkTool, type Stroke } from '@/annotation'

interface Props {
  strokes: readonly Stroke[]
  /** mode dessin : le calque reçoit la souris (sinon il n'affiche que les traits et laisse passer les clics) */
  drawing: boolean
  tool: InkTool
  color: string
  docWidth: number
  docHeight: number
  onStroke: (s: Stroke) => void
}

/** Trait lissé par les milieux des segments, d'un seul tenant (le surligneur translucide ne s'assombrit pas là où il se recoupe). */
function paint(ctx: CanvasRenderingContext2D, s: Stroke, rect: { x: number; y: number; w: number; h: number }): void {
  const pts = s.points.map(([x, y]) => [rect.x + x * rect.w, rect.y + y * rect.h] as const)
  if (!pts.length) return
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = s.color
  ctx.fillStyle = s.color
  ctx.globalAlpha = s.tool === 'highlighter' ? HIGHLIGHT_ALPHA : 1
  const width = Math.max(1.5, INK_WIDTH[s.tool] * rect.w)
  ctx.lineWidth = width
  if (pts.length === 1) {
    ctx.beginPath()
    ctx.arc(pts[0][0], pts[0][1], width / 2, 0, Math.PI * 2)
    ctx.fill()
  } else {
    ctx.beginPath()
    ctx.moveTo(pts[0][0], pts[0][1])
    for (let i = 1; i < pts.length - 1; i++) ctx.quadraticCurveTo(pts[i][0], pts[i][1], (pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2)
    ctx.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1])
    ctx.stroke()
  }
  ctx.restore()
}

/** Annotations à l'écran : traits tracés à la souris par-dessus la page projetée. Jamais enregistrés dans le document. */
export function InkLayer({ strokes, drawing, tool, color, docWidth, docHeight, onStroke }: Props): React.JSX.Element {
  const canvas = useRef<HTMLCanvasElement>(null)
  const live = useRef<Stroke | null>(null)
  const latest = useRef({ strokes, tool, color, docWidth, docHeight, onStroke })
  latest.current = { strokes, tool, color, docWidth, docHeight, onStroke }

  const redraw = (): void => {
    const el = canvas.current
    const ctx = el?.getContext('2d')
    if (!el || !ctx) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const w = window.innerWidth
    const h = window.innerHeight
    if (el.width !== Math.round(w * dpr) || el.height !== Math.round(h * dpr)) {
      el.width = Math.round(w * dpr)
      el.height = Math.round(h * dpr)
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)
    const rect = pageRect(w, h, latest.current.docWidth, latest.current.docHeight)
    for (const s of latest.current.strokes) paint(ctx, s, rect)
    if (live.current) paint(ctx, live.current, rect)
  }

  useEffect(() => {
    redraw()
  }, [strokes, docWidth, docHeight])
  useEffect(() => {
    window.addEventListener('resize', redraw)
    return () => window.removeEventListener('resize', redraw)
  }, [])

  const point = (e: React.PointerEvent): ReturnType<typeof toPage> => toPage(pageRect(window.innerWidth, window.innerHeight, docWidth, docHeight), e.clientX, e.clientY)
  const aspect = docWidth / docHeight

  return (
    <canvas
      ref={canvas}
      className={`ink-layer${drawing ? ' drawing' : ''}`}
      data-pres="ink"
      data-pres-strokes={strokes.length}
      aria-hidden
      style={{ width: '100%', height: '100%' }}
      onPointerDown={(e) => {
        if (!drawing || e.button !== 0) return
        e.stopPropagation()
        e.currentTarget.setPointerCapture(e.pointerId)
        live.current = { tool, color, points: [point(e)] }
        redraw()
      }}
      onPointerMove={(e) => {
        if (!live.current) return
        live.current = extend(live.current, point(e), aspect)
        redraw()
      }}
      onPointerUp={(e) => {
        const s = live.current
        live.current = null
        if (!s) return
        e.stopPropagation()
        latest.current.onStroke(s)
      }}
      onPointerCancel={() => {
        live.current = null
        redraw()
      }}
      onClick={(e) => {
        // en mode dessin, un clic ne fait pas avancer la présentation
        if (drawing) e.stopPropagation()
      }}
    />
  )
}
