import type { TramePage } from '@/types'


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
        {page.elements.map((e) => {
          const box: React.CSSProperties = {
            position: 'absolute',
            left: e.x,
            top: e.y,
            width: e.width,
            height: e.height,
            opacity: e.opacity,
            transform: `rotate(${e.rotation}deg)`,
            transformOrigin: '0 0'
          }
          if (e.type === 'path')
            return (
              <svg key={e.id} viewBox="0 0 100 100" preserveAspectRatio="none" style={box}>
                <path d={e.path} fill={e.fill} />
              </svg>
            )
          if (e.type === 'image') return <img key={e.id} src={e.src} style={{ ...box, objectFit: 'fill' }} draggable={false} />
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
                  lineHeight: 1
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
                background: e.fill,
                borderRadius: e.type === 'ellipse' ? '50%' : e.cornerRadius
              }}
            />
          )
        })}
      </div>
    </div>
  )
}
