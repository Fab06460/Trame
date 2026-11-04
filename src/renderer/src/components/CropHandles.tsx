import { useRef } from 'react'
import { Group, Rect } from 'react-konva'
import type Konva from 'konva'
import { cropByEdges } from '@/imageStyle'
import { useEditor } from '@/store/editor'
import type { TrameElement } from '@/types'

const SIZE = 12

/** Poignée : le côté (−1, 0 ou 1) qu'elle déplace sur chaque axe (−1 = gauche / haut, 1 = droite / bas, 0 = aucun). */
const HANDLES: Array<{ name: string; fx: number; fy: number; sx: -1 | 0 | 1; sy: -1 | 0 | 1; cursor: string }> = [
  { name: 'nw', fx: 0, fy: 0, sx: -1, sy: -1, cursor: 'nwse-resize' },
  { name: 'n', fx: 0.5, fy: 0, sx: 0, sy: -1, cursor: 'ns-resize' },
  { name: 'ne', fx: 1, fy: 0, sx: 1, sy: -1, cursor: 'nesw-resize' },
  { name: 'e', fx: 1, fy: 0.5, sx: 1, sy: 0, cursor: 'ew-resize' },
  { name: 'se', fx: 1, fy: 1, sx: 1, sy: 1, cursor: 'nwse-resize' },
  { name: 's', fx: 0.5, fy: 1, sx: 0, sy: 1, cursor: 'ns-resize' },
  { name: 'sw', fx: 0, fy: 1, sx: -1, sy: 1, cursor: 'nesw-resize' },
  { name: 'w', fx: 0, fy: 0.5, sx: -1, sy: 0, cursor: 'ew-resize' }
]

/**
 * Poignées de recadrage d'une image, posées sur sa boîte (même repère et même rotation qu'elle). Tirer un bord vers l'intérieur masque
 * de l'image, vers l'extérieur en révèle (jusqu'aux bords de l'image d'origine) : le contenu reste exactement où il est, seule la boîte change.
 * Toute la séance est un seul pas d'historique ; chaque mouvement repart de l'élément tel qu'il était à la prise de la poignée.
 */
export function CropHandles({ el, offX, offY, scale }: { el: TrameElement; offX: number; offY: number; scale: number }): React.JSX.Element {
  const start = useRef<TrameElement | null>(null)
  const w = el.width * scale
  const h = el.height * scale

  const onMove = (hd: (typeof HANDLES)[number], e: Konva.KonvaEventObject<DragEvent>): void => {
    const s = start.current
    if (!s) return
    // position de la poignée (centre) dans le repère de l'image, en pixels de design, relativement à sa place de départ
    const px = (e.target.x() + SIZE / 2) / scale
    const py = (e.target.y() + SIZE / 2) / scale
    const move: { l?: number; t?: number; r?: number; b?: number } = {}
    if (hd.sx === -1) move.l = px
    if (hd.sx === 1) move.r = px - s.width
    if (hd.sy === -1) move.t = py
    if (hd.sy === 1) move.b = py - s.height
    useEditor.getState().updateElement(s.id, cropByEdges(s, move), false)
  }

  return (
    <Group x={offX + el.x * scale} y={offY + el.y * scale} rotation={el.rotation} data-crop-handles>
      <Rect width={w} height={h} stroke="#ffffff" strokeWidth={1} dash={[5, 4]} listening={false} />
      {HANDLES.map((hd) => (
        <Rect
          key={hd.name}
          name={`crop-${hd.name}`}
          x={hd.fx * w - SIZE / 2}
          y={hd.fy * h - SIZE / 2}
          width={SIZE}
          height={SIZE}
          fill="#ffffff"
          stroke="#7c5cff"
          strokeWidth={1.5}
          cornerRadius={2}
          draggable
          onMouseEnter={(e) => {
            const c = e.target.getStage()?.container()
            if (c) c.style.cursor = hd.cursor
          }}
          onMouseLeave={(e) => {
            const c = e.target.getStage()?.container()
            if (c) c.style.cursor = ''
          }}
          onDragStart={(e) => {
            e.cancelBubble = true
            start.current = el
            useEditor.getState().beginChange()
          }}
          onDragMove={(e) => {
            e.cancelBubble = true
            onMove(hd, e)
          }}
          onDragEnd={(e) => {
            e.cancelBubble = true
            start.current = null
            // la poignée revient sur son bord / son coin de l'image recadrée (le recadrage peut avoir été limité, ou la boîte avoir changé de taille)
            const id = el.id
            const now = useEditor.getState().doc.pages.flatMap((p) => p.elements).find((o) => o.id === id)
            if (now) e.target.position({ x: hd.fx * now.width * scale - SIZE / 2, y: hd.fy * now.height * scale - SIZE / 2 })
          }}
        />
      ))}
    </Group>
  )
}
