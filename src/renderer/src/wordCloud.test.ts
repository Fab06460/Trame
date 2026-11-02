import { describe, expect, it } from 'vitest'
import { contrastRatio, parseHex } from '@/accessibility'
import { cloudElements, layoutCloud, parseCloudInput, readableColors, type CloudWord } from './wordCloud'

/** Largeur simulée : 0,55 × la taille par lettre. */
const measure = (text: string, size: number): number => text.length * size * 0.55
const words = (n: number): CloudWord[] => Array.from({ length: n }, (_, i) => ({ text: `mot${i}`, weight: n - i }))

describe('parseCloudInput : texte', () => {
  it('compte les mots et ignore les mots courants (français, anglais)', () => {
    const r = parseCloudInput('Le chat et le chien. Le chat dort dans la maison. The cat and the dog.')
    expect(r.mode).toBe('text')
    const by = Object.fromEntries(r.words.map((w) => [w.text.toLowerCase(), w.weight]))
    expect(by.chat).toBe(2)
    expect(by.chien).toBe(1)
    expect(by.cat).toBe(1)
    for (const stop of ['le', 'et', 'dans', 'la', 'the', 'and']) expect(by[stop], stop).toBeUndefined()
  })
  it("l'apostrophe sépare, le trait d'union relie, les nombres seuls et les lettres isolées sont ignorés", () => {
    const by = Object.fromEntries(parseCloudInput("l'école et le porte-monnaie 2024 x école").words.map((w) => [w.text, w.weight]))
    expect(by['école']).toBe(2)
    expect(by['porte-monnaie']).toBe(1)
    expect(by['2024']).toBeUndefined()
    expect(by.x).toBeUndefined()
    expect(by.l).toBeUndefined()
  })
  it('garde la graphie la plus fréquente et trie par poids', () => {
    const r = parseCloudInput('Paris paris Paris Lyon lyon Nice')
    expect(r.words.map((w) => [w.text, w.weight])).toEqual([['Paris', 3], ['Lyon', 2], ['Nice', 1]])
  })
  it('retire les mots à exclure et coupe au nombre demandé', () => {
    const text = Array.from({ length: 30 }, (_, i) => `mot${i}`.repeat(1)).join(' ') + ' mot0 mot0 mot1'
    const r = parseCloudInput(text, { exclude: ['MOT0'], max: 5 })
    expect(r.words).toHaveLength(5)
    expect(r.words.map((w) => w.text)).not.toContain('mot0')
    expect(r.words[0].text).toBe('mot1')
    expect(r.distinct).toBe(29)
  })
  it('un contenu vide ou sans mot donne un nuage vide', () => {
    expect(parseCloudInput('').words).toEqual([])
    expect(parseCloudInput('le la les de').words).toEqual([])
  })
})

describe('parseCloudInput : listes', () => {
  it('une liste de lignes courtes : chaque ligne est un terme, doublons comptés, mots courants conservés', () => {
    const r = parseCloudInput('- pomme\n- poire\n- pomme\n3. le monde\nPoire')
    expect(r.mode).toBe('list')
    expect(r.words.map((w) => [w.text.toLowerCase(), w.weight])).toEqual([['pomme', 2], ['poire', 2], ['le monde', 1]])
  })
  it('une liste pondérée donne les poids (virgule décimale comprise)', () => {
    const r = parseCloudInput('Soleil ; 12\nPluie: 5\nVent\t3,5\nNeige = 1')
    expect(r.mode).toBe('weighted')
    expect(r.words).toEqual([{ text: 'Soleil', weight: 12 }, { text: 'Pluie', weight: 5 }, { text: 'Vent', weight: 3.5 }, { text: 'Neige', weight: 1 }])
  })
  it('des phrases longues restent un texte, même sur plusieurs lignes', () => {
    expect(parseCloudInput('Ceci est une première phrase assez longue.\nEt voici une seconde phrase tout aussi longue.\nEncore une ligne de texte suivi.\nEt une dernière pour finir.').mode).toBe('text')
  })
})

describe('layoutCloud', () => {
  const box = { width: 1000, height: 700 }
  const overlap = (a: { x: number; y: number; width: number; height: number }, b: typeof a): boolean => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

  it('place tous les mots, dans la boîte, sans chevauchement', () => {
    const placed = layoutCloud(words(40), box, measure, { seed: 3 })
    expect(placed).toHaveLength(40)
    for (const p of placed) {
      expect(p.x, p.text).toBeGreaterThanOrEqual(0)
      expect(p.y, p.text).toBeGreaterThanOrEqual(0)
      expect(p.x + p.width, p.text).toBeLessThanOrEqual(box.width)
      expect(p.y + p.height, p.text).toBeLessThanOrEqual(box.height)
    }
    for (const [i, a] of placed.entries()) for (const b of placed.slice(i + 1)) expect(overlap(a, b), `${a.text} / ${b.text}`).toBe(false)
  })
  it('le mot le plus lourd est le plus gros et le plus proche du centre', () => {
    const placed = layoutCloud(words(20), box, measure)
    const [first, ...rest] = placed
    expect(first.rank).toBe(0)
    for (const p of rest) expect(p.size).toBeLessThanOrEqual(first.size)
    const d = (p: typeof first): number => Math.hypot(p.x + p.width / 2 - 500, p.y + p.height / 2 - 350)
    expect(d(first)).toBeLessThan(Math.min(...rest.map(d)) + 1)
  })
  it('même graine = même disposition, autre graine = autre disposition (mots verticaux)', () => {
    const a = layoutCloud(words(30), box, measure, { seed: 5, vertical: true })
    const b = layoutCloud(words(30), box, measure, { seed: 5, vertical: true })
    const c = layoutCloud(words(30), box, measure, { seed: 6, vertical: true })
    expect(a).toEqual(b)
    expect(a.map((p) => p.vertical).join()).not.toBe(c.map((p) => p.vertical).join())
  })
  it('des mots verticaux seulement si on le demande, jamais le premier', () => {
    expect(layoutCloud(words(30), box, measure, { seed: 1 }).some((p) => p.vertical)).toBe(false)
    const v = layoutCloud(words(30), box, measure, { seed: 1, vertical: true })
    expect(v.some((p) => p.vertical)).toBe(true)
    expect(v.find((p) => p.rank === 0)!.vertical).toBe(false)
    for (const p of v.filter((q) => q.vertical)) expect(p.height).toBeGreaterThan(p.width)
  })
  it('réduit les tailles pour que tout tienne, et abandonne seulement ce qui ne tient vraiment pas', () => {
    const many = layoutCloud(words(100), box, measure)
    expect(many.length).toBeGreaterThan(90)
    // des mots plus larges que la boîte, même à la plus petite taille, sont abandonnés ; les autres sont placés
    const long = layoutCloud([...words(5), { text: 'x'.repeat(400), weight: 3 }], box, measure)
    expect(long).toHaveLength(5)
    expect(long.map((p) => p.text)).not.toContain('x'.repeat(400))
  })
  it('des poids égaux donnent des tailles égales ; un seul mot est gros', () => {
    const eq = layoutCloud([{ text: 'a1', weight: 2 }, { text: 'b1', weight: 2 }, { text: 'c1', weight: 2 }], box, measure)
    expect(new Set(eq.map((p) => p.size)).size).toBe(1)
    const one = layoutCloud([{ text: 'seul', weight: 1 }], box, measure)
    expect(one[0].size).toBeGreaterThan(80)
    expect(layoutCloud([], box, measure)).toEqual([])
  })
})

describe('cloudElements', () => {
  const placed = layoutCloud(words(12), { width: 1000, height: 700 }, measure, { seed: 2, vertical: true })
  it('un texte gras par mot, dans un même groupe, coloré selon le rang', () => {
    const els = cloudElements(placed, { x: 0, y: 0, scale: 1 }, '"Inter", sans-serif', ['#111111', '#222222'])
    expect(els).toHaveLength(placed.length)
    expect(new Set(els.map((e) => e.groupId)).size).toBe(1)
    expect(new Set(els.map((e) => e.id)).size).toBe(els.length)
    els.forEach((e, i) => {
      expect(e.type).toBe('text')
      expect(e.fontStyle).toBe('bold')
      expect(e.text).toBe(placed[i].text)
      expect(e.fill).toBe(['#111111', '#222222'][placed[i].rank % 2])
      expect(e.width).toBeGreaterThanOrEqual(Math.ceil((placed[i].vertical ? placed[i].height : placed[i].width)))
    })
  })
  it("l'encre d'un mot vertical (tourné d'un quart de tour) occupe bien le rectangle placé", () => {
    const els = cloudElements(placed, { x: 0, y: 0, scale: 1 }, 'f', ['#000'])
    placed.forEach((p, i) => {
      const e = els[i]
      const s = e.fontSize!
      if (!p.vertical) {
        expect(e.rotation).toBe(0)
        expect(e.x).toBeCloseTo(p.x, 0)
        expect(e.y + 0.1 * s).toBeCloseTo(p.y, 0)
      } else {
        expect(e.rotation).toBe(90)
        // (u, v) local → écran (x - v, y + u) : l'encre va de x - 1,1 s à x - 0,1 s, et de y à y + largeur
        expect(e.x - 1.1 * s).toBeCloseTo(p.x, 0)
        expect(e.x - 0.1 * s).toBeCloseTo(p.x + p.width, 0)
        expect(e.y).toBeCloseTo(p.y, 0)
      }
    })
  })
  it("met à l'échelle et décale", () => {
    const a = cloudElements(placed, { x: 0, y: 0, scale: 1 }, 'f', ['#000'])
    const b = cloudElements(placed, { x: 50, y: 20, scale: 2 }, 'f', ['#000'])
    expect(b[0].fontSize).toBeCloseTo(a[0].fontSize! * 2, 0)
    expect(b[0].x).toBeCloseTo(a[0].x * 2 + 50, 0)
  })
})

describe('readableColors', () => {
  const contrast = (a: string, b: string): number | null => {
    const x = parseHex(a)
    const y = parseHex(b)
    return x && y ? contrastRatio(x, y) : null
  }
  it('retire les couleurs trop proches du fond', () => {
    const out = readableColors(['#0072b2', '#f0e442', '#222222'], '#ffffff', contrast)
    expect(out).toContain('#0072b2')
    expect(out).not.toContain('#f0e442')
  })
  it('retombe sur noir ou blanc si rien ne convient', () => {
    expect(readableColors(['#f0e442'], '#ffffff', contrast)).toEqual(['#1e1f24'])
    expect(readableColors(['#111111'], '#000000', contrast)).toEqual(['#ffffff'])
  })
})
