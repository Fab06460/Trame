import { limitNotes, sanitizeNotes } from '@/notes'
import { cleanPageTransition, cleanTransition, type PageTransition } from '@/transition'
import { create } from 'zustand'
import { nanoid } from 'nanoid'
import { sanitizeGradient } from '@/gradient'
import { adaptDocument } from '@/magicResize'
import { registerEmbeddedFonts } from '@/fonts'
import { sanitizeFrame } from '@/magicResize'
import { allowedPatch, isEnforced, positionLocked, sanitizeProtection } from '@/protection'
import { sanitizeFonts } from '@/fontEmbed'
import { sanitizeImageField, sanitizeMergeData } from '@/mailMerge'
import { sanitizeChart } from '@/chart'
import { sanitizeQr } from '@/qr'
import { sanitizeComments, withoutComments } from '@/review'
import { sanitizeSources } from '@/pdfSources'
import { cleanDocName } from '@/docName'
import { sanitizeColumns } from '@/columnStyle'
import { sanitizeList } from '@/listStyle'
import { sanitizeImageStyle } from '@/imageStyle'
import { sanitizeShadow } from '@/shadowStyle'
import { sanitizeStroke } from '@/strokeStyle'
import { sanitizeTextStyle } from '@/textStyle'
import { alignDeltas, distributeDeltas, unionBox, boundsOf, type AlignMode } from '@/geometry'
import { flipPatches, isFlipExempt, type FlipAxis } from '@/flip'
import { sameTypeIds, tabTarget } from '@/selection'
import { sanitizePrintSetup } from '@/printSetup'
import type { Guide, MergeData, MergeSettings, Protection, TrameDocument, TrameElement, TramePage } from '@/types'
import { t } from '@/i18n'
import { sanitizeAiInfo, sanitizeAlt } from '@/aiImage'
import { sanitizeDecorative } from '@/altCheck'

const HISTORY_LIMIT = 100

const blankPage = (): TramePage => ({ id: nanoid(8), background: '#ffffff', elements: [] })

const blankDoc = (): TrameDocument => ({
  version: 2,
  name: t('doc.untitled'),
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

const isGuide = (g: any): g is Guide => !!g && (g.orientation === 'h' || g.orientation === 'v') && isNum(g.position)

/** Vrai si `e` a la structure minimale d'un élément (utilisé à l'ouverture d'un fichier et au collage). */
export function isElement(e: any): e is TrameElement {
  return (
    !!e && typeof e.id === 'string' && ELEMENT_TYPES.includes(e.type) && [e.x, e.y, e.width, e.height].every(isNum)
  )
}

/**
 * Lit et valide le contenu d'un fichier .trame. Lève une Error au message affichable à l'utilisateur.
 * Vérifie la structure (pas la cohérence visuelle) : suffisant pour ne jamais planter l'éditeur.
 */
export function parseDocument(json: string): TrameDocument {
  const invalid = (detail: string): Error => new Error(t('file.invalid', { detail }))
  let raw: any
  try {
    raw = JSON.parse(json)
  } catch {
    throw invalid(t('file.invalid.json'))
  }
  if (!raw || typeof raw !== 'object') throw invalid(t('file.invalid.content'))
  if (raw.version !== 1 && raw.version !== 2) {
    throw isNum(raw.version) && raw.version > 2
      ? new Error(t('file.newer'))
      : invalid(t('file.invalid.version'))
  }
  const doc = migrateDocument(raw)
  if (!isNum(doc.width) || !isNum(doc.height) || doc.width <= 0 || doc.height <= 0) throw invalid(t('file.invalid.size'))
  if (!Array.isArray(doc.pages) || doc.pages.length === 0) throw invalid(t('file.invalid.noPage'))
  for (const page of doc.pages) {
    if (typeof page?.id !== 'string' || typeof page.background !== 'string' || !Array.isArray(page.elements))
      throw invalid(t('file.invalid.page'))
    // repères : optionnels ; une entrée invalide est ignorée plutôt que de refuser tout le fichier
    if (page.guides !== undefined) {
      const ok = (Array.isArray(page.guides) ? page.guides : []).filter(isGuide)
      if (ok.length) page.guides = ok
      else delete page.guides
    }
    sanitizeNotes(page)
    sanitizeComments(page, doc.width, doc.height)
    {
      const t = cleanPageTransition(page.transition)
      if (t) page.transition = t
      else delete page.transition
    }
    for (const e of page.elements) {
      if (typeof e?.id !== 'string' || !ELEMENT_TYPES.includes(e.type)) throw invalid(t('file.invalid.element'))
      if (!isElement(e)) throw invalid(t('file.invalid.position'))
      // indicateurs de calque : seules les valeurs attendues sont retenues (un « locked: "oui" » ne doit rien verrouiller)
      sanitizeTextStyle(e)
      sanitizeStroke(e)
      sanitizeGradient(e)
      sanitizeShadow(e)
      sanitizeList(e)
      sanitizeColumns(e)
      if (e.type !== 'path' || e.fillRule !== 'evenodd') delete e.fillRule
      if (e.type === 'image') sanitizeImageStyle(e)
      sanitizeAiInfo(e)
      sanitizeImageField(e)
      sanitizeChart(e)
      sanitizeQr(e)
      sanitizeAlt(e)
      sanitizeDecorative(e)
      if (e.locked !== true) delete e.locked
      sanitizeProtection(e)
      if (e.hidden !== true) delete e.hidden
      if (typeof e.name !== 'string' || !e.name.trim()) delete e.name
      else e.name = e.name.slice(0, 80)
    }
  }
  sanitizeSources(doc as unknown as Parameters<typeof sanitizeSources>[0])
  sanitizeFonts(doc)
  sanitizeFrame(doc)
  sanitizePrintSetup(doc)
  sanitizeMergeData(doc)
  const transition = cleanTransition(doc.transition)
  if (transition) doc.transition = transition
  else delete doc.transition
  return { ...doc, name: cleanDocName(doc.name) }
}

export const selectPage = (s: Pick<EditorState, 'doc' | 'pageId'>): TramePage =>
  s.doc.pages.find((p) => p.id === s.pageId) ?? s.doc.pages[0]

/** Modèle dont le document actuel est parti (appliqué depuis l'onglet Modèles) : permet de proposer de le remplacer à l'enregistrement. */
export interface TemplateOrigin {
  kind: 'builtin' | 'user'
  id: string
  name: string
}

interface EditorState {
  templateOrigin: TemplateOrigin | null
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
  /** Sélectionne exactement ces éléments, sans étendre aux groupes : un membre seul = on est « dans » le groupe. */
  selectExact: (ids: string[]) => void
  /** Tout ce qui est du même type que l'élément (rien pour un graphique ou un QR code). */
  selectSameType: (id: string) => void
  /** Tab / Maj + Tab : sélection suivante ou précédente. Retourne false quand on sort de la liste (la sélection est alors vidée). */
  selectNext: (dir: 1 | -1) => boolean
  /** Déplace plusieurs éléments à des positions absolues, sans point d'historique. */
  setPositions: (positions: Record<string, { x: number; y: number }>) => void
  nudgeSelected: (dx: number, dy: number) => void
  groupSelected: () => void
  ungroupSelected: () => void
  align: (mode: AlignMode) => void
  distribute: (axis: 'h' | 'v') => void
  /** Retourne la sélection comme un miroir (voir `flip.ts`) ; une seule étape d'historique. */
  flipSelected: (axis: FlipAxis) => void
  setPage: (id: string) => void
  addPage: () => void
  duplicatePage: (id: string) => void
  removePage: (id: string) => void
  movePage: (id: string, to: number) => void
  /** `edit` : un texte créé par l'utilisateur s'ouvre directement en saisie, son contenu par défaut sélectionné (le premier caractère tapé le remplace) */
  addElement: (partial: Partial<TrameElement> & Pick<TrameElement, 'type'>, opts?: { edit?: boolean }) => void
  /** identifiant du texte à passer en saisie dès que le canvas l'affiche (consommé par le canvas) */
  editRequest: string | null
  clearEditRequest: () => void
  /** commit=false pour les mises à jour continues (drag, saisie) : un seul point d'historique via beginChange. */
  updateElement: (id: string, patch: Partial<TrameElement>, commit?: boolean) => void
  /** descriptions d'images, sur toutes les pages, en un seul pas d'historique ; renvoie le nombre appliqué */
  setImageAlts: (changes: Array<{ id: string; alt: string }>) => number
  /** affiche la page de l'élément et le sélectionne */
  revealElement: (pageId: string, elementId: string) => void
  beginChange: () => void
  removeSelected: () => void
  /** Remplace le texte de plusieurs éléments (toutes pages) en un seul cran d'historique ; un élément figé par le modèle est ignoré et compté. */
  replaceTexts: (changes: Array<{ elementId: string; text: string }>) => { replaced: number; skipped: number }
  /** Modifie plusieurs éléments (toutes pages) en un seul cran d'historique ; un élément protégé par le modèle est ignoré et compté. */
  patchElements: (changes: Array<{ elementId: string; patch: Partial<TrameElement> }>) => { changed: number; skipped: number }
  /** Ajoute les éléments d'un graphique ou d'un tableau (déjà groupés) en haut de la page courante et les sélectionne. */
  insertChart: (elements: TrameElement[]) => void
  /** Remplace les éléments du groupe de ce graphique par de nouveaux (même place dans la pile), un seul cran d'historique. */
  replaceChart: (anchorId: string, elements: TrameElement[]) => void
  /** Remet les textes d'une page dans l'ordre donné (les autres éléments gardent leur place : seul l'ordre des textes entre eux change). */
  setTextOrder: (pageId: string, orderedIds: string[]) => void
  /** modèle de marque : vrai pendant la modification du modèle (les éléments protégés sont alors modifiables) */
  templateUnlocked: boolean
  setTemplateUnlocked: (unlocked: boolean) => void
  /** marque les éléments sélectionnés « figé » / « à remplir » (ou libre) ; ouvre la modification du modèle */
  setProtection: (protect: Protection | undefined) => void
  /** Verrouille la sélection ; si tout est déjà verrouillé, la déverrouille. */
  toggleLockSelected: () => void
  /** Active ou retire un indicateur de calque (`hidden` / `locked`) ; l'indicateur est supprimé du fichier quand il est retiré. */
  setLayerFlag: (id: string, flag: 'hidden' | 'locked', on: boolean) => void
  /** Place un élément à l'indice `toIndex` de l'ordre de superposition (0 = tout au fond). */
  reorderElement: (id: string, toIndex: number) => void
  duplicateSelected: () => void
  /**
   * Alt + glisser : laisse derrière une copie de la sélection, à la même place et juste en dessous des originaux
   * (qui restent sélectionnés, et sont ceux que l'on déplace). Un seul cran d'historique, avec le déplacement qui suit.
   */
  cloneSelectedInPlace: () => void
  /** Colle des éléments (copiés de Trame) dans la page courante, avec de nouveaux identifiants. */
  pasteElements: (elements: TrameElement[]) => void
  moveLayer: (dir: 'up' | 'down' | 'top' | 'bottom') => void
  setBackground: (color: string) => void
  /** Modifie les repères de la page courante. `commit=false` pour un geste continu (après un `beginChange`). */
  updateGuides: (f: (guides: Guide[]) => Guide[], commit?: boolean) => void
  /** Notes de l'orateur de la page courante ; `commit` ouvre un cran d'historique (une seule fois par séance de frappe). */
  setNotes: (text: string, commit?: boolean) => void
  /** Transition de présentation du document (réglage : pas d'historique, mais le document est marqué modifié). */
  /** Données du publipostage du document (null : les retire). Un pas d'historique. */
  setMergeData: (data: MergeData | null) => void
  /** Derniers choix d'export du publipostage, gardés avec le document (pas d'historique ; le document est marqué modifié seulement si quelque chose change). */
  setMergeSettings: (settings: MergeSettings) => void
  setTransition: (transition: PageTransition) => void
  /** Transition d'une page (`null` : revient à celle du document). */
  setPageTransition: (pageId: string, transition: PageTransition | null) => void
  /** Une même transition pour tout le document : réglage par défaut, et les transitions propres à chaque page sont retirées. */
  applyTransitionToAll: (transition: PageTransition) => void
  setSize: (width: number, height: number) => void
  setName: (name: string) => void
  /** change le format ; `adapt` reporte le contenu dans le nouveau format (Magic Resize) au lieu de ne toucher qu'à la taille de la page */
  resizeDocument: (width: number, height: number, adapt: boolean) => void
  undo: () => void
  redo: () => void
  loadDocument: (doc: TrameDocument, path?: string) => void
  /** Remplace tout le contenu du document (retour à une version, fusion…) en un cran d'historique : on peut annuler. Le fichier associé est conservé. */
  replaceDocument: (doc: TrameDocument) => void
  /** Modification du document entier en un cran d'historique (commentaires de relecture, fusion…). Rien si `f` rend le même document. */
  editDocument: (f: (doc: TrameDocument) => TrameDocument) => void
  /** À appeler juste après loadDocument quand le document vient d'un modèle (loadDocument remet l'origine à zéro). */
  setTemplateOrigin: (origin: TemplateOrigin | null) => void
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
    text: '', // remplacé à la création par le texte par défaut de la langue courante (voir addElement)
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

  const enforcedNow = (): boolean => isEnforced(get().doc, get().templateUnlocked)

  /** Éléments sélectionnés dont la position n'est pas verrouillée (calque ou modèle) : les seuls que déplacer, aligner ou supprimer peut toucher. */
  const movable = (): TrameElement[] => {
    const enforced = enforcedNow()
    return selected().filter((e) => !positionLocked(e, enforced))
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
    templateOrigin: null,
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

    selectExact: (ids) => set({ selectedIds: ids }),

    selectSameType: (id) => {
      const els = selectPage(get()).elements
      const ref = els.find((e) => e.id === id)
      if (ref) set({ selectedIds: expand(sameTypeIds(els, ref)) })
    },

    selectNext: (dir) => {
      const ids = tabTarget(selectPage(get()).elements, get().selectedIds, dir)
      set({ selectedIds: ids ?? [] })
      return ids !== null
    },

    selectAll: () => set({ selectedIds: selectPage(get()).elements.filter((e) => !e.hidden).map((e) => e.id) }),

    setPositions: (positions) =>
      set({
        doc: mapPage((p) => ({
          ...p,
          elements: p.elements.map((e) => (positions[e.id] ? { ...e, ...positions[e.id] } : e))
        })),
        dirty: true
      }),

    nudgeSelected: (dx, dy) => {
      const els = movable()
      if (els.length) moveBy(new Map(els.map((e) => [e.id, { dx, dy }])))
    },

    groupSelected: () => {
      if (enforcedNow() && selected().some((e) => e.protect)) return
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
      if (enforcedNow() && selected().some((e) => e.protect)) return
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
      const els = movable()
      if (!els.length) return
      // un seul élément : alignement sur la page ; sinon sur la boîte de la sélection
      const { doc } = get()
      const target = els.length === 1 ? { x: 0, y: 0, width: doc.width, height: doc.height } : unionBox(els.map(boundsOf))
      moveBy(alignDeltas(els, mode, target))
    },

    distribute: (axis) => {
      const els = movable()
      if (els.length >= 3) moveBy(distributeDeltas(els, axis))
    },

    flipSelected: (axis) => {
      const all = selectPage(get()).elements
      const els = movable().filter((e) => !isFlipExempt(e, all))
      if (!els.length) return
      const patches = flipPatches(els, axis)
      set({
        ...snapshot(),
        doc: mapPage((p) => ({ ...p, elements: p.elements.map((e) => (patches.has(e.id) ? { ...e, ...patches.get(e.id) } : e)) })),
        dirty: true
      })
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
        ...withoutComments(src),
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

    editRequest: null,
    clearEditRequest: () => set({ editRequest: null }),

    addElement: (partial, opts) => {
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
      if (el.type === 'text' && partial.text === undefined) el.text = t('el.defaultText')
      set({
        ...snapshot(),
        doc: mapPage((p) => ({ ...p, elements: [...p.elements, el] })),
        selectedIds: [el.id],
        editRequest: opts?.edit && el.type === 'text' ? el.id : null,
        dirty: true
      })
    },

    beginChange: () => set(snapshot()),

    updateElement: (id, requested, commit = true) => {
      // élément protégé par le modèle : seules les modifications de contenu passent (figé : aucune)
      const target = selectPage(get()).elements.find((e) => e.id === id)
      const patch = target ? allowedPatch(target, requested, enforcedNow()) : requested
      if (!patch) return
      if (commit) set(snapshot())
      set((s) => ({
        doc: mapPage((p) => ({ ...p, elements: p.elements.map((e) => (e.id === id ? { ...e, ...patch } : e)) })),
        dirty: true
      }))
    },

    setImageAlts: (changes) => {
      const wanted = new Map(changes.map((c) => [c.id, c.alt]))
      const enforced = enforcedNow()
      let applied = 0
      const pages = get().doc.pages.map((p) => ({
        ...p,
        elements: p.elements.map((e) => {
          const alt = wanted.get(e.id)
          if (alt === undefined || e.type !== 'image' || !allowedPatch(e, { alt }, enforced)) return e
          applied += 1
          const { decorative: _d, ...rest } = e
          return { ...rest, alt }
        })
      }))
      if (applied > 0) set({ ...snapshot(), doc: { ...get().doc, pages }, dirty: true })
      return applied
    },

    revealElement: (pageId, elementId) => set({ pageId, selectedIds: [elementId] }),

    removeSelected: () => {
      // un élément verrouillé ne se supprime pas : il faut d'abord le déverrouiller (il reste sélectionné)
      const doomed = movable().map((e) => e.id)
      if (!doomed.length) return
      set({
        ...snapshot(),
        doc: mapPage((p) => ({ ...p, elements: p.elements.filter((e) => !doomed.includes(e.id)) })),
        selectedIds: get().selectedIds.filter((id) => !doomed.includes(id)),
        dirty: true
      })
    },

    replaceTexts: (changes) => {
      const enforced = enforcedNow()
      const wanted = new Map(changes.map((c) => [c.elementId, c.text]))
      let replaced = 0
      let skipped = 0
      const pages = get().doc.pages.map((p) => ({
        ...p,
        elements: p.elements.map((e) => {
          const text = wanted.get(e.id)
          if (text === undefined || text === e.text) return e
          if (!allowedPatch(e, { text }, enforced)) {
            skipped += 1
            return e
          }
          replaced += 1
          return { ...e, text }
        })
      }))
      if (replaced > 0) set({ ...snapshot(), doc: { ...get().doc, pages }, dirty: true })
      return { replaced, skipped }
    },

    patchElements: (changes) => {
      const enforced = enforcedNow()
      const wanted = new Map(changes.map((c) => [c.elementId, c.patch]))
      let changed = 0
      let skipped = 0
      const pages = get().doc.pages.map((p) => ({
        ...p,
        elements: p.elements.map((e) => {
          const patch = wanted.get(e.id)
          if (!patch) return e
          const allowed = allowedPatch(e, patch, enforced)
          if (!allowed) {
            skipped += 1
            return e
          }
          changed += 1
          const next = { ...e, ...allowed } as TrameElement
          // une clé à `undefined` disparaît du fichier
          for (const k of Object.keys(allowed) as Array<keyof TrameElement>) if (next[k] === undefined) delete next[k]
          return next
        })
      }))
      if (changed > 0) set({ ...snapshot(), doc: { ...get().doc, pages }, dirty: true })
      return { changed, skipped }
    },

    insertChart: (elements) => {
      if (!elements.length) return
      set({ ...snapshot(), doc: mapPage((p) => ({ ...p, elements: [...p.elements, ...elements] })), selectedIds: elements.map((e) => e.id), editRequest: null, dirty: true })
    },

    replaceChart: (anchorId, elements) => {
      const page = selectPage(get())
      const anchor = page.elements.find((e) => e.id === anchorId)
      if (!anchor?.groupId || !elements.length || (enforcedNow() && page.elements.some((e) => e.groupId === anchor.groupId && e.protect))) return
      const at = page.elements.findIndex((e) => e.groupId === anchor.groupId)
      const rest = page.elements.filter((e) => e.groupId !== anchor.groupId)
      const next = [...rest.slice(0, at), ...elements, ...rest.slice(at)]
      set({ ...snapshot(), doc: mapPage((p) => ({ ...p, elements: next })), selectedIds: elements.map((e) => e.id), dirty: true })
    },

    setTextOrder: (pageId, orderedIds) => {
      const page = get().doc.pages.find((p) => p.id === pageId)
      if (!page) return
      const enforced = enforcedNow()
      const slots = page.elements.map((e, i) => (e.type === 'text' && orderedIds.includes(e.id) ? i : -1)).filter((i) => i >= 0)
      const byId = new Map(page.elements.map((e) => [e.id, e]))
      const ordered = orderedIds.map((id) => byId.get(id)).filter((e): e is TrameElement => !!e && e.type === 'text')
      if (ordered.length !== slots.length || (enforced && ordered.some((e) => e.protect))) return
      const elements = [...page.elements]
      slots.forEach((slot, k) => (elements[slot] = ordered[k]))
      if (elements.every((e, i) => e === page.elements[i])) return
      set({ ...snapshot(), doc: { ...get().doc, pages: get().doc.pages.map((p) => (p.id === pageId ? { ...p, elements } : p)) }, dirty: true })
    },

    templateUnlocked: false,
    setTemplateUnlocked: (templateUnlocked) => set({ templateUnlocked }),
    setProtection: (protect) => {
      if (enforcedNow()) return // modèle verrouillé : on commence par « Modifier le modèle »
      const ids = get().selectedIds
      if (!ids.length) return
      set({
        ...snapshot(),
        doc: mapPage((p) => ({
          ...p,
          elements: p.elements.map((e) => {
            if (!ids.includes(e.id)) return e
            if (protect) return { ...e, protect }
            const { protect: _off, ...rest } = e
            return rest
          })
        })),
        // on est en train de bâtir le modèle : les éléments protégés restent modifiables jusqu'à « Terminer »
        templateUnlocked: protect ? true : get().templateUnlocked,
        dirty: true
      })
    },

    toggleLockSelected: () => {
      const enforced = enforcedNow()
      const els = selected().filter((e) => !(enforced && e.protect)) // le verrou de calque d'un élément protégé ne se change pas
      if (!els.length) return
      const lock = !els.every((e) => e.locked) // tous verrouillés → on déverrouille, sinon on verrouille tout
      const ids = els.map((e) => e.id)
      set({
        ...snapshot(),
        doc: mapPage((p) => ({
          ...p,
          elements: p.elements.map((e) => {
            if (!ids.includes(e.id)) return e
            if (lock) return { ...e, locked: true }
            const { locked: _unlocked, ...rest } = e
            return rest
          })
        })),
        dirty: true
      })
    },

    setLayerFlag: (id, flag, on) => {
      const cur = selectPage(get()).elements.find((e) => e.id === id)
      if (!cur || Boolean(cur[flag]) === on || (enforcedNow() && cur.protect)) return
      set({
        ...snapshot(),
        doc: mapPage((p) => ({
          ...p,
          elements: p.elements.map((e) => {
            if (e.id !== id) return e
            if (on) return { ...e, [flag]: true }
            const { [flag]: _off, ...rest } = e
            return rest
          })
        })),
        dirty: true
      })
    },

    reorderElement: (id, toIndex) => {
      const els = [...selectPage(get()).elements]
      const from = els.findIndex((e) => e.id === id)
      if (from < 0 || (enforcedNow() && els[from].protect)) return
      const [el] = els.splice(from, 1)
      els.splice(Math.max(0, Math.min(els.length, toIndex)), 0, el)
      if (els.every((e, i) => e === selectPage(get()).elements[i])) return // aucun changement : pas de cran d'historique
      set({ ...snapshot(), doc: mapPage((p) => ({ ...p, elements: els })), dirty: true })
    },

    duplicateSelected: () => {
      const enforced = enforcedNow()
      const els = selected().filter((e) => !(enforced && e.protect)) // un élément protégé ne se duplique pas tant que le modèle est verrouillé
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

    cloneSelectedInPlace: () => {
      const enforced = enforcedNow()
      const ids = selected().filter((e) => !(enforced && e.protect)).map((e) => e.id)
      if (!ids.length) return
      const groupMap = new Map<string, string>()
      const copyOf = (e: TrameElement): TrameElement => {
        let groupId = e.groupId
        if (groupId) {
          if (!groupMap.has(groupId)) groupMap.set(groupId, nanoid(8))
          groupId = groupMap.get(groupId)
        }
        return { ...e, id: nanoid(8), groupId }
      }
      set({
        ...snapshot(),
        doc: mapPage((p) => ({ ...p, elements: p.elements.flatMap((e) => (ids.includes(e.id) ? [copyOf(e), e] : [e])) })),
        dirty: true
      })
    },

    pasteElements: (pasted) => {
      // une copie est un nouvel élément : il ne garde jamais la protection du modèle d'où il vient
      const elements = pasted.map(({ protect: _p, ...rest }) => rest as TrameElement)
      if (!elements.length) return
      const { doc } = get()
      const existing = selectPage(get()).elements
      const box = unionBox(elements.map(boundsOf))
      // Même page que la copie : on décale jusqu'à ce que la copie ne se superpose plus pile à un élément existant.
      // Page ou document différents : position d'origine, sauf si tout est hors de la page (autre format) → centré.
      const lands = (dx: number, dy: number): boolean =>
        existing.some((o) => elements.some((e) => o.x === e.x + dx && o.y === e.y + dy && o.width === e.width && o.height === e.height))
      let dx = 0
      let dy = 0
      const outside = box.x >= doc.width || box.y >= doc.height || box.x + box.width <= 0 || box.y + box.height <= 0
      if (outside) {
        dx = (doc.width - box.width) / 2 - box.x
        dy = (doc.height - box.height) / 2 - box.y
      }
      for (let i = 0; i < 50 && lands(dx, dy); i++) {
        dx += 30
        dy += 30
      }
      const groupMap = new Map<string, string>()
      const copies = elements.map((e) => {
        let groupId = e.groupId
        if (groupId) {
          if (!groupMap.has(groupId)) groupMap.set(groupId, nanoid(8))
          groupId = groupMap.get(groupId)
        }
        return { ...e, id: nanoid(8), groupId, x: e.x + dx, y: e.y + dy }
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
      if (!ids.length || (enforcedNow() && selected().some((e) => e.protect))) return
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

    updateGuides: (f, commit = true) => {
      if (commit) set(snapshot())
      set({ doc: mapPage((p) => ({ ...p, guides: f(p.guides ?? []) })), dirty: true })
    },

    setMergeData: (data) =>
      set((s) => {
        const { mailMerge: _old, ...rest } = s.doc
        void _old
        return { ...snapshot(), doc: data ? { ...rest, mailMerge: data } : rest, dirty: true }
      }),

    setMergeSettings: (settings) =>
      set((s) => {
        const data = s.doc.mailMerge
        if (!data || JSON.stringify(data.settings) === JSON.stringify(settings)) return {}
        return { doc: { ...s.doc, mailMerge: { ...data, settings } }, dirty: true }
      }),

    setTransition: (transition) =>
      set((s) => {
        const { transition: _old, ...rest } = s.doc
        void _old
        const next = cleanTransition(transition)
        return { doc: next ? { ...rest, transition: next } : rest, dirty: true }
      }),

    setPageTransition: (pageId, transition) =>
      set((s) => ({
        ...snapshot(),
        doc: {
          ...s.doc,
          pages: s.doc.pages.map((p) => {
            if (p.id !== pageId) return p
            const { transition: _old, ...rest } = p
            void _old
            return transition ? { ...rest, transition } : rest
          })
        },
        dirty: true
      })),

    applyTransitionToAll: (transition) =>
      set((s) => {
        const { transition: _old, ...rest } = s.doc
        void _old
        const next = cleanTransition(transition)
        return {
          ...snapshot(),
          doc: { ...(next ? { ...rest, transition: next } : rest), pages: s.doc.pages.map(({ transition: _t, ...p }) => (void _t, p)) },
          dirty: true
        }
      }),

    setNotes: (text, commit = true) => {
      if (commit) set(snapshot())
      const notes = limitNotes(text)
      set({
        doc: mapPage((p) => {
          const { notes: _old, ...rest } = p
          void _old
          return notes === undefined ? rest : { ...rest, notes }
        }),
        dirty: true
      })
    },

    setBackground: (background) =>
      set({ ...snapshot(), doc: mapPage((p) => ({ ...p, background })), dirty: true }),

    setSize: (width, height) =>
      set((s) => ({ ...snapshot(), doc: { ...s.doc, width, height }, dirty: true })),

    resizeDocument: (width, height, adapt) =>
      set((s) => {
        // sans adaptation, le contenu ne bouge pas : l'ancien cadre de composition n'a plus de sens
        const { layoutFrame: _drop, ...plain } = s.doc
        void _drop
        const next = adapt ? adaptDocument(s.doc, width, height) : { ...plain, width, height }
        return next.width === s.doc.width && next.height === s.doc.height ? s : { ...snapshot(), doc: next, selectedIds: [], dirty: true }
      }),

    setName: (raw) =>
      set((s) => {
        const name = cleanDocName(raw)
        return name === s.doc.name ? s : { ...snapshot(), doc: { ...s.doc, name }, dirty: true }
      }),

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

    loadDocument: (doc, path) => {
      void registerEmbeddedFonts(doc.fonts)
      set({ templateUnlocked: false })
      set({ doc, pageId: doc.pages[0].id, filePath: path, selectedIds: [], past: [], future: [], dirty: false, templateOrigin: null })
    },

    replaceDocument: (doc) => {
      void registerEmbeddedFonts(doc.fonts)
      const pageId = doc.pages.some((p) => p.id === get().pageId) ? get().pageId : doc.pages[0].id
      set({ ...snapshot(), doc, pageId, selectedIds: [], dirty: true })
    },

    editDocument: (f) => {
      const next = f(get().doc)
      if (next === get().doc) return
      set({ ...snapshot(), doc: next, dirty: true })
    },

    newDocument: () => {
      const doc = blankDoc()
      set({ templateUnlocked: false })
      set({ doc, pageId: doc.pages[0].id, filePath: undefined, selectedIds: [], past: [], future: [], dirty: false, templateOrigin: null })
    },

    setTemplateOrigin: (templateOrigin) => set({ templateOrigin }),

    markSaved: (path) => set({ filePath: path, dirty: false })
  }
})
