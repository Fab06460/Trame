import type { Segment } from '@/pdfMath'

/** Trace un contour (segments absolus, repère de la page) pour `clipFunc` de Konva ; rend l'argument de `clip` (règle pair-impair si demandée). */
export function clipPath(ctx: { beginPath: () => void; moveTo: (x: number, y: number) => void; lineTo: (x: number, y: number) => void; bezierCurveTo: (a: number, b: number, c: number, d: number, e: number, f: number) => void; closePath: () => void }, segments: readonly Segment[], evenOdd: boolean): ['evenodd'] | undefined {
  ctx.beginPath()
  for (const s of segments) {
    if (s.op === 'M') ctx.moveTo(s.x, s.y)
    else if (s.op === 'L') ctx.lineTo(s.x, s.y)
    else if (s.op === 'C') ctx.bezierCurveTo(s.x1, s.y1, s.x2, s.y2, s.x, s.y)
    else ctx.closePath()
  }
  return evenOdd ? ['evenodd'] : undefined
}
