import { beforeEach, describe, expect, it } from 'vitest'
import { migrateDocument, parseDocument, selectPage, useEditor } from '@/store/editor'

const S = (): ReturnType<typeof useEditor.getState> => useEditor.getState()
const els = (): ReturnType<typeof selectPage>['elements'] => selectPage(S()).elements
const ids = (): string[] => els().map((e) => e.id)

/** Ajoute n rectangles 100×100 espacés ; retourne leurs ids dans l'ordre d'ajout. */
function addRects(n: number): string[] {
  const out: string[] = []
  for (let i = 0; i < n; i++) {
    S().addElement({ type: 'rect', x: i * 200, y: 0, width: 100, height: 100 })
    out.push(S().selectedIds[0])
  }
  return out
}

beforeEach(() => S().newDocument())

describe('éléments', () => {
  it('addElement centre l’élément, le sélectionne et marque le document modifié', () => {
    S().addElement({ type: 'ellipse' })
    const [e] = els()
    expect(e.type).toBe('ellipse')
    expect(e.x).toBeCloseTo((1080 - e.width) / 2)
    expect(S().selectedIds).toEqual([e.id])
    expect(S().dirty).toBe(true)
  })

  it('removeSelected supprime toute la sélection', () => {
    const [a, b, c] = addRects(3)
    S().select([a, b])
    S().removeSelected()
    expect(ids()).toEqual([c])
    expect(S().selectedIds).toEqual([])
  })

  it('updateElement modifie uniquement l’élément ciblé', () => {
    const [a, b] = addRects(2)
    S().updateElement(a, { fill: '#ff0000' })
    expect(els().find((e) => e.id === a)!.fill).toBe('#ff0000')
    expect(els().find((e) => e.id === b)!.fill).not.toBe('#ff0000')
  })
})

describe('historique', () => {
  it('undo/redo restaure l’état précédent puis le suivant', () => {
    S().addElement({ type: 'rect' })
    S().addElement({ type: 'rect' })
    expect(els()).toHaveLength(2)
    S().undo()
    expect(els()).toHaveLength(1)
    S().undo()
    expect(els()).toHaveLength(0)
    S().redo()
    expect(els()).toHaveLength(1)
    S().redo()
    expect(els()).toHaveLength(2)
  })

  it('une nouvelle action vide la pile de rétablissement', () => {
    S().addElement({ type: 'rect' })
    S().undo()
    S().addElement({ type: 'ellipse' })
    expect(S().future).toHaveLength(0)
    S().redo()
    expect(els()).toHaveLength(1)
  })

  it('un geste continu (beginChange + commit=false) ne crée qu’un seul cran', () => {
    const [a] = addRects(1)
    const before = els().find((e) => e.id === a)!.x
    S().beginChange()
    for (let i = 1; i <= 20; i++) S().updateElement(a, { x: before + i }, false)
    expect(els()[0].x).toBe(before + 20)
    S().undo()
    expect(els()[0].x).toBe(before)
  })

  it('undo/redo sans historique ne fait rien', () => {
    const doc = S().doc
    S().undo()
    S().redo()
    expect(S().doc).toBe(doc)
  })

  it('undo retire de la sélection les éléments qui n’existent plus', () => {
    S().addElement({ type: 'rect' })
    expect(S().selectedIds).toHaveLength(1)
    S().undo()
    expect(S().selectedIds).toEqual([])
  })

  it('l’historique est limité à 100 crans', () => {
    for (let i = 0; i < 120; i++) S().addElement({ type: 'rect' })
    expect(S().past).toHaveLength(100)
  })

  it('loadDocument et newDocument réinitialisent l’historique', () => {
    S().addElement({ type: 'rect' })
    S().newDocument()
    expect(S().past).toHaveLength(0)
    expect(S().dirty).toBe(false)
  })
})

describe('sélection et groupes', () => {
  it('toggleSelect ajoute puis retire un élément', () => {
    const [a, b] = addRects(2)
    S().select([a])
    S().toggleSelect(b)
    expect(S().selectedIds).toEqual([a, b])
    S().toggleSelect(b)
    expect(S().selectedIds).toEqual([a])
  })

  it('selectAll sélectionne tous les éléments de la page courante', () => {
    addRects(3)
    S().select([])
    S().selectAll()
    expect(S().selectedIds).toHaveLength(3)
  })

  it('grouper puis sélectionner un membre sélectionne tout le groupe', () => {
    const [a, b, c] = addRects(3)
    S().select([a, b])
    S().groupSelected()
    S().select([a])
    expect(S().selectedIds.sort()).toEqual([a, b].sort())
    S().select([c])
    expect(S().selectedIds).toEqual([c])
  })

  it('groupSelected exige au moins 2 éléments', () => {
    const [a] = addRects(1)
    S().select([a])
    S().groupSelected()
    expect(els()[0].groupId).toBeUndefined()
  })

  it('ungroupSelected retire le groupId', () => {
    const [a, b] = addRects(2)
    S().select([a, b])
    S().groupSelected()
    expect(els().every((e) => e.groupId)).toBe(true)
    S().ungroupSelected()
    expect(els().every((e) => e.groupId === undefined)).toBe(true)
  })

  it('toggleSelect sur un membre de groupe retire tout le groupe', () => {
    const [a, b] = addRects(2)
    S().select([a, b])
    S().groupSelected()
    S().toggleSelect(a)
    expect(S().selectedIds).toEqual([])
  })

  it('dupliquer un groupe crée un nouveau groupe distinct, décalé, et le sélectionne', () => {
    const [a, b] = addRects(2)
    S().select([a, b])
    S().groupSelected()
    const originalGroup = els()[0].groupId
    S().duplicateSelected()
    expect(els()).toHaveLength(4)
    const copies = els().slice(2)
    expect(copies[0].groupId).toBeDefined()
    expect(copies[0].groupId).toBe(copies[1].groupId)
    expect(copies[0].groupId).not.toBe(originalGroup)
    expect(copies[0].x).toBe(els()[0].x + 30)
    expect(S().selectedIds).toEqual(copies.map((c) => c.id))
  })
})

describe('pasteElements', () => {
  const clipboardOf = (n: number): ReturnType<typeof els> => {
    addRects(n)
    return els().map((e) => ({ ...e }))
  }

  it('génère de nouveaux identifiants, sélectionne les copies et décale si elles se superposeraient aux originaux', () => {
    const copied = clipboardOf(2)
    S().pasteElements(copied)
    expect(els()).toHaveLength(4)
    const pasted = els().slice(2)
    expect(pasted.map((e) => e.id)).not.toEqual(copied.map((e) => e.id))
    expect(pasted[0].x).toBe(copied[0].x + 30) // l'original est toujours là : on décale
    expect(S().selectedIds).toEqual(pasted.map((e) => e.id))
  })

  it('un deuxième collage se décale encore', () => {
    const copied = clipboardOf(1)
    S().pasteElements(copied)
    S().pasteElements(copied)
    expect(els().map((e) => e.x)).toEqual([0, 30, 60])
  })

  it('sur une autre page, garde la position d’origine', () => {
    const copied = clipboardOf(2)
    S().addPage()
    S().pasteElements(copied)
    expect(els().map((e) => [e.x, e.y])).toEqual(copied.map((e) => [e.x, e.y]))
  })

  it('après un couper, retombe à la position d’origine', () => {
    const copied = clipboardOf(1)
    S().select([copied[0].id])
    S().removeSelected()
    S().pasteElements(copied)
    expect(els()[0].x).toBe(copied[0].x)
  })

  it('remappe les groupes : les copies forment un nouveau groupe', () => {
    const [a, b] = addRects(2)
    S().select([a, b])
    S().groupSelected()
    const copied = els().map((e) => ({ ...e }))
    S().addPage()
    S().pasteElements(copied)
    const [x, y] = els()
    expect(x.groupId).toBeDefined()
    expect(x.groupId).toBe(y.groupId)
    expect(x.groupId).not.toBe(copied[0].groupId)
  })

  it('recentre des éléments entièrement hors de la page (autre format de document)', () => {
    S().pasteElements([{ ...clipboardOf(1)[0], x: 5000, y: 5000 }])
    const e = els().at(-1)!
    expect(e.x + e.width / 2).toBeCloseTo(1080 / 2)
    expect(e.y + e.height / 2).toBeCloseTo(1080 / 2)
  })

  it('est annulable en un seul cran et ne fait rien avec une liste vide', () => {
    const copied = clipboardOf(2)
    S().pasteElements(copied)
    S().undo()
    expect(els()).toHaveLength(2)
    const before = S().doc
    S().pasteElements([])
    expect(S().doc).toBe(before)
  })
})

describe('calques', () => {
  it('top / bottom conservent l’ordre relatif des éléments sélectionnés', () => {
    const [a, b, c, d] = addRects(4)
    S().select([b, c])
    S().moveLayer('top')
    expect(ids()).toEqual([a, d, b, c])
    S().moveLayer('bottom')
    expect(ids()).toEqual([b, c, a, d])
  })

  it('up / down déplacent d’un cran', () => {
    const [a, b, c] = addRects(3)
    S().select([a])
    S().moveLayer('up')
    expect(ids()).toEqual([b, a, c])
    S().moveLayer('down')
    expect(ids()).toEqual([a, b, c])
  })

  it('up avec une sélection déjà au sommet ne change rien', () => {
    const [a, b] = addRects(2)
    S().select([b])
    S().moveLayer('up')
    expect(ids()).toEqual([a, b])
  })

  it('up déplace un bloc de plusieurs éléments sans les mélanger', () => {
    const [a, b, c, d] = addRects(4)
    S().select([a, b])
    S().moveLayer('up')
    expect(ids()).toEqual([c, a, b, d])
  })
})

describe('alignement', () => {
  it('un seul élément s’aligne sur la page', () => {
    const [a] = addRects(1)
    S().select([a])
    S().align('right')
    expect(els()[0].x).toBe(1080 - 100)
    S().align('vcenter')
    expect(els()[0].y).toBe((1080 - 100) / 2)
  })

  it('plusieurs éléments s’alignent sur leur boîte commune', () => {
    const [a, b] = addRects(2) // x = 0 et 200, largeur 100
    S().select([a, b])
    S().align('right')
    expect(els().map((e) => e.x)).toEqual([200, 200])
  })

  it('distribute ignore moins de 3 éléments', () => {
    const [a, b] = addRects(2)
    S().select([a, b])
    const before = S().doc
    S().distribute('h')
    expect(S().doc).toBe(before)
  })

  it('distribute égalise les écarts de 3 éléments', () => {
    const [a, b, c] = addRects(3)
    S().updateElement(b, { x: 150 })
    S().select([a, b, c])
    S().distribute('h')
    expect(els().map((e) => e.x)).toEqual([0, 200, 400])
  })

  it('nudgeSelected déplace tout le groupe d’un cran d’historique', () => {
    const [a, b] = addRects(2)
    S().select([a, b])
    S().nudgeSelected(5, -3)
    expect(els().map((e) => [e.x, e.y])).toEqual([[5, -3], [205, -3]])
    S().undo()
    expect(els().map((e) => [e.x, e.y])).toEqual([[0, 0], [200, 0]])
  })
})

describe('pages', () => {
  it('addPage insère après la page courante et la sélectionne', () => {
    const first = S().doc.pages[0].id
    S().addPage() // [first, p2], courante = p2
    const p2 = S().pageId
    S().setPage(first)
    S().addPage() // inséré juste après first, pas en fin de liste
    const order = S().doc.pages.map((p) => p.id)
    expect(order).toHaveLength(3)
    expect(order[0]).toBe(first)
    expect(order[1]).toBe(S().pageId)
    expect(order[2]).toBe(p2)
  })

  it('setPage vide la sélection', () => {
    addRects(1)
    S().addPage()
    S().setPage(S().doc.pages[0].id)
    expect(S().selectedIds).toEqual([])
  })

  it('les éléments sont propres à chaque page', () => {
    addRects(2)
    S().addPage()
    expect(els()).toHaveLength(0)
    S().addElement({ type: 'rect' })
    S().setPage(S().doc.pages[0].id)
    expect(els()).toHaveLength(2)
  })

  it('duplicatePage régénère les identifiants des éléments', () => {
    addRects(2)
    const first = S().doc.pages[0]
    S().duplicatePage(first.id)
    const copy = S().doc.pages[1]
    expect(copy.id).not.toBe(first.id)
    expect(copy.elements).toHaveLength(2)
    expect(copy.elements.map((e) => e.id)).not.toEqual(first.elements.map((e) => e.id))
    expect(S().pageId).toBe(copy.id)
  })

  it('removePage conserve toujours au moins une page', () => {
    S().removePage(S().doc.pages[0].id)
    expect(S().doc.pages).toHaveLength(1)
  })

  it('supprimer la page courante bascule sur une page voisine', () => {
    S().addPage()
    const [p1, p2] = S().doc.pages
    S().removePage(p2.id)
    expect(S().pageId).toBe(p1.id)
  })

  it('movePage réordonne', () => {
    S().addPage()
    S().addPage()
    const [a, b, c] = S().doc.pages.map((p) => p.id)
    S().movePage(a, 2)
    expect(S().doc.pages.map((p) => p.id)).toEqual([b, c, a])
  })

  it('annuler un ajout de page retombe sur une page valide', () => {
    S().addPage()
    const added = S().pageId
    S().undo()
    expect(S().doc.pages.some((p) => p.id === added)).toBe(false)
    expect(S().doc.pages.some((p) => p.id === S().pageId)).toBe(true)
  })

  it('setBackground ne modifie que la page courante', () => {
    S().addPage()
    S().setBackground('#123456')
    const [p1, p2] = S().doc.pages
    expect(p2.background).toBe('#123456')
    expect(p1.background).toBe('#ffffff')
  })

  it('setSize s’applique à tout le document', () => {
    S().addPage()
    S().setSize(1920, 1080)
    expect([S().doc.width, S().doc.height]).toEqual([1920, 1080])
  })
})

describe('migrateDocument', () => {
  it('convertit un document v1 (page à plat) en v2', () => {
    const v1 = { version: 1, name: 'Ancien', width: 800, height: 600, background: '#eee', elements: [{ id: 'x', type: 'rect' }] }
    const v2 = migrateDocument(v1)
    expect(v2.version).toBe(2)
    expect(v2.name).toBe('Ancien')
    expect(v2.pages).toHaveLength(1)
    expect(v2.pages[0].background).toBe('#eee')
    expect(v2.pages[0].elements).toEqual(v1.elements)
    expect(v2).not.toHaveProperty('background')
    expect(v2).not.toHaveProperty('elements')
  })

  it('laisse un document v2 intact', () => {
    const doc = S().doc
    expect(migrateDocument(doc)).toBe(doc)
  })
})

describe('parseDocument', () => {
  const valid = (): Record<string, any> => JSON.parse(JSON.stringify(S().doc))
  const withElement = (e: Record<string, any>): string => {
    const d = valid()
    d.pages[0].elements.push(e)
    return JSON.stringify(d)
  }
  const el = { id: 'e1', type: 'rect', x: 0, y: 0, width: 10, height: 10 }

  it('accepte un document v2 valide, y compris après aller-retour JSON', () => {
    addRects(2)
    const doc = parseDocument(JSON.stringify(S().doc))
    expect(doc.pages[0].elements).toHaveLength(2)
  })

  it('accepte et migre un document v1', () => {
    const v1 = { version: 1, name: 'Ancien', width: 800, height: 600, background: '#fff', elements: [el] }
    const doc = parseDocument(JSON.stringify(v1))
    expect(doc.version).toBe(2)
    expect(doc.pages[0].elements).toHaveLength(1)
  })

  it('refuse un JSON illisible ou un contenu qui n’est pas un objet', () => {
    expect(() => parseDocument('{pas du json')).toThrow(/JSON illisible/)
    expect(() => parseDocument('42')).toThrow(/valide/)
    expect(() => parseDocument('null')).toThrow(/valide/)
  })

  it('refuse une version inconnue et signale une version plus récente', () => {
    expect(() => parseDocument(JSON.stringify({ ...valid(), version: 99 }))).toThrow(/plus récente/)
    expect(() => parseDocument(JSON.stringify({ ...valid(), version: 'x' }))).toThrow(/version inconnue/)
    expect(() => parseDocument(JSON.stringify({ name: 'sans version' }))).toThrow(/version inconnue/)
  })

  it('refuse des dimensions invalides', () => {
    expect(() => parseDocument(JSON.stringify({ ...valid(), width: 0 }))).toThrow(/dimensions/)
    expect(() => parseDocument(JSON.stringify({ ...valid(), height: 'grand' }))).toThrow(/dimensions/)
  })

  it('refuse un document sans page ou avec une page malformée', () => {
    expect(() => parseDocument(JSON.stringify({ ...valid(), pages: [] }))).toThrow(/aucune page/)
    expect(() => parseDocument(JSON.stringify({ ...valid(), pages: [{ id: 'p' }] }))).toThrow(/page malformée/)
  })

  it('refuse un élément de type inconnu ou aux coordonnées invalides', () => {
    expect(() => parseDocument(withElement({ ...el, type: 'hologramme' }))).toThrow(/élément inconnu/)
    expect(() => parseDocument(withElement({ ...el, x: 'gauche' }))).toThrow(/mal positionné/)
    expect(() => parseDocument(withElement({ ...el, width: null }))).toThrow(/mal positionné/)
  })

  it('donne un nom par défaut si absent', () => {
    const d = valid()
    delete d.name
    expect(parseDocument(JSON.stringify(d)).name).toBe('Sans titre')
  })
})
