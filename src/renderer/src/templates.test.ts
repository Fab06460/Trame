import { describe, expect, it } from 'vitest'
import { SHAPES } from '@/shapes'
import { TEMPLATES, instantiate } from '@/templates'
import type { TrameElement } from '@/types'

const allElements = (): Array<{ t: string; e: Omit<TrameElement, 'id'> }> =>
  TEMPLATES.flatMap((t) => t.pages.flatMap((p) => p.elements.map((e) => ({ t: t.id, e }))))

describe('modèles', () => {
  it('ont des identifiants uniques et au moins une page', () => {
    expect(new Set(TEMPLATES.map((t) => t.id)).size).toBe(TEMPLATES.length)
    for (const t of TEMPLATES) expect(t.pages.length).toBeGreaterThan(0)
  })

  it('instantiate produit un document v2 valide avec des identifiants tous uniques', () => {
    for (const t of TEMPLATES) {
      const doc = instantiate(t)
      expect(doc.version).toBe(2)
      expect([doc.width, doc.height]).toEqual([t.width, t.height])
      const ids = doc.pages.flatMap((p) => [p.id, ...p.elements.map((e) => e.id)])
      expect(new Set(ids).size).toBe(ids.length)
    }
  })

  it('instantiate donne des identifiants différents à chaque appel', () => {
    const a = instantiate(TEMPLATES[0])
    const b = instantiate(TEMPLATES[0])
    expect(a.pages[0].id).not.toBe(b.pages[0].id)
  })

  it('chaque élément a les champs requis par son type', () => {
    for (const { t, e } of allElements()) {
      const where = `modèle ${t}, élément ${e.type}`
      expect(e.width, where).toBeGreaterThan(0)
      expect(e.height, where).toBeGreaterThan(0)
      if (e.type === 'text') {
        expect(e.text, where).toBeTruthy()
        expect(e.fontSize, where).toBeGreaterThan(0)
        expect(e.fontFamily, where).toBeTruthy()
      }
      if (e.type === 'path') expect(e.path, where).toBeTruthy()
      if (e.type === 'image') expect(e.src, where).toBeTruthy()
    }
  })

  it('tous les éléments commencent dans les limites de leur page (hors décors volontairement débordants)', () => {
    // Les décors peuvent déborder (cercles coupés par le bord) ; on vérifie au moins que le texte reste dedans.
    for (const t of TEMPLATES)
      for (const p of t.pages)
        for (const e of p.elements.filter((x) => x.type === 'text')) {
          expect(e.x, `${t.id}`).toBeGreaterThanOrEqual(0)
          expect(e.x + e.width, `${t.id}`).toBeLessThanOrEqual(t.width)
        }
  })
})

describe('formes', () => {
  it('ont des identifiants uniques et un chemin SVG non vide commençant par M', () => {
    expect(new Set(SHAPES.map((s) => s.id)).size).toBe(SHAPES.length)
    for (const s of SHAPES) expect(s.path.trim().startsWith('M'), s.id).toBe(true)
  })

  it('restent dans le viewBox 100×100', () => {
    for (const s of SHAPES) {
      const nums = (s.path.match(/-?\d+(\.\d+)?/g) ?? []).map(Number)
      expect(nums.length, s.id).toBeGreaterThan(0)
      for (const n of nums) {
        expect(n, s.id).toBeGreaterThanOrEqual(0)
        expect(n, s.id).toBeLessThanOrEqual(100)
      }
    }
  })
})
