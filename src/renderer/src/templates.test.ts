import { describe, expect, it } from 'vitest'
import { SHAPES } from '@/shapes'
import { useLocale } from '@/i18n'
import { fieldsUsed, unknownFields } from '@/mailMerge'
import { TEMPLATES, cloneWithNewIds, instantiate, previewPage } from '@/templates'
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

describe('cloneWithNewIds', () => {
  const doc = instantiate(TEMPLATES.find((t) => t.pages.length > 1)!)
  // deux éléments du même groupe, pour vérifier que la copie conserve le lien entre eux
  doc.pages[0].elements[0].groupId = 'g1'
  doc.pages[0].elements[1].groupId = 'g1'

  it('renouvelle tous les identifiants de pages et d’éléments', () => {
    const copy = cloneWithNewIds(doc)
    const ids = (d: typeof doc): string[] => d.pages.flatMap((p) => [p.id, ...p.elements.map((e) => e.id)])
    expect(ids(copy)).toHaveLength(ids(doc).length)
    expect(ids(copy).filter((id) => ids(doc).includes(id))).toEqual([])
    expect(new Set(ids(copy)).size).toBe(ids(copy).length)
  })

  it('renouvelle les groupes en gardant les membres ensemble', () => {
    const [a, b, c] = cloneWithNewIds(doc).pages[0].elements
    expect(a.groupId).toBeDefined()
    expect(a.groupId).not.toBe('g1')
    expect(a.groupId).toBe(b.groupId)
    expect(c.groupId).toBeUndefined()
  })

  it('conserve le contenu et ne modifie pas l’original', () => {
    const before = JSON.stringify(doc)
    const copy = cloneWithNewIds(doc)
    expect(JSON.stringify(doc)).toBe(before)
    expect(copy.pages.map((p) => p.elements.map((e) => e.text ?? e.type))).toEqual(
      doc.pages.map((p) => p.elements.map((e) => e.text ?? e.type))
    )
    expect(copy.width).toBe(doc.width)
  })
})

describe('modèles de publipostage', () => {
  const merge = TEMPLATES.filter((t) => t.merge)
  it('il y en a et ils forment leur propre catégorie', () => {
    expect(merge.map((t) => t.id)).toEqual(['certificate', 'badge', 'label', 'flashcard'])
    expect(merge.every((t) => t.category === 'mailmerge')).toBe(true)
  })
  it.each(['fr', 'en', 'de', 'es'])('en %s : chaque champ des textes a une colonne et chaque ligne a toutes ses valeurs', (lang) => {
    useLocale.getState().setLocale(lang)
    try {
      for (const t of merge) {
        const doc = instantiate(t)
        expect(doc.mailMerge, t.id).toBeDefined()
        expect(doc.mailMerge!.rows.length, t.id).toBeGreaterThanOrEqual(3)
        for (const row of doc.mailMerge!.rows) {
          expect(row.length, t.id).toBe(doc.mailMerge!.columns.length)
          expect(row.every((c) => c.trim() && !c.includes('i18n:')), `${t.id} ${lang}`).toBe(true)
        }
        expect(fieldsUsed(doc).length, t.id).toBeGreaterThan(0)
        expect(unknownFields(doc, doc.mailMerge!.columns), `${t.id} ${lang}`).toEqual([])
        expect(new Set(doc.mailMerge!.columns.map((c) => c.toLowerCase())).size, t.id).toBe(doc.mailMerge!.columns.length)
      }
    } finally {
      useLocale.getState().setLocale('fr')
    }
  })
  it('l\'aperçu est rempli avec la première ligne d\'exemple, sans champ restant', () => {
    for (const t of merge) {
      const texts = previewPage(t.pages[0], t).elements.map((e) => e.text ?? '').join(' ')
      expect(texts, t.id).not.toContain('{{')
      expect(texts, t.id).toContain(t.id === 'flashcard' ? 'le chat' : 'Ada')
    }
  })
  it('les autres modèles n\'ont pas de tableau', () => {
    expect(instantiate(TEMPLATES.find((t) => t.id === 'promo')!).mailMerge).toBeUndefined()
  })
})
