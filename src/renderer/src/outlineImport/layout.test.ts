import { describe, expect, it } from 'vitest'
import { MAX_PAGES, countLines, outlineToDocument, suggestLevel, type ImportOptions } from './layout'
import { emptyOutline, type Outline, type OutlineBlock } from './outline'

const opts = (over: Partial<ImportOptions> = {}): ImportOptions => ({ level: 2, theme: 'light', images: true, name: 'Cours', continued: 'suite', ...over })
const outline = (blocks: OutlineBlock[], title?: string): Outline => ({ ...emptyOutline(), blocks, ...(title ? { title } : {}) })
const h = (level: number, text: string): OutlineBlock => ({ kind: 'heading', level, text })
const p = (text: string): OutlineBlock => ({ kind: 'para', text })
const li = (text: string, level = 0, ordered = false): OutlineBlock => ({ kind: 'item', level, ordered, text })
const img = (ratio = 2, alt?: string): OutlineBlock => ({ kind: 'image', src: 'data:image/png;base64,AA', ratio, ...(alt ? { alt } : {}) })

const texts = (page: { elements: { type: string; text?: string }[] }): string[] => page.elements.filter((e) => e.type === 'text').map((e) => e.text ?? '')

describe('mesure du texte', () => {
  it('compte les lignes dans la largeur, retours à la ligne compris', () => {
    expect(countLines('court', 40, 1000)).toBe(1)
    expect(countLines('a\nb\nc', 40, 1000)).toBe(3)
    expect(countLines('x'.repeat(200), 40, 1000)).toBe(5)
    expect(countLines('', 40, 1000)).toBe(1)
  })
})

describe('découpage en pages', () => {
  it('une page par titre du niveau choisi, le titre en haut et le texte dessous', () => {
    const r = outlineToDocument(outline([h(1, 'Cours'), p('Intro'), h(2, 'Partie A'), li('un'), li('deux'), h(2, 'Partie B'), p('Fin')]), opts({ level: 2 }))
    expect(r.pages).toBe(3)
    expect(texts(r.doc.pages[0])).toEqual(['Cours', 'Intro'])
    expect(texts(r.doc.pages[1])).toEqual(['Partie A', 'un\ndeux'])
    expect(texts(r.doc.pages[2])).toEqual(['Partie B', 'Fin'])
    expect(r.doc).toMatchObject({ version: 2, name: 'Cours', width: 1920, height: 1080 })
  })

  it('un titre plus bas que le niveau devient un sous-titre en gras dans la page', () => {
    const r = outlineToDocument(outline([h(1, 'Chapitre'), h(2, 'Sous-partie'), p('texte')]), opts({ level: 1 }))
    expect(r.pages).toBe(1)
    const sub = r.doc.pages[0].elements.find((e) => e.text === 'Sous-partie')!
    expect(sub.fontStyle).toBe('bold')
  })

  it('un titre sans contenu donne une page de titre en grand', () => {
    const r = outlineToDocument(outline([h(1, 'Partie 1'), h(2, 'Détail'), p('texte')]), opts({ level: 1 }))
    const r2 = outlineToDocument(outline([h(1, 'Partie 1'), h(1, 'Partie 2'), p('texte')]), opts({ level: 1 }))
    expect(r.pages).toBe(1)
    expect(r2.pages).toBe(2)
    const big = r2.doc.pages[0].elements.find((e) => e.type === 'text')!
    expect(big.fontSize).toBeGreaterThanOrEqual(72)
    expect(r2.doc.pages[0].background).not.toBe(r2.doc.pages[1].background)
  })

  it('le titre du document fait une page de couverture, sauf s’il répète le premier titre', () => {
    const a = outlineToDocument(outline([h(1, 'Chapitre'), p('x')], 'Mon cours'), opts())
    expect(a.pages).toBe(2)
    expect(texts(a.doc.pages[0])).toEqual(['Mon cours'])
    const b = outlineToDocument(outline([h(1, 'Mon cours'), p('x')], 'Mon cours'), opts())
    expect(b.pages).toBe(1)
  })

  it('un saut de page voulu démarre une page, même sans titre', () => {
    const r = outlineToDocument(outline([h(1, 'A'), p('un'), { kind: 'break' }, p('deux'), { kind: 'break' }, { kind: 'break' }, p('trois')]), opts())
    expect(r.pages).toBe(3)
    expect(texts(r.doc.pages[1])).toEqual(['deux'])
  })

  it('un plan vide donne une page vide, pas un document sans page', () => {
    const r = outlineToDocument(outline([]), opts())
    expect(r.pages).toBe(1)
    expect(r.doc.pages[0].elements).toHaveLength(1)
  })

  it('le thème sombre change les fonds et les couleurs de texte', () => {
    const light = outlineToDocument(outline([h(1, 'A'), p('x')]), opts({ theme: 'light' })).doc.pages[0]
    const dark = outlineToDocument(outline([h(1, 'A'), p('x')]), opts({ theme: 'dark' })).doc.pages[0]
    expect(light.background).toBe('#ffffff')
    expect(dark.background).not.toBe(light.background)
    expect(dark.elements.find((e) => e.type === 'text')!.fill).not.toBe(light.elements.find((e) => e.type === 'text')!.fill)
  })

  it('s’arrête à MAX_PAGES en le signalant', () => {
    const blocks: OutlineBlock[] = []
    for (let i = 0; i < MAX_PAGES + 20; i++) blocks.push(h(1, `Titre ${i}`), p('texte'))
    const r = outlineToDocument(outline(blocks), opts({ level: 1 }))
    expect(r.truncated).toBe(true)
    expect(r.pages).toBe(MAX_PAGES)
    expect(r.doc.pages).toHaveLength(MAX_PAGES)
  })
})

describe('listes et paragraphes', () => {
  it('puces, numéros et paragraphes forment chacun leur élément, avec le bon type de liste', () => {
    const r = outlineToDocument(outline([h(1, 'T'), p('intro'), li('a'), li('b'), li('un', 0, true), li('deux', 0, true)]), opts({ level: 1 }))
    const els = r.doc.pages[0].elements.filter((e) => e.type === 'text' && e.text !== 'T')
    expect(els.map((e) => [e.text, e.list])).toEqual([['intro', undefined], ['a\nb', 'bullet'], ['un\ndeux', 'number']])
  })

  it('un sous-niveau est un élément à part, en retrait et un peu plus petit', () => {
    const r = outlineToDocument(outline([h(1, 'T'), li('haut'), li('bas', 1), li('encore haut')]), opts({ level: 1 }))
    const els = r.doc.pages[0].elements.filter((e) => e.type === 'text' && e.text !== 'T')
    expect(els).toHaveLength(3)
    expect(els[1].x).toBeGreaterThan(els[0].x)
    expect(els[1].fontSize!).toBeLessThan(els[0].fontSize!)
    expect(els[1].list).toBe('bullet')
  })

  it('un texte court est grand, un texte long plus petit', () => {
    const short = outlineToDocument(outline([h(1, 'T'), li('un'), li('deux')]), opts({ level: 1 }))
    const items = Array.from({ length: 12 }, (_, i) => li(`Un élément de liste assez long pour occuper de la place, numéro ${i}`))
    const long = outlineToDocument(outline([h(1, 'T'), ...items]), opts({ level: 1 }))
    const size = (r: ReturnType<typeof outlineToDocument>): number => r.doc.pages[0].elements.find((e) => e.list)!.fontSize!
    expect(size(short)).toBe(52)
    expect(size(long)).toBeLessThan(52)
  })
})

describe('numérotation', () => {
  it('une liste numérotée interrompue par une sous-liste reprend à son numéro', () => {
    const r = outlineToDocument(outline([h(1, 'T'), li('un', 0, true), li('deux', 0, true), li('sous', 1), li('trois', 0, true), li('quatre', 0, true)]), opts({ level: 1 }))
    const els = r.doc.pages[0].elements.filter((e) => e.type === 'text' && e.text !== 'T')
    expect(els.map((e) => [e.text, e.list])).toEqual([['un\ndeux', 'number'], ['sous', 'bullet'], ['3. trois\n4. quatre', undefined]])
  })

  it('une nouvelle liste, après un paragraphe, repart à 1', () => {
    const r = outlineToDocument(outline([h(1, 'T'), li('a', 0, true), p('entre'), li('b', 0, true)]), opts({ level: 1 }))
    const els = r.doc.pages[0].elements.filter((e) => e.type === 'text' && e.text !== 'T')
    expect(els.map((e) => [e.text, e.list])).toEqual([['a', 'number'], ['entre', undefined], ['b', 'number']])
  })

  it('une longue liste numérotée garde sa numérotation sur la page suivante', () => {
    const items = Array.from({ length: 50 }, (_, i) => li(`Étape numéro ${i + 1} avec un texte assez long pour prendre de la place sur la page.`, 0, true))
    const r = outlineToDocument(outline([h(1, 'Long'), ...items]), opts({ level: 1 }))
    expect(r.pages).toBeGreaterThan(1)
    const second = r.doc.pages[1].elements.find((e) => e.type === 'text' && e.text!.includes('Étape'))!
    const firstNumber = Number(/^(\d+)\. /.exec(second.text!)?.[1])
    const onFirst = r.doc.pages[0].elements.find((e) => e.list === 'number')!.text!.split('\n').length
    expect(firstNumber).toBe(onFirst + 1)
    expect(second.list).toBeUndefined()
  })
})

describe('trop de texte pour une page', () => {
  const items = Array.from({ length: 60 }, (_, i) => li(`Élément ${i} d’une liste très longue qui ne peut pas tenir sur une seule diapositive.`))

  it('se répartit sur plusieurs pages « Titre (suite) » sans rien perdre', () => {
    const r = outlineToDocument(outline([h(1, 'Long'), ...items]), opts({ level: 1 }))
    expect(r.pages).toBeGreaterThan(2)
    expect(texts(r.doc.pages[0])[0]).toBe('Long')
    expect(texts(r.doc.pages[1])[0]).toBe('Long (suite)')
    const all = r.doc.pages.flatMap((pg) => pg.elements.filter((e) => e.list).flatMap((e) => e.text!.split('\n')))
    expect(all).toHaveLength(60)
    expect(all[59]).toContain('Élément 59')
  })

  it('tout reste dans la page : aucun texte ne dépasse le bas', () => {
    const para = p('Un paragraphe très long. '.repeat(400))
    const r = outlineToDocument(outline([h(1, 'Énorme'), para, ...items]), opts({ level: 1 }))
    for (const pg of r.doc.pages) for (const e of pg.elements) expect(e.y + e.height, `${e.text?.slice(0, 20)}`).toBeLessThanOrEqual(1080)
    const total = r.doc.pages.flatMap((pg) => pg.elements.filter((e) => e.type === 'text' && !e.list && !e.text!.startsWith('Énorme'))).map((e) => e.text!).join(' ')
    // rien n'est perdu ni répété : on compare des décomptes (une comparaison de chaînes de 10 000 caractères noie le rapport d'erreur)
    expect(total.split('paragraphe').length - 1).toBe(400)
    expect(total.replace(/\s+/g, ' ').trim().length).toBe(('Un paragraphe très long. '.repeat(400)).trim().length)
  })
})

describe('images', () => {
  it('une image se place dans la colonne de droite, à ses proportions, texte réduit à gauche', () => {
    const r = outlineToDocument(outline([h(1, 'Schéma'), p('Légende'), img(2, 'Le cycle')]), opts({ level: 1 }))
    const els = r.doc.pages[0].elements
    const image = els.find((e) => e.type === 'image')!
    expect(image.alt).toBe('Le cycle')
    expect(image.x).toBeGreaterThanOrEqual(1160)
    expect(image.x + image.width).toBeLessThanOrEqual(1760)
    expect(image.y).toBeLessThan(300) // part du haut, comme le texte
    expect(image.width / image.height).toBeCloseTo(2, 1)
    expect(els.find((e) => e.text === 'Légende')!.width).toBe(940)
  })

  it('une page qui n’a que des images les montre en grand', () => {
    const r = outlineToDocument(outline([h(1, 'Photo'), img(1.5)]), opts({ level: 1 }))
    const image = r.doc.pages[0].elements.find((e) => e.type === 'image')!
    expect(image.width).toBeGreaterThan(900)
    expect(image.x + image.width / 2).toBeCloseTo(960, -1)
  })

  it('plus de trois images avec du texte : les autres passent sur des pages « (suite) »', () => {
    const r = outlineToDocument(outline([h(1, 'Galerie'), p('texte'), img(), img(), img(), img(), img()]), opts({ level: 1 }))
    expect(r.pages).toBe(3)
    expect(r.doc.pages[0].elements.filter((e) => e.type === 'image')).toHaveLength(3)
    expect(texts(r.doc.pages[1])[0]).toBe('Galerie (suite)')
  })

  it('sans « reprendre les images », elles sont ignorées', () => {
    const r = outlineToDocument(outline([h(1, 'A'), p('x'), img()]), opts({ level: 1, images: false }))
    expect(r.doc.pages.flatMap((pg) => pg.elements).some((e) => e.type === 'image')).toBe(false)
  })

  it('une proportion inconnue ou absurde ne casse rien', () => {
    const r = outlineToDocument(outline([h(1, 'A'), { kind: 'image', src: 'data:image/png;base64,AA', ratio: 0 }, { kind: 'image', src: 'data:image/png;base64,AA', ratio: NaN }]), opts({ level: 1 }))
    for (const e of r.doc.pages.flatMap((pg) => pg.elements)) {
      expect(Number.isFinite(e.x + e.y + e.width + e.height)).toBe(true)
    }
  })
})

describe('niveau de découpe conseillé', () => {
  it('le plus haut niveau qui donne au moins quatre pages, sinon le plus bas qui en donne', () => {
    expect(suggestLevel(outline([h(1, 'a'), h(1, 'b'), h(1, 'c'), h(1, 'd'), h(2, 'e')]))).toBe(1)
    expect(suggestLevel(outline([h(1, 'a'), h(2, 'b'), h(2, 'c'), h(2, 'd')]))).toBe(2)
    expect(suggestLevel(outline([h(1, 'a'), h(1, 'b')]))).toBe(1)
    expect(suggestLevel(outline([h(2, 'a'), h(3, 'b')]))).toBe(3)
    expect(suggestLevel(outline([h(1, 'a'), h(2, 'b')]))).toBe(2)
    expect(suggestLevel(outline([p('rien')]))).toBe(1)
  })
})
