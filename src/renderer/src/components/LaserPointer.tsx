import { useEffect, useRef } from 'react'
import { pushTrail, trailAlpha, type TrailPoint } from '@/laserTrail'

const RADIUS = 9

/**
 * Pointeur laser : un point rouge lumineux qui suit la souris, avec une courte traînée. Dessiné sur un canevas qui ne reçoit aucun
 * événement (les clics et la molette continuent de naviguer). Le point reste affiché même quand la souris ne bouge plus.
 * `hidden` le retire pendant que la souris est sur la barre de commandes.
 */
export function LaserPointer({ hidden }: { hidden: boolean }): React.JSX.Element {
  const canvas = useRef<HTMLCanvasElement>(null)
  const hiddenRef = useRef(hidden)
  hiddenRef.current = hidden

  useEffect(() => {
    const el = canvas.current
    const ctx = el?.getContext('2d')
    if (!el || !ctx) return
    let trail: TrailPoint[] = []
    let pos: { x: number; y: number } | null = null
    let raf = 0
    let w = 0
    let h = 0
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const fit = (): void => {
      w = window.innerWidth
      h = window.innerHeight
      el.width = Math.round(w * dpr)
      el.height = Math.round(h * dpr)
    }
    const onMove = (e: MouseEvent): void => {
      pos = { x: e.clientX, y: e.clientY }
      trail = pushTrail(trail, { ...pos, t: performance.now() })
    }
    const draw = (): void => {
      raf = requestAnimationFrame(draw)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      if (!pos || hiddenRef.current) return
      const now = performance.now()
      ctx.lineCap = 'round'
      for (let i = 1; i < trail.length; i++) {
        const a = trailAlpha(trail[i], now)
        if (a <= 0) continue
        ctx.strokeStyle = `rgba(255, 40, 40, ${(a * 0.5).toFixed(3)})`
        ctx.lineWidth = RADIUS * 2 * a
        ctx.beginPath()
        ctx.moveTo(trail[i - 1].x, trail[i - 1].y)
        ctx.lineTo(trail[i].x, trail[i].y)
        ctx.stroke()
      }
      const glow = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, RADIUS * 2.2)
      glow.addColorStop(0, 'rgba(255, 70, 70, 0.95)')
      glow.addColorStop(0.45, 'rgba(255, 30, 30, 0.7)')
      glow.addColorStop(1, 'rgba(255, 0, 0, 0)')
      ctx.fillStyle = glow
      ctx.beginPath()
      ctx.arc(pos.x, pos.y, RADIUS * 2.2, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#ff2a2a'
      ctx.beginPath()
      ctx.arc(pos.x, pos.y, RADIUS * 0.6, 0, Math.PI * 2)
      ctx.fill()
    }
    fit()
    window.addEventListener('resize', fit)
    window.addEventListener('mousemove', onMove)
    raf = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', fit)
      window.removeEventListener('mousemove', onMove)
    }
  }, [])

  return <canvas ref={canvas} className="laser-pointer" data-pres="laser-canvas" aria-hidden style={{ width: '100%', height: '100%' }} />
}
