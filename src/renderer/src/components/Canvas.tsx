import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { boundsOf, intersects, type Box } from '@/geometry'
import { Stage, Layer, Rect, Shape, Text, Image as KImage, Transformer, Group, Circle } from 'react-konva'
import type Konva from 'konva'
import { useEditor, selectPage } from '@/store/editor'
import { pathSceneFunc, boxHitFunc } from '@/shapes'
import { useView } from '@/store/view'
import { usePdfIssues } from '@/store/pdfIssues'
import { ZoomControls } from './ZoomControls'
import type { TrameElement } from '@/types'

const PADDING = 48

function useLoadedImage(src?: string): HTMLImageElement | undefined {
  const [img, setImg] = useState<HTMLImageElement>()
  useEffect(() => {
    if (!src) return setImg(undefined)
    const i = new window.Image()
    i.onload = () => setImg(i)
    i.src = src
  }, [src])
  return img
}

function ImageNode(props: Konva.NodeConfig & { src?: string }): React.JSX.Element {
  const img = useLoadedImage(props.src)
  return <KImage {...props} image={img} />
}

export function Canvas(): React.JSX.Element {
  const doc = useEditor((s) => s.doc)
  const page = useEditor(selectPage)
  const selectedIds = useEditor((s) => s.selectedIds)
  const pdfIssues = usePdfIssues((s) => s.issues)
  const { select, toggleSelect, updateElement, beginChange, setPositions } = useEditor.getState()

  const wrapRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<Konva.Stage>(null)
  const trRef = useRef<Konva.Transformer>(null)
  const [size, setSize] = useState({ w: 800, h: 600 })
  const [editing, setEditing] = useState<string | null>(null)
  const [lasso, setLasso] = useState<Box | null>(null)
  const lassoStart = useRef<{ x: number; y: number; additive: boolean } | null>(null)
  const dragStart = useRef<Record<string, { x: number; y: number }>>({})
  // Konva émet transformstart/transformend une fois par nœud : un seul cran d'historique par geste.
  const transforming = useRef(false)

  useLayoutEffect(() => {
    const el = wrapRef.current!
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    setSize({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  // Vue : `fit` ajuste la page à la zone ; zoom et décalage viennent du store de vue (molette, pincement, boutons)
  const zoom = useView((v) => v.zoom)
  const panX = useView((v) => v.panX)
  const panY = useView((v) => v.panY)
  const fit = Math.max(0.01, Math.min((size.w - PADDING * 2) / doc.width, (size.h - PADDING * 2) / doc.height))
  const scale = fit * zoom
  const offX = (size.w - doc.width * scale) / 2 + panX
  const offY = (size.h - doc.height * scale) / 2 + panY

  useEffect(() => {
    useView.getState().setLayout({ fit, viewW: size.w, viewH: size.h, docW: doc.width, docH: doc.height })
  }, [fit, size.w, size.h, doc.width, doc.height])

  // Un nouveau document (ouvrir, nouveau, modèle) repart d'une vue ajustée
  const firstPageId = doc.pages[0].id
  useEffect(() => useView.getState().fitToScreen(), [firstPageId])

  const [spaceDown, setSpaceDown] = useState(false)
  const [panning, setPanning] = useState(false)

  // Barre d'espace maintenue = outil main (déplacer la vue)
  useEffect(() => {
    const isTyping = (t: EventTarget | null): boolean => {
      const el = t as HTMLElement | null
      return !!el && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && ['text', 'number'].includes((el as HTMLInputElement).type)))
    }
    const down = (e: KeyboardEvent): void => {
      if (e.code !== 'Space' || isTyping(e.target)) return
      e.preventDefault() // évite d'activer le bouton qui aurait le focus
      setSpaceDown(true)
    }
    const up = (e: KeyboardEvent): void => {
      if (e.code !== 'Space') return
      if (!isTyping(e.target)) e.preventDefault()
      setSpaceDown(false)
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  const startPan = (clientX: number, clientY: number): void => {
    const { panX: x0, panY: y0 } = useView.getState()
    setPanning(true)
    const move = (e: MouseEvent): void => useView.getState().setPan(x0 + e.clientX - clientX, y0 + e.clientY - clientY)
    const end = (): void => {
      setPanning(false)
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', end)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', end)
  }

  // Molette : pincement / ⌘+molette = zoom autour du curseur ; défilement à deux doigts = déplacement
  useEffect(() => {
    const el = wrapRef.current!
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault()
      const v = useView.getState()
      if (e.ctrlKey || e.metaKey) {
        const rect = el.getBoundingClientRect()
        v.zoomBy(Math.exp(-e.deltaY * 0.01), { x: e.clientX - rect.left, y: e.clientY - rect.top })
      } else {
        v.setPan(v.panX - e.deltaX, v.panY - e.deltaY)
      }
    }
    // non passif : nécessaire pour pouvoir appeler preventDefault (sinon la page entière zoomerait)
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  // Attache le transformer au nœud sélectionné
  useEffect(() => {
    const tr = trRef.current
    const stage = stageRef.current
    if (!tr || !stage) return
    const nodes = editing ? [] : selectedIds.map((id) => stage.findOne('#' + id)).filter((n): n is Konva.Node => !!n)
    tr.nodes(nodes)
  }, [selectedIds, page.elements, editing, page.id])

  const commonProps = (el: TrameElement): Konva.NodeConfig => ({
    id: el.id,
    x: el.x,
    y: el.y,
    rotation: el.rotation,
    opacity: el.opacity,
    draggable: editing !== el.id && !spaceDown,
    onMouseDown: (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (spaceDown || e.evt.button === 1) return // outil main ou clic molette : on déplace la vue, pas la sélection
      if (e.evt.shiftKey) toggleSelect(el.id)
      else if (!selectedIds.includes(el.id)) select([el.id])
    },
    onTap: () => select([el.id]),
    onDragStart: () => {
      beginChange()
      const selectedIds = useEditor.getState().selectedIds
      // mémorise les positions de départ de toute la sélection pour la déplacer d'un bloc
      dragStart.current = Object.fromEntries(
        page.elements.filter((x) => selectedIds.includes(x.id)).map((x) => [x.id, { x: x.x, y: x.y }])
      )
    },
    onDragMove: (e: Konva.KonvaEventObject<DragEvent>) => {
      const start = dragStart.current[el.id]
      if (!start) return updateElement(el.id, { x: e.target.x(), y: e.target.y() }, false)
      const dx = e.target.x() - start.x
      const dy = e.target.y() - start.y
      setPositions(Object.fromEntries(Object.entries(dragStart.current).map(([id, p]) => [id, { x: p.x + dx, y: p.y + dy }])))
    },
    onDragEnd: () => {
      dragStart.current = {}
    },
    onTransformStart: () => {
      if (transforming.current) return
      transforming.current = true
      beginChange()
    },
    // Sélection simple : on convertit l'échelle en taille en direct (texte, formes nettes).
    onTransform: (e: Konva.KonvaEventObject<Event>) => {
      if (selectedIds.length !== 1) return
      const n = e.target
      const w = Math.max(5, n.width() * n.scaleX())
      const h = Math.max(5, n.height() * n.scaleY())
      n.scaleX(1)
      n.scaleY(1)
      updateElement(el.id, { x: n.x(), y: n.y(), width: w, height: h, rotation: n.rotation() }, false)
    },
    // Sélection multiple : le Transformer gère l'échelle de chaque nœud, on fige le résultat à la fin.
    onTransformEnd: (e: Konva.KonvaEventObject<Event>) => {
      transforming.current = false
      if (selectedIds.length === 1) return
      const n = e.target
      const w = Math.max(5, n.width() * n.scaleX())
      const h = Math.max(5, n.height() * n.scaleY())
      n.scaleX(1)
      n.scaleY(1)
      updateElement(el.id, { x: n.x(), y: n.y(), width: w, height: h, rotation: n.rotation() }, false)
    }
  })

  const toDesign = (): { x: number; y: number } => {
    const p = stageRef.current!.getPointerPosition()!
    return { x: (p.x - offX) / scale, y: (p.y - offY) / scale }
  }

  const startLasso = (e: Konva.KonvaEventObject<MouseEvent>): void => {
    if (spaceDown || e.evt.button === 1) {
      e.evt.preventDefault()
      return startPan(e.evt.clientX, e.evt.clientY)
    }
    if (e.target !== e.target.getStage() && e.target.name() !== 'bg') return
    const additive = e.evt.shiftKey
    if (!additive) select([])
    lassoStart.current = { ...toDesign(), additive }
  }

  const moveLasso = (): void => {
    const st = lassoStart.current
    if (!st) return
    const p = toDesign()
    setLasso({ x: Math.min(st.x, p.x), y: Math.min(st.y, p.y), width: Math.abs(p.x - st.x), height: Math.abs(p.y - st.y) })
  }

  const endLasso = (): void => {
    const st = lassoStart.current
    lassoStart.current = null
    if (!st || !lasso) return setLasso(null)
    const hits = page.elements.filter((el) => intersects(boundsOf(el), lasso)).map((el) => el.id)
    select(st.additive ? [...selectedIds, ...hits] : hits)
    setLasso(null)
  }

  const startTextEdit = (id: string): void => {
    select([id])
    setEditing(id)
  }

  const editingEl = page.elements.find((e) => e.id === editing)

  return (
    <div ref={wrapRef} className="canvas-wrap" style={{ cursor: panning ? 'grabbing' : spaceDown ? 'grab' : undefined }}>
      <Stage
        ref={stageRef}
        width={size.w}
        height={size.h}
        onMouseDown={startLasso}
        onMouseMove={moveLasso}
        onMouseUp={endLasso}
        onMouseLeave={endLasso}
      >
        <Layer>
          <Group x={offX} y={offY} scaleX={scale} scaleY={scale}>
            <Rect
              width={doc.width}
              height={doc.height}
              fill={page.background}
              shadowColor="#000"
              shadowBlur={24}
              shadowOpacity={0.35}
              name="bg"
            />
          </Group>
          <Group
            x={offX}
            y={offY}
            scaleX={scale}
            scaleY={scale}
            clipX={0}
            clipY={0}
            clipWidth={doc.width}
            clipHeight={doc.height}
          >
            {page.elements.map((el) => {
              const p = commonProps(el)
              if (el.type === 'rect')
                return <Rect key={el.id} {...p} width={el.width} height={el.height} fill={el.fill} cornerRadius={el.cornerRadius} />
              if (el.type === 'ellipse')
                return (
                  <Shape
                    key={el.id}
                    {...p}
                    width={el.width}
                    height={el.height}
                    fill={el.fill}
                    sceneFunc={(ctx, shape) => {
                      ctx.beginPath()
                      ctx.ellipse(shape.width() / 2, shape.height() / 2, shape.width() / 2, shape.height() / 2, 0, 0, Math.PI * 2)
                      ctx.closePath()
                      ctx.fillShape(shape)
                    }}
                  />
                )
              if (el.type === 'path' && el.path)
                return (
                  <Shape
                    key={el.id}
                    {...p}
                    width={el.width}
                    height={el.height}
                    fill={el.fill}
                    sceneFunc={pathSceneFunc(el.path)}
                    hitFunc={boxHitFunc}
                  />
                )
              if (el.type === 'image') return <ImageNode key={el.id} {...p} src={el.src} width={el.width} height={el.height} />
              return (
                <Text
                  key={el.id}
                  {...p}
                  visible={editing !== el.id}
                  width={el.width}
                  text={el.text}
                  fontSize={el.fontSize}
                  fontFamily={el.fontFamily}
                  fontStyle={el.fontStyle}
                  align={el.align}
                  fill={el.fill}
                  onDblClick={() => startTextEdit(el.id)}
                  onDblTap={() => startTextEdit(el.id)}
                />
              )
            })}
          </Group>
          {/* pastille « ce texte sera exporté en image dans le PDF » : indication d'édition, absente de tous les exports */}
          {page.elements
            .filter((el) => pdfIssues[el.id])
            .map((el) => {
              const b = boundsOf(el)
              return (
                // décalée vers l'extérieur du coin supérieur droit pour ne pas masquer la poignée de redimensionnement
                <Group key={`warn-${el.id}`} x={offX + (b.x + b.width) * scale + 4} y={offY + b.y * scale - 16} listening={false}>
                  <Circle radius={9} fill="#f59e0b" stroke="#1e1f24" strokeWidth={1.5} />
                  <Text x={-9} y={-7} width={18} align="center" text="!" fontSize={13} fontStyle="bold" fontFamily="Helvetica Neue, Arial, sans-serif" fill="#1e1f24" />
                </Group>
              )
            })}

          {lasso && (
            <Rect
              x={offX + lasso.x * scale}
              y={offY + lasso.y * scale}
              width={lasso.width * scale}
              height={lasso.height * scale}
              fill="rgba(124,92,255,0.12)"
              stroke="#7c5cff"
              strokeWidth={1}
              listening={false}
            />
          )}
          <Transformer
            ref={trRef}
            rotateEnabled
            keepRatio={false}
            borderStroke="#7c5cff"
            anchorStroke="#7c5cff"
            anchorSize={10}
            anchorCornerRadius={5}
            boundBoxFunc={(o, n) => (n.width < 10 || n.height < 10 ? o : n)}
          />
        </Layer>
      </Stage>

      <ZoomControls />

      {editingEl && (
        <textarea
          className="text-editor"
          autoFocus
          defaultValue={editingEl.text}
          style={{
            left: offX + editingEl.x * scale,
            top: offY + editingEl.y * scale,
            width: editingEl.width * scale,
            minHeight: (editingEl.fontSize ?? 32) * scale * 1.2,
            fontSize: (editingEl.fontSize ?? 32) * scale,
            fontFamily: editingEl.fontFamily,
            fontWeight: editingEl.fontStyle?.includes('bold') ? 700 : 400,
            fontStyle: editingEl.fontStyle?.includes('italic') ? 'italic' : 'normal',
            textAlign: editingEl.align,
            color: editingEl.fill,
            transform: `rotate(${editingEl.rotation}deg)`
          }}
          onBlur={(e) => {
            updateElement(editingEl.id, { text: e.target.value })
            setEditing(null)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') (e.target as HTMLTextAreaElement).blur()
            e.stopPropagation()
          }}
        />
      )}
    </div>
  )
}
