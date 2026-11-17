import { create } from 'zustand'
import type { Pt } from '@/freehand'
import { dedupeNodes, dragLastNode, fitNodes, pressNode, type PenNode } from '@/pen'
import { t } from '@/i18n'
import { useDraw } from './draw'
import { useEditor } from './editor'

/**
 * Le tracé que la plume est en train de poser (points en pixels de la page) : ni sauvegardé, ni dans l'historique. Il devient un
 * élément quand on le termine (Entrée, « Terminer », un clic sur son premier point pour le fermer, ou un autre outil).
 */
interface PenDraft {
  nodes: PenNode[]
  /** le dernier point vient d'être posé et le bouton est encore enfoncé : on en tire les poignées */
  dragging: boolean
  /** position du pointeur, pour la ligne qui suit le curseur */
  hover: Pt | null
  press: (p: Pt, closeRadius: number) => void
  drag: (p: Pt, minDistance: number) => void
  release: () => void
  hoverAt: (p: Pt | null) => void
  /** Pose le tracé comme un élément (`closed` : fermé) ; sans effet s'il y a moins de deux points. */
  finish: (closed?: boolean) => void
  cancel: () => void
}

export const usePenDraft = create<PenDraft>((set, get) => ({
  nodes: [],
  dragging: false,
  hover: null,
  press: (p, closeRadius) => {
    const r = pressNode(get().nodes, p, closeRadius)
    if (r.closes) return get().finish(true)
    set({ nodes: r.nodes, dragging: true })
  },
  drag: (p, minDistance) => {
    if (get().dragging) set({ nodes: dragLastNode(get().nodes, p, minDistance) })
  },
  release: () => set({ dragging: false }),
  hoverAt: (hover) => set({ hover }),
  finish: (closed = false) => {
    const nodes = dedupeNodes(get().nodes)
    set({ nodes: [], dragging: false, hover: null })
    if (nodes.length < 2) return
    const cfg = useDraw.getState().settings.pen
    const f = fitNodes(nodes, closed)
    const filled = closed && !!cfg.fill
    useEditor.getState().addElement({
      type: 'path',
      // un contour seul est un tracé ouvert (jamais rempli) même refermé ; rempli, c'est une forme comme les autres
      ...(filled ? {} : { open: true as const }),
      path: f.path,
      x: f.x,
      y: f.y,
      width: f.width,
      height: f.height,
      fill: cfg.color,
      stroke: cfg.color,
      strokeWidth: cfg.width,
      opacity: cfg.opacity,
      name: t(filled ? 'draw.name.pen.shape' : 'draw.name.pen')
    })
    useEditor.getState().select([])
  },
  cancel: () => set({ nodes: [], dragging: false, hover: null })
}))

/** Tracé modifié point par point sur la page (poignées sur la courbe) : l'élément et le point choisi. État d'affichage, hors fichier et historique. */
interface PenEdit {
  id: string | null
  sel: number | null
  set: (id: string | null) => void
  select: (i: number | null) => void
}

export const usePenEdit = create<PenEdit>((set) => ({ id: null, sel: null, set: (id) => set({ id, sel: null }), select: (sel) => set({ sel }) }))
