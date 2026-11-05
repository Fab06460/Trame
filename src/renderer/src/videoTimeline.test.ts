import { describe, expect, it } from 'vitest'
import { DEFAULT_VIDEO, easeCss, layersAt, MAX_VIDEO_SECONDS, revealTimes, totalFrames, totalSeconds, transitionSeconds, videoProblem, videoSize, type VideoOptions } from './videoTimeline'
import type { PageTransition } from './transition'
import type { TrameElement, TramePage } from './types'

const el = (id: string, build?: number): TrameElement => ({ id, type: 'rect', x: 0, y: 0, width: 10, height: 10, rotation: 0, opacity: 1, fill: '#000', ...(build ? { build } : {}) })
const page = (id: string, elements: TrameElement[] = [], transition?: PageTransition): TramePage => ({ id, background: '#fff', elements, ...(transition ? { transition } : {}) })
const doc = (pages: TramePage[], transition?: PageTransition) => ({ pages, ...(transition ? { transition } : {}) })
const opts = (o: Partial<VideoOptions> = {}): VideoOptions => ({ ...DEFAULT_VIDEO, secondsPerPage: 4, ...o })

describe('taille et durée', () => {
  it('16:9 : le grand côté fait la taille choisie, côtés pairs', () => {
    expect(videoSize({ width: 1920, height: 1080 }, 1280)).toEqual({ width: 1280, height: 720 })
    expect(videoSize({ width: 1080, height: 1080 }, 854)).toEqual({ width: 854, height: 854 })
  })
  it('page en hauteur : la hauteur fait le grand côté', () => {
    expect(videoSize({ width: 794, height: 1123 }, 1920)).toEqual({ width: 1358, height: 1920 })
  })
  it('les côtés sont toujours pairs', () => {
    for (const [w, h] of [[1000, 333], [777, 1234], [1, 1000]]) {
      const s = videoSize({ width: w, height: h }, 1280)
      expect(s.width % 2).toBe(0)
      expect(s.height % 2).toBe(0)
    }
  })
  it('durée et nombre d\'images', () => {
    const d = doc([page('a'), page('b'), page('c')])
    expect(totalSeconds(d, opts())).toBe(12)
    expect(totalFrames(d, opts({ fps: 30 }))).toBe(360)
  })
  it('problèmes : aucune page, durée hors bornes, vidéo trop longue', () => {
    expect(videoProblem(doc([]), opts())).toBe('noPages')
    expect(videoProblem(doc([page('a')]), opts({ secondsPerPage: 0 }))).toBe('badSeconds')
    expect(videoProblem(doc([page('a')]), opts({ secondsPerPage: 500 }))).toBe('badSeconds')
    expect(videoProblem(doc(Array.from({ length: 200 }, (_, i) => page(String(i)))), opts({ secondsPerPage: 10 }))).toBe('tooLong')
    expect(MAX_VIDEO_SECONDS).toBe(1200)
    expect(videoProblem(doc([page('a')]), opts())).toBeNull()
  })
})

describe('easeCss', () => {
  it('part de 0, arrive à 1, croissante', () => {
    expect(easeCss(0)).toBeCloseTo(0, 5)
    expect(easeCss(1)).toBeCloseTo(1, 5)
    let prev = -1
    for (let i = 0; i <= 20; i++) {
      const v = easeCss(i / 20)
      expect(v).toBeGreaterThanOrEqual(prev)
      prev = v
    }
  })
  it('valeur connue de la courbe « ease » de CSS', () => {
    expect(easeCss(0.5)).toBeCloseTo(0.8024, 2)
  })
  it('hors bornes : ramené', () => {
    expect(easeCss(-3)).toBeCloseTo(0, 5)
    expect(easeCss(7)).toBeCloseTo(1, 5)
  })
})

describe('layersAt', () => {
  const d = doc([page('a'), page('b'), page('c')])
  it('première page : une seule couche, sans transition d\'arrivée', () => {
    expect(layersAt(d, opts(), 0)).toEqual([{ page: 0, step: 0, alpha: 1, tx: 0, scale: 1, shadow: false }])
  })
  it('page au repos : une couche', () => {
    expect(layersAt(d, opts(), 4 + 2)).toEqual([{ page: 1, step: 0, alpha: 1, tx: 0, scale: 1, shadow: false }])
  })
  it('fondu : la page partante dessous, l\'arrivante par-dessus avec une opacité croissante', () => {
    const [a, b] = layersAt(d, opts(), 4 + 0.15)
    expect([a.page, b.page]).toEqual([0, 1])
    expect(a.alpha).toBe(1)
    expect(b.alpha).toBeGreaterThan(0)
    expect(b.alpha).toBeLessThan(1)
  })
  it('à l\'instant de départ d\'une transition, l\'arrivante est invisible ; à la fin, elle est seule', () => {
    expect(layersAt(d, opts(), 4)[1].alpha).toBeCloseTo(0, 5)
    expect(layersAt(d, opts(), 4 + transitionSeconds(4) + 0.001)).toHaveLength(1)
  })
  it('glissement : la partante sort à gauche, l\'arrivante entre par la droite', () => {
    const [a, b] = layersAt(doc([page('a'), page('b')], 'slide'), opts(), 4 + 0.2)
    expect(a.tx).toBeLessThan(0)
    expect(b.tx).toBeGreaterThan(0)
    expect(b.tx - a.tx).toBeCloseTo(1, 5)
  })
  it('recouvrement : la partante reste en place, l\'arrivante a une ombre', () => {
    const [a, b] = layersAt(doc([page('a'), page('b')], 'cover'), opts(), 4 + 0.2)
    expect(a.tx).toBe(0)
    expect(b.shadow).toBe(true)
  })
  it('zoom : la partante grandit en s\'effaçant, l\'arrivante grossit en apparaissant', () => {
    const [a, b] = layersAt(doc([page('a'), page('b')], 'zoom'), opts(), 4 + 0.2)
    expect(a.scale).toBeGreaterThan(1)
    expect(a.alpha).toBeLessThan(1)
    expect(b.scale).toBeGreaterThan(0.85)
    expect(b.scale).toBeLessThan(1)
  })
  it('« aucune » : coupe franche', () => {
    expect(layersAt(doc([page('a'), page('b')], 'none'), opts(), 4 + 0.05)).toHaveLength(1)
  })
  it('la transition d\'une page est celle de la page (pas du document)', () => {
    const [, b] = layersAt(doc([page('a'), page('b', [], 'slide')], 'fade'), opts(), 4 + 0.2)
    expect(b.tx).toBeGreaterThan(0)
  })
  it('un temps hors de la vidéo reste sur la dernière page', () => {
    expect(layersAt(d, opts(), 999)[0].page).toBe(2)
    expect(layersAt(d, opts(), -5)[0].page).toBe(0)
  })
  it('transition plus courte sur une page très courte', () => {
    expect(transitionSeconds(1)).toBeCloseTo(1 / 3, 5)
    expect(transitionSeconds(10)).toBeCloseTo(0.45, 5)
  })
})

describe('apparition pas à pas', () => {
  const d = doc([page('a', [el('x'), el('y', 1), el('z', 2)])])
  it('au départ, aucun élément à clic ; ils apparaissent un par un, chacun en fondu', () => {
    const { at, fade } = revealTimes(6, 2)
    expect(layersAt(d, opts({ secondsPerPage: 6 }), 0)).toEqual([expect.objectContaining({ page: 0, step: 0 })])
    const mid = layersAt(d, opts({ secondsPerPage: 6 }), at[0] + fade / 2)
    expect(mid.map((l) => l.step)).toEqual([0, 1])
    expect(mid[1].alpha).toBeGreaterThan(0)
    expect(mid[1].alpha).toBeLessThan(1)
    expect(layersAt(d, opts({ secondsPerPage: 6 }), at[0] + fade + 0.01)).toEqual([expect.objectContaining({ step: 1, alpha: 1 })])
    expect(layersAt(d, opts({ secondsPerPage: 6 }), at[1] + fade + 0.01)).toEqual([expect.objectContaining({ step: 2 })])
  })
  it('les apparitions se répartissent après la transition d\'arrivée et finissent avant la fin de la page', () => {
    const { at, fade } = revealTimes(6, 3)
    expect(at[0]).toBeGreaterThan(transitionSeconds(6))
    expect(at[2] + fade).toBeLessThanOrEqual(6)
    expect([...at].sort((a, b) => a - b)).toEqual(at)
  })
  it('page d\'arrivée avec apparitions : la transition montre l\'étape 0, la page partante est entièrement montrée', () => {
    const two = doc([page('p', [el('a'), el('b', 1)]), page('q', [el('c'), el('d', 1)])])
    const [from, to] = layersAt(two, opts(), 4 + 0.1)
    expect(from).toMatchObject({ page: 0, step: 1 })
    expect(to).toMatchObject({ page: 1, step: 0 })
  })
  it('sans effets : coupes franches, tous les éléments visibles', () => {
    expect(layersAt(d, opts({ effects: false }), 0)).toEqual([expect.objectContaining({ page: 0, step: 2 })])
    expect(layersAt(doc([page('a'), page('b')]), opts({ effects: false }), 4.1)).toEqual([expect.objectContaining({ page: 1 })])
  })
})
