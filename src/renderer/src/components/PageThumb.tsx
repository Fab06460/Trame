import { cssGradient, linearGradientLine, radialGradientCircle } from '@/gradient'
import { cssShadow } from '@/shadowStyle'
import { dashPattern, hasStroke } from '@/strokeStyle'
import { useEditedImage } from '@/imageRender'
import { hasImageEdits } from '@/imageStyle'
import { useEffect, useRef } from 'react'
import type { TrameElement, TramePage } from '@/types'

/** Image d'une miniature : l'originale telle quelle, ou (si retouchée) le rendu retouché réduit dans un petit canvas. */
function ThumbImage({ el, style }: { el: TrameElement; style: React.CSSProperties }): React.JSX.Element {
  const edited = hasImageEdits(el)
  const drawable = useEditedImage(edited ? el : { ...el, src: undefined })
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current
    if (!c || !drawable) return
    const k = Math.min(1, 240 / Math.max(drawable.width, drawable.height))
    c.width = Math.max(1, Math.round(drawable.width * k))
    c.height = Math.max(1, Math.round(drawable.height * k))
    c.getContext('2d')!.drawImage(drawable, 0, 0, c.width, c.height)
  }, [drawable])
  if (!edited) return <img src={el.src} style={{ ...style, objectFit: 'fill' }} draggable={false} />
  return <canvas ref={ref} style={style} />
}

/** Aperçu statique d'une page, en DOM : bien moins coûteux qu'un Stage Konva par miniature. */
export function PageThumb({
  page,
  width,
  height,
  maxW = 120,
  maxH = 110
}: {
  page: TramePage
  width: number
  height: number
  maxW?: number
  maxH?: number
}): React.JSX.Element {
  const k = Math.min(maxW / width, maxH / height)
  return (
    <div className="thumb" style={{ width: width * k, height: height * k, background: page.background }}>
      <div style={{ width, height, transform: `scale(${k})`, transformOrigin: '0 0', position: 'relative' }}>
        {page.elements.filter((e) => !e.hidden).map((e) => {
          const box: React.CSSProperties = {
            position: 'absolute',
            left: e.x,
            top: e.y,
            width: e.width,
            height: e.height,
            opacity: e.opacity,
            transform: `rotate(${e.rotation}deg)`,
            transformOrigin: '0 0',
            filter: cssShadow(e)
          }
          // contour centré sur le bord : `outline` décalé de la moitié de son épaisseur vers l'intérieur
          const w = e.strokeWidth ?? 0
          const outline: React.CSSProperties = hasStroke(e)
            ? { outline: `${w}px ${e.strokeDashed ? 'dashed' : 'solid'} ${e.stroke}`, outlineOffset: -w / 2 }
            : {}
          if (e.type === 'path')
            return (
              <svg key={e.id} viewBox="0 0 100 100" preserveAspectRatio="none" style={box}>
                {e.gradient && (
                  <defs>
                    {/* coordonnées en fraction de la boîte : l'angle suit les proportions réelles de l'élément, comme CSS */}
                    {e.gradient.type === 'radial' ? (
                      (() => {
                        // cercle de rayon R dans la boîte réelle = ellipse (R·100/L, R·100/H) dans le viewBox 100 × 100 étiré
                        const R = radialGradientCircle(e.width, e.height).r
                        return (
                          <radialGradient id={`g-${e.id}`} gradientUnits="userSpaceOnUse" cx={50} cy={50} r={1} gradientTransform={`translate(50 50) scale(${(R * 100) / e.width} ${(R * 100) / e.height}) translate(-50 -50)`}>
                            <stop offset="0" stopColor={e.gradient.from} />
                            <stop offset="1" stopColor={e.gradient.to} />
                          </radialGradient>
                        )
                      })()
                    ) : (
                      (() => {
                        const l = linearGradientLine(e.width, e.height, e.gradient.angle)
                        return (
                          <linearGradient id={`g-${e.id}`} x1={l.x0 / e.width} y1={l.y0 / e.height} x2={l.x1 / e.width} y2={l.y1 / e.height}>
                            <stop offset="0" stopColor={e.gradient.from} />
                            <stop offset="1" stopColor={e.gradient.to} />
                          </linearGradient>
                        )
                      })()
                    )}
                  </defs>
                )}
                <path
                  d={e.path}
                  fill={e.gradient ? `url(#g-${e.id})` : e.fill}
                  {...(hasStroke(e)
                    ? { stroke: e.stroke, strokeWidth: w, vectorEffect: 'non-scaling-stroke', strokeDasharray: e.strokeDashed ? dashPattern(w).join(' ') : undefined }
                    : {})}
                />
              </svg>
            )
          if (e.type === 'image') return <ThumbImage key={e.id} el={e} style={{ ...box, ...outline }} />
          if (e.type === 'text')
            return (
              <div
                key={e.id}
                style={{
                  ...box,
                  height: 'auto',
                  color: e.fill,
                  fontSize: e.fontSize,
                  fontFamily: e.fontFamily,
                  fontWeight: e.fontStyle?.includes('bold') ? 700 : 400,
                  fontStyle: e.fontStyle?.includes('italic') ? 'italic' : 'normal',
                  textAlign: e.align,
                  whiteSpace: 'pre-wrap',
                  lineHeight: e.lineHeight ?? 1,
                  letterSpacing: e.letterSpacing ?? 0,
                  textDecoration: [e.underline ? 'underline' : '', e.strike ? 'line-through' : ''].filter(Boolean).join(' ') || 'none',
                  textTransform: e.uppercase ? 'uppercase' : 'none',
                  ...(hasStroke(e) ? { WebkitTextStroke: `${w}px ${e.stroke}` } : {})
                }}
              >
                {e.text}
              </div>
            )
          return (
            <div
              key={e.id}
              style={{
                ...box,
                ...outline,
                background: e.gradient ? cssGradient(e.gradient) : e.fill,
                borderRadius: e.type === 'ellipse' ? '50%' : e.cornerRadius
              }}
            />
          )
        })}
      </div>
    </div>
  )
}
