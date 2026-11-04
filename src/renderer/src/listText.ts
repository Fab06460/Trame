import Konva from 'konva'
import type { SceneContext } from 'konva/lib/Context'
import { columnRows, columnWidth } from '@/columnStyle'
import { listIndent, markersFor } from '@/listStyle'
import type { ListKind } from '@/types'

/** Marqueur d'une liste : posé sur la ligne `line` du texte, dans la colonne de retrait. */
export interface ListMarker {
  line: number
  text: string
}

/** Un nœud Konva de texte rendu en liste : le texte est mis en page dans la largeur moins le retrait. */
export type ListTextNode = Konva.Text & { listMarkers?: ListMarker[]; columnRows?: number; _listPatched?: boolean }

const WORD_WRAP_ATTRS = ['fontFamily', 'fontSize', 'fontStyle', 'letterSpacing', 'lineHeight', 'wrap', 'align'] as const

/**
 * Konva n'a ni listes ni colonnes. Un texte-liste ou en colonnes reste UN SEUL nœud (sélection, transformation, ombre, export : rien ne
 * change) dont on adapte quelques méthodes internes :
 * - la mise en page se fait dans la largeur d'une colonne moins le retrait (texte en retrait, lignes suivantes alignées) ;
 * - avec des colonnes, les lignes ainsi obtenues sont réparties en colonnes équilibrées (`columnRows` lignes par colonne, la hauteur du
 *   nœud est celle d'une colonne) et chaque colonne est dessinée à son décalage ;
 * - le dessin trace les marqueurs de liste dans la colonne de retrait, avec la même police et le même interligne.
 * Les attributs `trameList` (« bullet » | « number »), `trameColumns` et `trameColumnGap` pilotent le tout ; sans eux, le nœud se
 * comporte exactement comme un Text.
 */
export function patchListText(node: Konva.Text): void {
  const n = node as ListTextNode
  if (n._listPatched) return
  n._listPatched = true

  const layout = n._setTextData.bind(n) as () => void
  const draw = n._sceneFunc.bind(n) as (ctx: SceneContext) => void
  const naturalHeight = n.getHeight.bind(n) as () => number
  const kindOf = (): ListKind | undefined => n.getAttr('trameList')
  const fixedWidth = (): number | null => (typeof n.attrs.width === 'number' ? n.attrs.width : null)
  const columnCount = (): number => (fixedWidth() === null ? 1 : Math.max(1, Math.round(n.getAttr('trameColumns') ?? 1)))
  const gap = (): number => Math.max(0, n.getAttr('trameColumnGap') ?? 0)
  const indent = (): number => (kindOf() ? listIndent(n.fontSize()) : 0)
  const plain = (): boolean => !kindOf() && columnCount() === 1
  /** Largeur d'une colonne (celle du nœud sans colonnes). */
  const colWidth = (): number => columnWidth(fixedWidth() as number, columnCount(), gap())
  /** Largeur du texte lui-même : une colonne moins le retrait de la liste. */
  const bodyWidth = (): number => Math.max(1, colWidth() - indent())

  /** Exécute `fn` avec la largeur réduite à celle du texte d'une colonne (la vraie est restaurée ensuite, même en cas d'erreur). */
  const withBodyWidth = <T>(fn: () => T): T => {
    const full = fixedWidth()
    if (full === null) return fn()
    n.attrs.width = bodyWidth()
    try {
      return fn()
    } finally {
      n.attrs.width = full
    }
  }

  // la hauteur du nœud est celle d'une colonne (le nombre de lignes de la mise en page complète ne compte plus)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(n as any).getHeight = (): number => (n.columnRows !== undefined && n.attrs.height === undefined ? n.fontSize() * n.columnRows * n.lineHeight() + n.padding() * 2 : naturalHeight())

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(n as any)._setTextData = (): void => {
    if (plain()) {
      n.listMarkers = undefined
      n.columnRows = undefined
      return layout()
    }
    withBodyWidth(layout)
    n.columnRows = columnCount() > 1 ? columnRows(n.textArr.length, columnCount()) : undefined
    const kind = kindOf()
    if (!kind) {
      n.listMarkers = undefined
      return
    }
    // première ligne de chaque paragraphe : chaque paragraphe est mis en page seul, avec les mêmes réglages et la même largeur
    const paragraphs = n.text().split('\n')
    const markers = markersFor(kind, paragraphs)
    const probe = new Konva.Text({ width: fixedWidth() === null ? undefined : bodyWidth() })
    for (const k of WORD_WRAP_ATTRS) probe.setAttr(k, n.getAttr(k))
    let line = 0
    n.listMarkers = []
    paragraphs.forEach((p, i) => {
      if (markers[i]) n.listMarkers!.push({ line, text: markers[i] })
      probe.text(p)
      line += Math.max(1, probe.textArr.length)
    })
    probe.destroy()
  }

  /** Colonne des marqueurs d'une colonne : un texte à part, une ligne vide partout ailleurs, pour tomber exactement sur les mêmes lignes de base. */
  const drawMarkers = (ctx: SceneContext, from: number, to: number): void => {
    const lines: string[] = []
    for (const m of n.listMarkers ?? []) if (m.line >= from && m.line < to) lines[m.line - from] = m.text
    if (!lines.length) return
    const marker = new Konva.Text({
      text: Array.from(lines, (l) => l ?? '').join('\n'),
      width: indent(),
      wrap: 'none',
      align: 'left',
      fill: n.fill(),
      stroke: n.stroke(),
      strokeWidth: n.strokeWidth(),
      strokeEnabled: n.strokeEnabled(),
      dash: n.dash(),
      fontSize: n.fontSize(),
      fontFamily: n.fontFamily(),
      fontStyle: n.fontStyle(),
      letterSpacing: n.letterSpacing(),
      lineHeight: n.lineHeight()
    })
    marker._sceneFunc(ctx)
    marker.destroy()
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(n as any)._sceneFunc = (ctx: SceneContext): void => {
    if (plain()) return draw(ctx)
    const all = n.textArr
    const rows = n.columnRows ?? all.length
    const count = columnCount()
    for (let c = 0; c < count; c++) {
      const part = all.slice(c * rows, (c + 1) * rows)
      if (!part.length) break
      ctx.save()
      ctx.translate(count > 1 ? c * (colWidth() + gap()) : 0, 0)
      ctx.save()
      ctx.translate(indent(), 0)
      n.textArr = part
      try {
        withBodyWidth(() => draw(ctx))
      } finally {
        n.textArr = all
      }
      ctx.restore()
      drawMarkers(ctx, c * rows, c * rows + part.length)
      ctx.restore()
    }
  }

  // le Transformer suit aussi ces attributs (ils changent la taille du nœud)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(n as any)._attrsAffectingSize = [...((n as any)._attrsAffectingSize ?? []), 'trameList', 'trameColumns', 'trameColumnGap']

  // relayout quand on active / désactive la liste ou les colonnes, ou qu'on les change
  n.on('trameListChange trameColumnsChange trameColumnGapChange', () => (n as unknown as { _setTextData(): void })._setTextData())
  ;(n as unknown as { _setTextData(): void })._setTextData()
}
