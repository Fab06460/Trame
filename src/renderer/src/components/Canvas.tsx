import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { boundsOf, intersects, snapBox, snapEdges, unionBox, type Box, type ChangedEdges, type SnapLine } from '@/geometry'
import { Rulers, ViewOptions } from './Rulers'
import { Stage, Layer, Rect, Shape, Text, Image as KImage, Transformer, Group, Circle, Line } from 'react-konva'
import type Konva from 'konva'
import { useEditor, selectPage } from '@/store/editor'
import { pathSceneFunc, boxHitFunc } from '@/shapes'
import { useView } from '@/store/view'
import { dropImages } from '@/imageDrop'
import { useColorVision } from '@/store/colorVision'
import { colorVisionFilter } from '@/readability'
import { usePdfIssues } from '@/store/pdfIssues'
import { konvaGradientProps } from '@/gradient'
import { patchListText } from '@/listText'
import { contentLocked, isEnforced, positionLocked } from '@/protection'
import { useFonts } from '@/store/fonts'
import { useEditedImage } from '@/imageRender'
import { shadowProps } from '@/shadowStyle'
import { strokeProps } from '@/strokeStyle'
import { decorationOf, displayText, letterSpacingOf, lineHeightOf } from '@/textStyle'
import { ZoomControls } from './ZoomControls'
import { CommentPins } from './CommentPins'
import { useReview } from '@/store/review'
import { hitStack, throughTarget } from '@/selection'
import { useCropMode } from '@/store/crop'
import { CropHandles } from './CropHandles'
import { mmToPx, printSetupOf, safeBox } from '@/printSetup'
import type { TrameElement } from '@/types'

const PADDING = 48
/** Distance d'accroche, en pixels écran : constante à l'écran quel que soit le zoom. */
const SNAP_PX = 6
const ALL_ANCHORS = ['top-left', 'top-center', 'top-right', 'middle-right', 'bottom-right', 'bottom-center', 'bottom-left', 'middle-left']
const TEXT_ANCHORS = ['middle-left', 'middle-right']
/** Sélection verrouillée : cadre visible (en pointillés) mais aucune poignée. */
const NO_ANCHORS: string[] = []
/** La rotation s'aimante tous les 45° (à 5° près). */
const ROTATION_SNAPS = [0, 45, 90, 135, 180, 225, 270, 315]
/** Bord déplacé par chaque poignée « de côté » (les coins ne s'aimantent pas : ils garderaient mal les proportions). */
const SIDE_EDGES: Record<string, ChangedEdges> = {
  'middle-left': { left: true },
  'middle-right': { right: true },
  'top-center': { top: true },
  'bottom-center': { bottom: true }
}

function ImageNode({ el, ...props }: Konva.NodeConfig & { el: TrameElement }): React.JSX.Element {
  const img = useEditedImage(el)
  return <KImage {...props} image={img} />
}

export function Canvas(): React.JSX.Element {
  const vision = useColorVision((s) => s.vision)
  // modèle de marque : les éléments protégés se comportent comme des éléments verrouillés tant que le modèle n'est pas en modification
  const enforced = useEditor((s) => isEnforced(s.doc, s.templateUnlocked))
  // une police ajoutée ou retirée : les textes sont recréés (Konva ne remesure pas un texte dont la police vient d'arriver)
  const fontsVersion = useFonts((s) => s.version)
  const doc = useEditor((s) => s.doc)
  const page = useEditor(selectPage)
  const selectedIds = useEditor((s) => s.selectedIds)
  const pdfIssues = usePdfIssues((s) => s.issues)
  const { select, selectExact, toggleSelect, updateElement, beginChange, setPositions, cloneSelectedInPlace } = useEditor.getState()
  const settings = useView((v) => v.settings)
  const [snapLines, setSnapLines] = useState<SnapLine[]>([])

  const wrapRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<Konva.Stage>(null)
  const trRef = useRef<Konva.Transformer>(null)
  const [size, setSize] = useState({ w: 800, h: 600 })
  const [editing, setEditing] = useState<string | null>(null)
  const cropId = useCropMode((c) => c.id)
  const [lasso, setLasso] = useState<Box | null>(null)
  const lassoStart = useRef<{ x: number; y: number; additive: boolean } | null>(null)
  const dragStart = useRef<Record<string, { x: number; y: number }>>({})
  /** sélection d'avant un ⌘-clic (null pour un clic ordinaire) : le clic cherche l'élément situé en dessous */
  const throughFrom = useRef<string[] | null>(null)
  /** copies des éléments déplacés, à leur position de départ : sert à calculer la boîte englobante pour l'aimantation */
  const dragEls = useRef<TrameElement[]>([])
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

  const adding = useReview((s) => s.adding)
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

  // Dépôt d'images depuis le Finder / l'explorateur : insérées là où on les lâche
  useEffect(() => {
    const el = wrapRef.current!
    const hasFiles = (e: DragEvent): boolean => !!e.dataTransfer && [...e.dataTransfer.types].includes('Files')
    const onOver = (e: DragEvent): void => {
      if (!hasFiles(e)) return
      e.preventDefault()
      e.dataTransfer!.dropEffect = 'copy'
    }
    const onDrop = (e: DragEvent): void => {
      if (!hasFiles(e)) return
      e.preventDefault()
      const files = [...(e.dataTransfer?.files ?? [])]
      const rect = el.getBoundingClientRect()
      const { doc: d } = useEditor.getState()
      const at = { x: (e.clientX - rect.left - offX) / scale, y: (e.clientY - rect.top - offY) / scale }
      void dropImages(files, at, d)
    }
    el.addEventListener('dragover', onOver)
    el.addEventListener('drop', onDrop)
    return () => {
      el.removeEventListener('dragover', onOver)
      el.removeEventListener('drop', onDrop)
    }
  }, [offX, offY, scale])

  // le recadrage s'arrête dès que l'image n'est plus la seule sélection (ou qu'on change de page)
  useEffect(() => {
    if (cropId && !(selectedIds.length === 1 && selectedIds[0] === cropId)) useCropMode.getState().set(null)
  }, [cropId, selectedIds, page.id])

  // Attache le transformer au nœud sélectionné
  useEffect(() => {
    const tr = trRef.current
    const stage = stageRef.current
    if (!tr || !stage) return
    const nodes = editing || cropId ? [] : selectedIds.map((id) => stage.findOne('#' + id)).filter((n): n is Konva.Node => !!n)
    tr.nodes(nodes)
  }, [selectedIds, page.elements, editing, page.id, cropId])

  const printSetup = printSetupOf(doc)
  const bleedPx = mmToPx(printSetup.bleedMm)
  const safe = safeBox(doc, printSetup)

  const commonProps = (el: TrameElement): Konva.NodeConfig => ({
    id: el.id,
    x: el.x,
    y: el.y,
    rotation: el.rotation,
    opacity: el.opacity,
    draggable: editing !== el.id && !spaceDown && !positionLocked(el, enforced),
    onMouseDown: (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (spaceDown || e.evt.button === 1) return // outil main ou clic molette : on déplace la vue, pas la sélection
      throughFrom.current = e.evt.metaKey || e.evt.ctrlKey ? selectedIds : null
      if (e.evt.shiftKey) toggleSelect(el.id)
      else if (selectedIds.length === 1 && el.groupId && page.elements.find((x) => x.id === selectedIds[0])?.groupId === el.groupId) selectExact([el.id]) // dans un groupe : un membre à la fois
      else if (!selectedIds.includes(el.id)) select([el.id])
    },
    // ⌘-clic : l'élément en dessous de celui qui est sélectionné, parmi ceux superposés sous le pointeur
    onClick: (e: Konva.KonvaEventObject<MouseEvent>) => {
      const from = throughFrom.current
      throughFrom.current = null
      if (!from || e.evt.shiftKey || e.evt.button !== 0) return
      const target = throughTarget(hitStack(page.elements, toDesign()), from)
      if (target) select([target])
    },
    onTap: () => select([el.id]),
    // double-clic : sur un membre de groupe, on entre dans le groupe (ce membre seul est sélectionné) ; sur une image seule, on la recadre ;
    // un texte s'ouvre en saisie, voir plus bas
    onDblClick: () => {
      if (el.groupId && !(selectedIds.length === 1 && selectedIds[0] === el.id)) selectExact([el.id])
      else if (el.type === 'image' && !positionLocked(el, enforced) && !contentLocked(el, enforced)) useCropMode.getState().set(cropId === el.id ? null : el.id)
    },
    onDragStart: (e: Konva.KonvaEventObject<DragEvent>) => {
      // Alt + glisser : on laisse une copie derrière (un seul cran d'historique pour la copie et le déplacement)
      if (e.evt.altKey) cloneSelectedInPlace()
      else beginChange()
      const selectedIds = useEditor.getState().selectedIds
      // un élément verrouillé reste en place, même dans une sélection que l'on déplace
      const moved = page.elements.filter((x) => selectedIds.includes(x.id) && !positionLocked(x, enforced))
      // mémorise les positions de départ de toute la sélection pour la déplacer d'un bloc
      dragStart.current = Object.fromEntries(moved.map((x) => [x.id, { x: x.x, y: x.y }]))
      dragEls.current = moved
    },
    onDragMove: (e: Konva.KonvaEventObject<DragEvent>) => {
      const start = dragStart.current[el.id]
      if (!start) return updateElement(el.id, { x: e.target.x(), y: e.target.y() }, false)
      let dx = e.target.x() - start.x
      let dy = e.target.y() - start.y
      // Maj : déplacement bloqué sur l'axe dominant
      if (e.evt.shiftKey) {
        if (Math.abs(dx) >= Math.abs(dy)) dy = 0
        else dx = 0
      }
      // Aimantation : bords et centres de la sélection vers ceux des autres éléments, de la page et des repères (⌘ la suspend)
      if (settings.snap && !e.evt.metaKey && !e.evt.ctrlKey) {
        const box = unionBox(dragEls.current.map((x) => boundsOf({ ...x, x: x.x + dx, y: x.y + dy })))
        const ctx = snapContext(dragEls.current.map((x) => x.id))
        const snapped = snapBox(box, ctx.targets, ctx.options)
        // sur un axe verrouillé par Maj on ne corrige pas : l'élément ne doit pas quitter son axe
        if (!(e.evt.shiftKey && dx === 0 && snapped.dx !== 0)) dx += snapped.dx
        if (!(e.evt.shiftKey && dy === 0 && snapped.dy !== 0)) dy += snapped.dy
        setSnapLines(snapped.lines)
      } else setSnapLines([])
      setPositions(Object.fromEntries(Object.entries(dragStart.current).map(([id, p]) => [id, { x: p.x + dx, y: p.y + dy }])))
    },
    onDragEnd: () => {
      dragStart.current = {}
      dragEls.current = []
      setSnapLines([])
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
      setSnapLines([])
      if (selectedIds.length === 1) return
      const n = e.target
      const w = Math.max(5, n.width() * n.scaleX())
      const h = Math.max(5, n.height() * n.scaleY())
      n.scaleX(1)
      n.scaleY(1)
      updateElement(el.id, { x: n.x(), y: n.y(), width: w, height: h, rotation: n.rotation() }, false)
    }
  })

  /** Cibles d'aimantation : tous les éléments non sélectionnés de la page ; seuil et repères selon les réglages. */
  const snapContext = (selected: string[]): { targets: Box[]; options: Parameters<typeof snapBox>[2] } => ({
    targets: page.elements.filter((e) => !e.hidden && !selected.includes(e.id)).map(boundsOf),
    options: { width: doc.width, height: doc.height, guides: settings.guides ? page.guides : undefined, threshold: SNAP_PX / scale }
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
    if (useReview.getState().adding) {
      // mode « ajouter un commentaire » : le clic pose l'épingle (sur la page ou à côté, ramenée dans la page)
      const p = toDesign()
      useReview.getState().setDraft({ pageId: page.id, x: Math.min(doc.width, Math.max(0, p.x)), y: Math.min(doc.height, Math.max(0, p.y)) })
      return
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
    const hits = page.elements.filter((el) => !el.hidden && intersects(boundsOf(el), lasso)).map((el) => el.id)
    select(st.additive ? [...selectedIds, ...hits] : hits)
    setLasso(null)
  }

  const startTextEdit = (id: string): void => {
    select([id])
    setEditing(id)
  }

  // un texte qui vient d'être créé s'ouvre directement en saisie
  const editRequest = useEditor((s) => s.editRequest)
  useEffect(() => {
    if (!editRequest) return
    if (page.elements.some((e) => e.id === editRequest)) startTextEdit(editRequest)
    useEditor.getState().clearEditRequest()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editRequest])

  const editingEl = page.elements.find((e) => e.id === editing)
  const anyLocked = page.elements.some((e) => selectedIds.includes(e.id) && positionLocked(e, enforced))
  const soleText = selectedIds.length === 1 && page.elements.find((e) => e.id === selectedIds[0])?.type === 'text'

  return (
    <div ref={wrapRef} className="canvas-wrap" data-guide-count={page.guides?.length ?? 0} style={{ cursor: panning ? 'grabbing' : spaceDown ? 'grab' : adding ? 'crosshair' : undefined, filter: colorVisionFilter(vision) }} data-color-vision={vision === 'none' ? undefined : vision}>
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
              x={-bleedPx}
              y={-bleedPx}
              width={doc.width + 2 * bleedPx}
              height={doc.height + 2 * bleedPx}
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
            clipX={-bleedPx}
            clipY={-bleedPx}
            clipWidth={doc.width + 2 * bleedPx}
            clipHeight={doc.height + 2 * bleedPx}
          >
            {page.elements.filter((el) => !el.hidden).map((el) => {
              const p = commonProps(el)
              if (el.type === 'rect')
                return <Rect key={el.id} {...p} {...strokeProps(el)} {...shadowProps(el)} {...konvaGradientProps(el.gradient, el.width, el.height)} width={el.width} height={el.height} fill={el.fill} cornerRadius={el.cornerRadius} />
              if (el.type === 'ellipse')
                return (
                  <Shape
                    key={el.id}
                    {...p}
                    {...strokeProps(el)}
                    {...shadowProps(el)}
                    {...konvaGradientProps(el.gradient, el.width, el.height)}
                    width={el.width}
                    height={el.height}
                    fill={el.fill}
                    sceneFunc={(ctx, shape) => {
                      ctx.beginPath()
                      ctx.ellipse(shape.width() / 2, shape.height() / 2, shape.width() / 2, shape.height() / 2, 0, 0, Math.PI * 2)
                      ctx.closePath()
                      ctx.fillStrokeShape(shape)
                    }}
                  />
                )
              if (el.type === 'path' && el.path)
                return (
                  <Shape
                    key={el.id}
                    {...p}
                    {...strokeProps(el)}
                    {...shadowProps(el)}
                    width={el.width}
                    height={el.height}
                    fill={el.fill}
                    trameGradient={el.gradient}
                    sceneFunc={pathSceneFunc(el.path)}
                    hitFunc={boxHitFunc}
                  />
                )
              if (el.type === 'image') return <ImageNode key={el.id} el={el} {...p} {...strokeProps(el)} {...shadowProps(el)} width={el.width} height={el.height} />
              return (
                <Text
                  key={`${el.id}:${fontsVersion}`}
                  {...p}
                  {...strokeProps(el)}
                  {...shadowProps(el)}
                  visible={editing !== el.id}
                  width={el.width}
                  text={displayText(el)}
                  letterSpacing={letterSpacingOf(el)}
                  lineHeight={lineHeightOf(el)}
                  textDecoration={decorationOf(el)}
                  fontSize={el.fontSize}
                  fontFamily={el.fontFamily}
                  fontStyle={el.fontStyle}
                  align={el.align}
                  fill={el.fill}
                  trameList={el.list}
                  ref={(n: Konva.Text | null) => {
                    if (n) patchListText(n)
                  }}
                  onDblClick={() => !contentLocked(el, enforced) && startTextEdit(el.id)}
                  onDblTap={() => !contentLocked(el, enforced) && startTextEdit(el.id)}
                />
              )
            })}
          </Group>
          {(() => {
            const ce = cropId ? page.elements.find((x) => x.id === cropId && x.type === 'image' && !x.hidden) : undefined
            return ce && selectedIds.length === 1 && selectedIds[0] === ce.id ? <CropHandles el={ce} offX={offX} offY={offY} scale={scale} /> : null
          })()}
          {/* fond perdu (trait du bord fini) et marge de sécurité : repères d'édition, absents de tous les exports */}
          {(bleedPx > 0 || safe) && (
            <Group x={offX} y={offY} scaleX={scale} scaleY={scale} listening={false}>
              {bleedPx > 0 && <Rect width={doc.width} height={doc.height} stroke="#e5484d" strokeWidth={1 / scale} dash={[6 / scale, 4 / scale]} />}
              {safe && settings.guides && <Rect x={safe.x} y={safe.y} width={safe.width} height={safe.height} stroke="#16a34a" strokeWidth={1 / scale} dash={[6 / scale, 4 / scale]} />}
            </Group>
          )}
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
          {/* lignes d'aimantation (déplacement ou redimensionnement) : indication d'édition, absente de tous les exports */}
          {snapLines.map((l, i) => {
            const at = Math.round((l.axis === 'x' ? offX : offY) + l.position * scale) + 0.5
            const a = (l.axis === 'x' ? offY : offX) + l.from * scale - 8
            const b = (l.axis === 'x' ? offY : offX) + l.to * scale + 8
            return <Line key={`snap-${i}`} points={l.axis === 'x' ? [at, a, at, b] : [a, at, b, at]} stroke="#ff3d71" strokeWidth={1} listening={false} />
          })}

          <Transformer
            ref={trRef}
            rotateEnabled={!anyLocked}
            borderDash={anyLocked ? [4, 4] : undefined}
            // comme Canva : les coins gardent les proportions, les côtés étirent librement ; un texte ne s'étire que en largeur
            keepRatio
            enabledAnchors={anyLocked ? NO_ANCHORS : soleText ? TEXT_ANCHORS : ALL_ANCHORS}
            rotationSnaps={ROTATION_SNAPS}
            rotationSnapTolerance={5}
            borderStroke="#7c5cff"
            anchorStroke="#7c5cff"
            anchorSize={10}
            anchorCornerRadius={5}
            boundBoxFunc={(o, n) => {
              if (n.width < 10 || n.height < 10) return o
              // aimantation du redimensionnement : seuls les côtés (un bord à la fois), sans rotation ; les coins gardent les proportions
              const edges = SIDE_EDGES[trRef.current?.getActiveAnchor() ?? '']
              if (!settings.snap || !edges || n.rotation !== 0) {
                setSnapLines((l) => (l.length ? [] : l))
                return n
              }
              const ctx = snapContext(selectedIds)
              const r = snapEdges({ x: (n.x - offX) / scale, y: (n.y - offY) / scale, width: n.width / scale, height: n.height / scale }, edges, ctx.targets, ctx.options)
              setSnapLines(r.lines)
              return { ...n, x: offX + r.box.x * scale, y: offY + r.box.y * scale, width: r.box.width * scale, height: r.box.height * scale }
            }}
          />
        </Layer>
      </Stage>

      <CommentPins offX={offX} offY={offY} scale={scale} />
      <Rulers />
      <ViewOptions />
      <ZoomControls />

      {editingEl && (
        <textarea
          className="text-editor"
          autoFocus
          // tout le texte est sélectionné à l'ouverture : on tape directement, sans effacer le texte par défaut
          onFocus={(e) => e.currentTarget.select()}
          defaultValue={editingEl.text}
          style={{
            left: offX + editingEl.x * scale,
            top: offY + editingEl.y * scale,
            width: editingEl.width * scale,
            minHeight: (editingEl.fontSize ?? 32) * scale * lineHeightOf(editingEl),
            fontSize: (editingEl.fontSize ?? 32) * scale,
            fontFamily: editingEl.fontFamily,
            fontWeight: editingEl.fontStyle?.includes('bold') ? 700 : 400,
            fontStyle: editingEl.fontStyle?.includes('italic') ? 'italic' : 'normal',
            textAlign: editingEl.align,
            letterSpacing: letterSpacingOf(editingEl) * scale,
            lineHeight: lineHeightOf(editingEl),
            textDecoration: decorationOf(editingEl) || 'none',
            textTransform: editingEl.uppercase ? 'uppercase' : 'none',
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
