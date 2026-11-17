import { useEffect, useRef } from 'react'
import { Circle, Group, Line, Path, Rect } from 'react-konva'
import type Konva from 'konva'
import type { Pt } from '@/freehand'
import { elementNodes, insertNode, isSmooth, moveHandle, moveNode, nearestOnPath, pathFromNodes, pathInFrame, refit, removeNode, scaleNodes, toggleSmooth, type PenNode } from '@/pen'
import { useDraw } from '@/store/draw'
import { useEditor } from '@/store/editor'
import { usePenDraft, usePenEdit } from '@/store/pen'
import type { TrameElement } from '@/types'

const ACCENT = '#7c5cff'
/** Taille d'un point d'ancrage et rayon d'une poignée, en pixels d'écran (ils ne grandissent pas avec le zoom). */
const ANCHOR = 10
const HANDLE = 5

const cursor = (e: Konva.KonvaEventObject<MouseEvent>, value: string): void => {
  const c = e.target.getStage()?.container()
  if (c) c.style.cursor = value
}

/**
 * Le tracé que la plume est en train de poser : la courbe déjà posée, la ligne qui suit le pointeur jusqu'au prochain point, les
 * points (le premier s'agrandit quand le pointeur est assez près pour fermer le tracé) et les poignées du dernier point.
 */
export function PenDraftLayer({ offX, offY, scale }: { offX: number; offY: number; scale: number }): React.JSX.Element | null {
  const nodes = usePenDraft((p) => p.nodes)
  const hover = usePenDraft((p) => p.hover)
  const dragging = usePenDraft((p) => p.dragging)
  const cfg = useDraw((d) => d.settings.pen)
  if (!nodes.length) return null
  const shown: PenNode[] = hover && !dragging ? [...nodes, { x: hover.x, y: hover.y }] : nodes
  const closeHot = !dragging && nodes.length >= 3 && !!hover && Math.hypot(hover.x - nodes[0].x, hover.y - nodes[0].y) <= 10 / scale
  const k = 1 / scale
  const last = nodes[nodes.length - 1]
  return (
    <Group x={offX} y={offY} scaleX={scale} scaleY={scale} listening={false} data-pen-draft>
      <Path data={pathFromNodes(shown, false)} stroke={cfg.color} strokeWidth={cfg.width} opacity={cfg.opacity} lineCap="round" lineJoin="round" />
      {(['inH', 'outH'] as const).map((h) => {
        const p = last[h]
        return p ? (
          <Group key={h}>
            <Line points={[last.x, last.y, p.x, p.y]} stroke={ACCENT} strokeWidth={1 * k} />
            <Circle x={p.x} y={p.y} radius={HANDLE * k * 0.8} fill="#ffffff" stroke={ACCENT} strokeWidth={1.5 * k} />
          </Group>
        ) : null
      })}
      {nodes.map((n, i) => {
        const size = (i === 0 && closeHot ? ANCHOR * 1.6 : ANCHOR * 0.8) * k
        return <Rect key={i} x={n.x} y={n.y} offsetX={size / 2} offsetY={size / 2} width={size} height={size} fill={i === 0 && closeHot ? ACCENT : '#ffffff'} stroke={ACCENT} strokeWidth={1.5 * k} />
      })}
    </Group>
  )
}

/** L'élément tel qu'il est maintenant dans le document (les gestionnaires de glissement ne doivent pas se fier à une copie périmée). */
const latest = (id: string): TrameElement | undefined =>
  useEditor
    .getState()
    .doc.pages.flatMap((p) => p.elements)
    .find((o) => o.id === id)

/**
 * Modification d'un tracé point par point, posée sur l'élément (même repère et même rotation que lui) : on tire un point ou une poignée,
 * on clique la courbe pour y ajouter un point, on double-clique un point pour le passer d'angle à courbe, Suppr le retire. Toute la
 * séance de glissement est un seul pas d'historique ; la boîte de l'élément se réajuste à la courbe au lâcher.
 */
export function PenEdit({ el, offX, offY, scale }: { el: TrameElement; offX: number; offY: number; scale: number }): React.JSX.Element | null {
  const sel = usePenEdit((p) => p.sel)
  const snap = useRef<{ nodes: PenNode[]; closed: boolean; smooth: boolean } | null>(null)
  const parsed = elementNodes(el)

  // clavier : Suppr retire le point choisi, les flèches le déplacent, Entrée et Échap terminent
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.target as HTMLElement | null)?.closest('input, select, textarea')) return
      const cur = latest(el.id)
      const p = cur ? elementNodes(cur) : null
      if (!cur || !p) return
      const i = usePenEdit.getState().sel
      if (e.key === 'Enter' || e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        usePenEdit.getState().set(null)
        return
      }
      if (i === null || i >= p.nodes.length) return
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        e.stopPropagation()
        const next = removeNode(p.nodes, i)
        if (!next) return
        useEditor.getState().updateElement(el.id, refit(cur, next, p.closed))
        usePenEdit.getState().select(null)
        return
      }
      const step = e.shiftKey ? 10 : 1
      const d = e.key === 'ArrowLeft' ? [-step, 0] : e.key === 'ArrowRight' ? [step, 0] : e.key === 'ArrowUp' ? [0, -step] : e.key === 'ArrowDown' ? [0, step] : null
      if (!d) return
      e.preventDefault()
      e.stopPropagation()
      useEditor.getState().updateElement(el.id, refit(cur, moveNode(p.nodes, i, { x: p.nodes[i].x + d[0], y: p.nodes[i].y + d[1] }), p.closed))
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [el.id])

  if (!parsed) return null
  const { nodes, closed } = parsed
  const select = usePenEdit.getState().select

  const begin = (smooth: boolean): void => {
    snap.current = { nodes, closed, smooth }
    useEditor.getState().beginChange()
  }
  /** pendant le glissement : le chemin suit, dans la boîte de départ (elle se réajuste au lâcher) */
  const follow = (next: PenNode[]): void => useEditor.getState().updateElement(el.id, { path: pathInFrame(el, next, closed) }, false)
  const settle = (): void => {
    snap.current = null
    const cur = latest(el.id)
    const p = cur ? elementNodes(cur) : null
    if (cur && p) useEditor.getState().updateElement(el.id, refit(cur, p.nodes, p.closed), false)
  }
  /** position (en pixels de la page, dans le repère de l'élément) d'un nœud Konva centré sur son point */
  const at = (e: Konva.KonvaEventObject<DragEvent>): Pt => ({ x: e.target.x() / scale, y: e.target.y() / scale })

  const addPoint = (e: Konva.KonvaEventObject<MouseEvent>): void => {
    e.cancelBubble = true
    const rp = e.target.getRelativePointerPosition()
    if (!rp) return
    const near = nearestOnPath(nodes, closed, { x: rp.x / scale, y: rp.y / scale })
    if (!near || near.dist * scale > 12) return
    useEditor.getState().updateElement(el.id, refit(el, insertNode(nodes, near.seg, near.t), closed))
    select(near.seg + 1)
  }

  const shown = scaleNodes(nodes, scale)
  const chosen = sel !== null ? nodes[sel] : undefined
  return (
    <Group x={offX + el.x * scale} y={offY + el.y * scale} rotation={el.rotation} data-pen-edit>
      <Path data={pathFromNodes(shown, closed)} stroke={ACCENT} strokeWidth={1.5} hitStrokeWidth={14} onMouseDown={addPoint} onMouseEnter={(e) => cursor(e, 'copy')} onMouseLeave={(e) => cursor(e, '')} name="pen-curve" />
      {chosen &&
        (['inH', 'outH'] as const).map((h) => {
          const p = chosen[h]
          if (!p || sel === null) return null
          return (
            <Group key={h}>
              <Line points={[chosen.x * scale, chosen.y * scale, p.x * scale, p.y * scale]} stroke={ACCENT} strokeWidth={1} listening={false} />
              <Circle
                name={`pen-${h}`}
                x={p.x * scale}
                y={p.y * scale}
                radius={HANDLE}
                fill="#ffffff"
                stroke={ACCENT}
                strokeWidth={1.5}
                draggable
                onMouseEnter={(e) => cursor(e, 'move')}
                onMouseLeave={(e) => cursor(e, '')}
                onMouseDown={(e) => (e.cancelBubble = true)}
                onDragStart={(e) => {
                  e.cancelBubble = true
                  begin(isSmooth(nodes[sel]))
                }}
                onDragMove={(e) => {
                  e.cancelBubble = true
                  const s = snap.current
                  if (s) follow(moveHandle(s.nodes, sel, h === 'inH' ? 'in' : 'out', at(e), s.smooth && !e.evt.altKey))
                }}
                onDragEnd={(e) => {
                  e.cancelBubble = true
                  settle()
                }}
              />
            </Group>
          )
        })}
      {shown.map((n, i) => (
        <Rect
          key={i}
          name={`pen-node-${i}`}
          x={n.x}
          y={n.y}
          offsetX={ANCHOR / 2}
          offsetY={ANCHOR / 2}
          width={ANCHOR}
          height={ANCHOR}
          fill={sel === i ? ACCENT : '#ffffff'}
          stroke={ACCENT}
          strokeWidth={1.5}
          draggable
          onMouseEnter={(e) => cursor(e, 'move')}
          onMouseLeave={(e) => cursor(e, '')}
          onMouseDown={(e) => {
            e.cancelBubble = true
            select(i)
          }}
          onDblClick={(e) => {
            e.cancelBubble = true
            useEditor.getState().updateElement(el.id, refit(el, toggleSmooth(nodes, closed, i), closed))
          }}
          onDragStart={(e) => {
            e.cancelBubble = true
            select(i)
            begin(false)
          }}
          onDragMove={(e) => {
            e.cancelBubble = true
            const s = snap.current
            if (s) follow(moveNode(s.nodes, i, at(e)))
          }}
          onDragEnd={(e) => {
            e.cancelBubble = true
            settle()
          }}
        />
      ))}
    </Group>
  )
}
