import { create } from 'zustand'
import { nanoid } from 'nanoid'
import { alignDeltas, distributeDeltas, unionBox, boundsOf, type AlignMode } from '@/geometry'
import type { TrameDocument, TrameElement, TramePage } from '@/types'

const HISTORY_LIMIT = 100

const blankPage = (): TramePage => ({ id: nanoid(8), background: '#ffffff', elements: [] })

const blankDoc = (): TrameDocument => ({
  version: 2,
  name: 'Sans titre',
  width: 1080,
  height: 1080,
  pages: [blankPage()]
})

/** Accepte les fichiers v1 (une seule page à plat) et les convertit en v2. */
export function migrateDocument(raw: any): TrameDocument {
  if (raw.version === 2) return raw
  const { background, elements, ...rest } = raw
  return { ...rest, version: 2, pages: [{ id: nanoid(8), background, elements }] }
}

const ELEMENT_TYPES = ['rect', 'ellipse', 'text', 'image', 'path']
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/**
 * Lit et valide le contenu d'un fichier .trame. Lève une Error au message affichable à l'utilisateur.
 * Vérifie la structure (pas la cohérence visuelle) : suffisant pour ne jamais planter l'éditeur.
 */
export function parseDocument(json: string): TrameDocument {
  const invalid = (detail: string): Error => new Error(`Ce fichier n'est pas un projet Trame valide (${detail}).`)
  let raw: any
  try {
    raw = JSON.parse(json)
  } catch {
    throw invalid('JSON illisible')
  }
  if (!raw || typeof raw !== 'object') throw invalid('contenu inattendu')
  if (raw.version !== 1 && raw.version !== 2) {
    throw isNum(raw.version) && raw.version > 2
      ? new Error('Ce projet a été créé avec une version plus récente de Trame. Mettez Trame à jour pour l’ouvrir.')
      : invalid('version inconnue')
  }
  const doc = migrateDocument(raw)
  if (!isNum(doc.width) || !isNum(doc.height) || doc.width <= 0 || doc.height <= 0) throw invalid('dimensions')
  if (!Array.isArray(doc.pages) || doc.pages.length === 0) throw invalid('aucune page')
  for (const page of doc.pages) {
    if (typeof page?.id !== 'string' || typeof page.background !== 'string' || !Array.isArray(page.elements))
      throw invalid('page malformée')
    for (const e of page.elements) {
      if (typeof e?.id !== 'string' || !ELEMENT_TYPES.includes(e.type)) throw invalid('élément inconnu')
      if (![e.x, e.y, e.width, e.height].every(isNum)) throw invalid('élément mal positionné')
    }
  }
  return { ...doc, name: typeof doc.name === 'string' && doc.name ? doc.name : 'Sans titre' }
}

export const selectPage = (s: Pick<EditorState, 'doc' | 'pageId'>): TramePage =>
  s.doc.pages.find((p) => p.id === s.pageId) ?? s.doc.pages[0]

interface EditorState {
  doc: TrameDocument
  pageId: string
  selectedIds: string[]
  filePath?: string
  dirty: boolean
  past: TrameDocument[]
  future: TrameDocument[]

  /** Remplace la sélection (les groupes sont étendus automatiquement). */
  select: (ids: string[]) => void
  toggleSelect: (id: string) => void
  selectAll: () => void
  /** Déplace plusieurs éléments à des positions absolues, sans point d'historique. */
  setPositions: (positions: Record<string, { x: number; y: number }>) => void
  nudgeSelected: (dx: number, dy: number) => void
  groupSelected: () => void
  ungroupSelected: () => void
  align: (mode: AlignMode) => void
  distribute: (axis: 'h' | 'v') => void
  setPage: (id: string) => void
  addPage: () => void
  duplicatePage: (id: string) => void
  removePage: (id: string) => void
  movePage: (id: string, to: number) => void
  addElement: (partial: Partial<TrameElement> & Pick<TrameElement, 'type'>) => void
  /** commit=false pour les mises à jour continues (drag, saisie) : un seul point d'historique via beginChange. */
  updateElement: (id: string, patch: Partial<TrameElement>, commit?: boolean) => void
  beginChange: () => void
  removeSelected: () => void
  duplicateSelected: () => void
  moveLayer: (dir: 'up' | 'down' | 'top' | 'bottom') => void
  setBackground: (color: string) => void
  setSize: (width: number, height: number) => void
  undo: () => void
  redo: () => void
  loadDocument: (doc: TrameDocument, path?: string) => void
  newDocument: () => void
  markSaved: (path: string) => void
}

const defaults: Record<TrameElement['type'], Partial<TrameElement>> = {
  rect: { width: 300, height: 200, fill: '#7c5cff', cornerRadius: 0 },
  ellipse: { width: 240, height: 240, fill: '#ff7a59' },
  text: {
    width: 500,
    height: 80,
    fill: '#1e1f24',
    text: 'Votre texte',
    fontSize: 64,
    fontFamily: '"Inter", sans-serif',
    fontStyle: 'bold',
    align: 'left'
  },
  image: { width: 400, height: 400, fill: '#000000' },
  path: { width: 240, height: 240, fill: '#ffb703' }
}

const initial = blankDoc()

export const useEditor = create<EditorState>((set, get) => {
  /** Applique une transformation à la page courante, sans toucher à l'historique. */
  const mapPage = (f: (p: TramePage) => TramePage): TrameDocument => {
    const { doc, pageId } = get()
    const id = doc.pages.some((p) => p.id === pageId) ? pageId : doc.pages[0].id
    return { ...doc, pages: doc.pages.map((p) => (p.id === id ? f(p) : p)) }
  }

  /** Étend une liste d'ids à tous les membres de leurs groupes. */
  const expand = (ids: string[]): string[] => {
    const els = selectPage(get()).elements
    const groups = new Set(els.filter((e) => ids.includes(e.id) && e.groupId).map((e) => e.groupId))
    return els.filter((e) => ids.includes(e.id) || (e.groupId && groups.has(e.groupId))).map((e) => e.id)
  }

  const selected = (): TrameElement[] => {
    const ids = get().selectedIds
    return selectPage(get()).elements.filter((e) => ids.includes(e.id))
  }

  const moveBy = (deltas: Map<string, { dx: number; dy: number }>): void => {
    set({
      ...snapshot(),
      doc: mapPage((p) => ({
        ...p,
        elements: p.elements.map((e) => {
          const d = deltas.get(e.id)
          return d ? { ...e, x: e.x + d.dx, y: e.y + d.dy } : e
        })
      })),
      dirty: true
    })
  }

  const snapshot = (): Pick<EditorState, 'past' | 'future'> => ({
    past: [...get().past, get().doc].slice(-HISTORY_LIMIT),
    future: []
  })

  return {
    doc: initial,
    pageId: initial.pages[0].id,
    selectedIds: [],
    dirty: false,
    past: [],
    future: [],

    select: (ids) => set({ selectedIds: expand(ids) }),

    toggleSelect: (id) => {
      const cur = get().selectedIds
      const members = expand([id])
      set({ selectedIds: cur.includes(id) ? cur.filter((x) => !members.includes(x)) : [...new Set([...cur, ...members])] })
    },

    selectAll: () => set({ selectedIds: selectPage(get()).elements.map((e) => e.id) }),

    setPositions: (positions) =>
      set({
        doc: mapPage((p) => ({
          ...p,
          elements: p.elements.map((e) => (positions[e.id] ? { ...e, ...positions[e.id] } : e))
        })),
        dirty: true
      }),

    nudgeSelected: (dx, dy) => {
      const els = selected()
      if (els.length) moveBy(new Map(els.map((e) => [e.id, { dx, dy }])))
    },

    groupSelected: () => {
      const ids = get().selectedIds
      if (ids.length < 2) return
      const groupId = nanoid(8)
      set({
        ...snapshot(),
        doc: mapPage((p) => ({ ...p, elements: p.elements.map((e) => (ids.includes(e.id) ? { ...e, groupId } : e)) })),
        dirty: true
      })
    },

    ungroupSelected: () => {
      const ids = get().selectedIds
      set({
        ...snapshot(),
        doc: mapPage((p) => ({
          ...p,
          elements: p.elements.map((e) => {
            if (!ids.includes(e.id) || !e.groupId) return e
            const { groupId: _g, ...rest } = e
            return rest
          })
        })),
        dirty: true
      })
    },

    align: (mode) => {
      const els = selected()
      if (!els.length) return
      // un seul élément : alignement sur la page ; sinon sur la boîte de la sélection
      const { doc } = get()
      const target = els.length === 1 ? { x: 0, y: 0, width: doc.width, height: doc.height } : unionBox(els.map(boundsOf))
      moveBy(alignDeltas(els, mode, target))
    },

    distribute: (axis) => {
      const els = selected()
      if (els.length >= 3) moveBy(distributeDeltas(els, axis))
    },

    setPage: (id) => set({ pageId: id, selectedIds: [] }),

    addPage: () => {
      const page = blankPage()
      const { doc, pageId } = get()
      const i = doc.pages.findIndex((p) => p.id === pageId)
      const pages = [...doc.pages]
      pages.splice(i + 1, 0, page)
      set({ ...snapshot(), doc: { ...doc, pages }, pageId: page.id, selectedIds: [], dirty: true })
    },

    duplicatePage: (id) => {
      const { doc } = get()
      const i = doc.pages.findIndex((p) => p.id === id)
      if (i < 0) return
      const src = doc.pages[i]
      const copy: TramePage = {
        ...src,
        id: nanoid(8),
        elements: src.elements.map((e) => ({ ...e, id: nanoid(8) }))
      }
      const pages = [...doc.pages]
      pages.splice(i + 1, 0, copy)
      set({ ...snapshot(), doc: { ...doc, pages }, pageId: copy.id, selectedIds: [], dirty: true })
    },

    removePage: (id) => {
      const { doc, pageId } = get()
      if (doc.pages.length <= 1) return
      const i = doc.pages.findIndex((p) => p.id === id)
      const pages = doc.pages.filter((p) => p.id !== id)
      set({
        ...snapshot(),
        doc: { ...doc, pages },
        pageId: pageId === id ? pages[Math.min(i, pages.length - 1)].id : pageId,
        selectedIds: [],
        dirty: true
      })
    },

    movePage: (id, to) => {
      const { doc } = get()
      const i = doc.pages.findIndex((p) => p.id === id)
      if (i < 0 || i === to) return
      const pages = [...doc.pages]
      const [p] = pages.splice(i, 1)
      pages.splice(Math.max(0, Math.min(pages.length, to)), 0, p)
      set({ ...snapshot(), doc: { ...doc, pages }, dirty: true })
    },

    addElement: (partial) => {
      const { doc } = get()
      const base = defaults[partial.type]
      const width = partial.width ?? base.width ?? 200
      const height = partial.height ?? base.height ?? 200
      const el: TrameElement = {
        id: nanoid(8),
        x: (doc.width - width) / 2,
        y: (doc.height - height) / 2,
        rotation: 0,
        opacity: 1,
        fill: '#000000',
        ...base,
        ...partial,
        width,
        height
      }
      set({
        ...snapshot(),
        doc: mapPage((p) => ({ ...p, elements: [...p.elements, el] })),
        selectedIds: [el.id],
        dirty: true
      })
    },

    beginChange: () => set(snapshot()),

    updateElement: (id, patch, commit = true) => {
      if (commit) set(snapshot())
      set((s) => ({
        doc: mapPage((p) => ({ ...p, elements: p.elements.map((e) => (e.id === id ? { ...e, ...patch } : e)) })),
        dirty: true
      }))
    },

    removeSelected: () => {
      const { selectedIds } = get()
      if (!selectedIds.length) return
      set({
        ...snapshot(),
        doc: mapPage((p) => ({ ...p, elements: p.elements.filter((e) => !selectedIds.includes(e.id)) })),
        selectedIds: [],
        dirty: true
      })
    },

    duplicateSelected: () => {
      const els = selected()
      if (!els.length) return
      // chaque groupe dupliqué reçoit un nouvel identifiant de groupe
      const groupMap = new Map<string, string>()
      const copies = els.map((e) => {
        let groupId = e.groupId
        if (groupId) {
          if (!groupMap.has(groupId)) groupMap.set(groupId, nanoid(8))
          groupId = groupMap.get(groupId)
        }
        return { ...e, id: nanoid(8), groupId, x: e.x + 30, y: e.y + 30 }
      })
      set({
        ...snapshot(),
        doc: mapPage((p) => ({ ...p, elements: [...p.elements, ...copies] })),
        selectedIds: copies.map((c) => c.id),
        dirty: true
      })
    },

    moveLayer: (dir) => {
      const ids = get().selectedIds
      if (!ids.length) return
      let els = [...selectPage(get()).elements]
      const isSel = (e: TrameElement): boolean => ids.includes(e.id)
      if (dir === 'top') els = [...els.filter((e) => !isSel(e)), ...els.filter(isSel)]
      else if (dir === 'bottom') els = [...els.filter(isSel), ...els.filter((e) => !isSel(e))]
      else if (dir === 'up') {
        for (let i = els.length - 2; i >= 0; i--)
          if (isSel(els[i]) && !isSel(els[i + 1])) [els[i], els[i + 1]] = [els[i + 1], els[i]]
      } else {
        for (let i = 1; i < els.length; i++)
          if (isSel(els[i]) && !isSel(els[i - 1])) [els[i], els[i - 1]] = [els[i - 1], els[i]]
      }
      set({ ...snapshot(), doc: mapPage((p) => ({ ...p, elements: els })), dirty: true })
    },

    setBackground: (background) =>
      set({ ...snapshot(), doc: mapPage((p) => ({ ...p, background })), dirty: true }),

    setSize: (width, height) =>
      set((s) => ({ ...snapshot(), doc: { ...s.doc, width, height }, dirty: true })),

    undo: () => {
      const { past, doc, future, selectedIds } = get()
      if (!past.length) return
      const prev = past[past.length - 1]
      set({
        doc: prev,
        past: past.slice(0, -1),
        future: [doc, ...future],
        pageId: prev.pages.some((p) => p.id === get().pageId) ? get().pageId : prev.pages[0].id,
        selectedIds: selectedIds.filter((id) => prev.pages.some((p) => p.elements.some((e) => e.id === id))),
        dirty: true
      })
    },

    redo: () => {
      const { past, doc, future, selectedIds } = get()
      if (!future.length) return
      const next = future[0]
      set({
        doc: next,
        past: [...past, doc],
        future: future.slice(1),
        pageId: next.pages.some((p) => p.id === get().pageId) ? get().pageId : next.pages[0].id,
        selectedIds: selectedIds.filter((id) => next.pages.some((p) => p.elements.some((e) => e.id === id))),
        dirty: true
      })
    },

    loadDocument: (doc, path) =>
      set({ doc, pageId: doc.pages[0].id, filePath: path, selectedIds: [], past: [], future: [], dirty: false }),

    newDocument: () => {
      const doc = blankDoc()
      set({ doc, pageId: doc.pages[0].id, filePath: undefined, selectedIds: [], past: [], future: [], dirty: false })
    },

    markSaved: (path) => set({ filePath: path, dirty: false })
  }
})
