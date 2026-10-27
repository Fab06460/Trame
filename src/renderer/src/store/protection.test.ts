import { beforeEach, describe, expect, it } from 'vitest'
import { selectPage, useEditor } from '@/store/editor'
import type { TrameDocument, TrameElement } from '@/types'

const el = (id: string, o: Partial<TrameElement> = {}): TrameElement => ({ id, type: 'rect', x: 10, y: 20, width: 100, height: 50, rotation: 0, opacity: 1, fill: '#000', ...o }) as TrameElement
const doc = (els: TrameElement[]): TrameDocument => ({ version: 2, name: 't', width: 500, height: 500, pages: [{ id: 'p', background: '#fff', elements: els }] })
const get = (id: string): TrameElement => selectPage(useEditor.getState()).elements.find((e) => e.id === id) as TrameElement
const s = () => useEditor.getState()

beforeEach(() => {
  s().loadDocument(doc([el('logo'), el('titre', { type: 'text', text: 'Titre' }), el('libre')]))
  useEditor.setState({ selectedIds: [] })
})

/** Construit un modèle : logo figé, titre à remplir, un élément libre ; puis le verrouille. */
function lockedTemplate(): void {
  useEditor.setState({ selectedIds: ['logo'] })
  s().setProtection('fixed')
  useEditor.setState({ selectedIds: ['titre'] })
  s().setProtection('fill')
  useEditor.setState({ selectedIds: [] })
  s().setTemplateUnlocked(false)
}

describe('protection des éléments d\'un modèle (store)', () => {
  it('marquer un élément ouvre la modification du modèle (il reste modifiable jusqu\'à « Terminer »)', () => {
    useEditor.setState({ selectedIds: ['logo'] })
    s().setProtection('fixed')
    expect(get('logo').protect).toBe('fixed')
    expect(s().templateUnlocked).toBe(true)
    s().updateElement('logo', { x: 99 })
    expect(get('logo').x).toBe(99)
  })

  it('modèle verrouillé : un élément figé ne change plus du tout', () => {
    lockedTemplate()
    s().updateElement('logo', { x: 99, fill: '#f00' })
    expect(get('logo')).toMatchObject({ x: 10, fill: '#000' })
  })

  it('modèle verrouillé : un élément « à remplir » accepte son contenu mais pas sa géométrie', () => {
    lockedTemplate()
    s().updateElement('titre', { text: 'Bonjour', fill: '#f00', x: 300, width: 5 })
    expect(get('titre')).toMatchObject({ text: 'Bonjour', fill: '#f00', x: 10, width: 100 })
  })

  it('modèle verrouillé : les éléments libres restent entièrement modifiables', () => {
    lockedTemplate()
    s().updateElement('libre', { x: 300 })
    expect(get('libre').x).toBe(300)
  })

  it('modèle verrouillé : déplacer, aligner, supprimer, dupliquer, réordonner et masquer ignorent les éléments protégés', () => {
    lockedTemplate()
    useEditor.setState({ selectedIds: ['logo', 'titre', 'libre'] })
    s().nudgeSelected(30, 30)
    expect(get('logo')).toMatchObject({ x: 10, y: 20 })
    expect(get('titre')).toMatchObject({ x: 10, y: 20 })
    expect(get('libre')).toMatchObject({ x: 40, y: 50 }) // seul l'élément libre a bougé
    s().duplicateSelected()
    expect(selectPage(s()).elements).toHaveLength(4) // une seule copie : celle de l'élément libre
    useEditor.setState({ selectedIds: ['logo', 'titre'] })
    s().removeSelected()
    expect(selectPage(s()).elements.map((e) => e.id)).toContain('logo')
    expect(selectPage(s()).elements.map((e) => e.id)).toContain('titre')
    s().setLayerFlag('logo', 'hidden', true)
    expect(get('logo').hidden).toBeUndefined()
    const before = selectPage(s()).elements.map((e) => e.id)
    s().reorderElement('logo', 2)
    s().moveLayer('top')
    expect(selectPage(s()).elements.map((e) => e.id)).toEqual(before)
  })

  it('modèle verrouillé : on ne change pas la protection sans « Modifier le modèle »', () => {
    lockedTemplate()
    useEditor.setState({ selectedIds: ['logo'] })
    s().setProtection(undefined)
    expect(get('logo').protect).toBe('fixed')
  })

  it('« Modifier le modèle » déverrouille tout, « Terminer » reverrouille', () => {
    lockedTemplate()
    s().setTemplateUnlocked(true)
    s().updateElement('logo', { x: 77 })
    expect(get('logo').x).toBe(77)
    s().setTemplateUnlocked(false)
    s().updateElement('logo', { x: 5 })
    expect(get('logo').x).toBe(77)
  })

  it('retirer toute protection rend le document libre', () => {
    lockedTemplate()
    s().setTemplateUnlocked(true)
    useEditor.setState({ selectedIds: ['logo', 'titre'] })
    s().setProtection(undefined)
    s().setTemplateUnlocked(false)
    s().updateElement('logo', { x: 3 })
    expect(get('logo').x).toBe(3)
  })

  it('ouvrir un document (ou un modèle) verrouille toujours', () => {
    lockedTemplate()
    s().setTemplateUnlocked(true)
    s().loadDocument(doc([el('a', { protect: 'fixed' })]))
    expect(s().templateUnlocked).toBe(false)
    s().updateElement('a', { x: 1 })
    expect(get('a').x).toBe(10)
  })

  it('une copie collée ne garde pas la protection', () => {
    useEditor.setState({ selectedIds: [] })
    s().pasteElements([el('x', { protect: 'fixed' })])
    expect(selectPage(s()).elements.every((e) => !e.protect || e.id === 'logo')).toBe(true)
    expect(selectPage(s()).elements.filter((e) => e.protect)).toHaveLength(0)
  })

  it('la protection est conservée à la lecture d\'un fichier, nettoyée si invalide', async () => {
    const { parseDocument } = await import('@/store/editor')
    const parsed = parseDocument(JSON.stringify(doc([el('a', { protect: 'fixed' }), el('b', { protect: 'oui' as never })])))
    expect(parsed.pages[0].elements.map((e) => e.protect)).toEqual(['fixed', undefined])
  })
})
