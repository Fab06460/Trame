import Konva from 'konva'
import type { SceneContext } from 'konva/lib/Context'
import { listIndent, markersFor } from '@/listStyle'
import type { ListKind } from '@/types'

/** Marqueur d'une liste : posé sur la ligne `line` du texte, dans la colonne de retrait. */
export interface ListMarker {
  line: number
  text: string
}

/** Un nœud Konva de texte rendu en liste : le texte est mis en page dans la largeur moins le retrait. */
export type ListTextNode = Konva.Text & { listMarkers?: ListMarker[]; _listPatched?: boolean }

const WORD_WRAP_ATTRS = ['fontFamily', 'fontSize', 'fontStyle', 'letterSpacing', 'lineHeight', 'wrap', 'align'] as const

/**
 * Konva n'a pas de listes. Un texte-liste reste UN SEUL nœud (sélection, transformation, ombre, export : rien ne change) dont on
 * adapte deux méthodes internes : la mise en page se fait dans `largeur − retrait` (texte en retrait, lignes suivies alignées), et le
 * dessin décale le texte du retrait puis trace les marqueurs dans la colonne laissée libre, avec la même police et le même interligne.
 * L'attribut `trameList` (« bullet » | « number » | absent) pilote le tout ; sans lui, le nœud se comporte exactement comme un Text.
 */
export function patchListText(node: Konva.Text): void {
  const n = node as ListTextNode
  if (n._listPatched) return
  n._listPatched = true

  const layout = n._setTextData.bind(n) as () => void
  const draw = n._sceneFunc.bind(n) as (ctx: SceneContext) => void
  const kindOf = (): ListKind | undefined => n.getAttr('trameList')
  const fixedWidth = (): number | null => (typeof n.attrs.width === 'number' ? n.attrs.width : null)

  /** Exécute `fn` avec la largeur réduite du retrait (la vraie est restaurée ensuite, même en cas d'erreur). */
  const withBodyWidth = <T>(fn: () => T): T => {
    const full = fixedWidth()
    if (full === null) return fn()
    n.attrs.width = Math.max(1, full - listIndent(n.fontSize()))
    try {
      return fn()
    } finally {
      n.attrs.width = full
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(n as any)._setTextData = (): void => {
    const kind = kindOf()
    if (!kind) {
      n.listMarkers = undefined
      return layout()
    }
    withBodyWidth(layout)
    // première ligne de chaque paragraphe : chaque paragraphe est mis en page seul, avec les mêmes réglages et la même largeur
    const paragraphs = n.text().split('\n')
    const markers = markersFor(kind, paragraphs)
    const body = fixedWidth() === null ? undefined : Math.max(1, (fixedWidth() as number) - listIndent(n.fontSize()))
    const probe = new Konva.Text({ width: body })
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(n as any)._sceneFunc = (ctx: SceneContext): void => {
    if (!kindOf()) return draw(ctx)
    ctx.save()
    ctx.translate(listIndent(n.fontSize()), 0)
    withBodyWidth(() => draw(ctx))
    ctx.restore()
    if (!n.listMarkers?.length) return
    // colonne des marqueurs : un texte à part, une ligne vide partout ailleurs, pour tomber exactement sur les mêmes lignes de base
    const lines: string[] = []
    for (const m of n.listMarkers) lines[m.line] = m.text
    const marker = new Konva.Text({
      text: Array.from(lines, (l) => l ?? '').join('\n'),
      width: listIndent(n.fontSize()),
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

  // relayout quand on active / désactive la liste ou qu'on la change
  n.on('trameListChange', () => (n as unknown as { _setTextData(): void })._setTextData())
  ;(n as unknown as { _setTextData(): void })._setTextData()
}
