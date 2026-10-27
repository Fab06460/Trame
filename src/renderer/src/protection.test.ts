import { describe, expect, it } from 'vitest'
import { allowedPatch, contentLocked, hasProtected, isEnforced, positionLocked, sanitizeProtection } from '@/protection'
import type { TrameDocument, TrameElement } from '@/types'

const el = (o: Partial<TrameElement> = {}): TrameElement => ({ id: 'a', type: 'rect', x: 0, y: 0, width: 1, height: 1, rotation: 0, opacity: 1, fill: '#000', ...o }) as TrameElement
const doc = (els: TrameElement[]): TrameDocument => ({ version: 2, name: 'x', width: 10, height: 10, pages: [{ id: 'p', background: '#fff', elements: els }] })

describe('protection', () => {
  it('le verrou ne s\'applique que si un élément est protégé et hors modification du modèle', () => {
    expect(hasProtected(doc([el()]))).toBe(false)
    expect(isEnforced(doc([el()]), false)).toBe(false)
    expect(isEnforced(doc([el({ protect: 'fixed' })]), false)).toBe(true)
    expect(isEnforced(doc([el({ protect: 'fixed' })]), true)).toBe(false)
  })

  it('position verrouillée : verrou de calque, ou élément protégé quand le verrou s\'applique', () => {
    expect(positionLocked(el({ locked: true }), false)).toBe(true)
    expect(positionLocked(el({ protect: 'fill' }), true)).toBe(true)
    expect(positionLocked(el({ protect: 'fixed' }), false)).toBe(false)
    expect(positionLocked(el(), true)).toBe(false)
  })

  it('contenu verrouillé : seulement un élément figé, verrou actif', () => {
    expect(contentLocked(el({ protect: 'fixed' }), true)).toBe(true)
    expect(contentLocked(el({ protect: 'fill' }), true)).toBe(false)
    expect(contentLocked(el({ protect: 'fixed' }), false)).toBe(false)
  })

  it('modifications autorisées', () => {
    const patch = { text: 'Bonjour', fill: '#f00', x: 50, width: 200, protect: undefined, hidden: true } as Partial<TrameElement>
    expect(allowedPatch(el(), patch, true)).toBe(patch) // libre
    expect(allowedPatch(el({ protect: 'fixed' }), patch, false)).toBe(patch) // modèle déverrouillé
    expect(allowedPatch(el({ protect: 'fixed' }), patch, true)).toBeNull() // figé : rien
    expect(allowedPatch(el({ protect: 'fill' }), patch, true)).toEqual({ text: 'Bonjour', fill: '#f00' }) // à remplir : le contenu seulement
    expect(allowedPatch(el({ protect: 'fill' }), { x: 3, y: 4 }, true)).toBeNull()
  })

  it('nettoyage à la lecture', () => {
    for (const [input, expected] of [['fixed', 'fixed'], ['fill', 'fill'], ['oui', undefined], [true, undefined], [undefined, undefined]] as const) {
      const e: Record<string, unknown> = { protect: input }
      sanitizeProtection(e)
      expect(e.protect).toBe(expected)
    }
  })
})
