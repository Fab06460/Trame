import { describe, expect, it } from 'vitest'
import { clipSounds, clipsAt, DEFAULT_VIDEO, easeCss, layersAt, MAX_VIDEO_SECONDS, revealTimes, scheduleOf, totalFrames, totalSeconds, transitionSeconds, videoProblem, videoSize, voiceSounds, type Layer, type VideoOptions } from './videoTimeline'
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

describe('durée propre à une page', () => {
  it('une page garde sa durée, les autres celle de l\'export', () => {
    const d = doc([page('a'), { ...page('b'), seconds: 10 }, page('c')])
    const s = scheduleOf(d, opts())
    expect(s.durations).toEqual([4, 10, 4])
    expect(s.starts).toEqual([0, 4, 14])
    expect(s.total).toBe(18)
  })
  it('layersAt suit les durées propres : la page 2 commence à 4 s et dure 10 s', () => {
    const d = doc([page('a'), { ...page('b'), seconds: 10 }, page('c')])
    expect(layersAt(d, opts({ effects: false }), 13.9).map((l) => l.page)).toEqual([1])
    expect(layersAt(d, opts({ effects: false }), 14.1).map((l) => l.page)).toEqual([2])
  })
  it('un clip plus long qu\'une durée propre allonge quand même la page (case « allonger »)', () => {
    const c: TrameElement = { ...el('v'), type: 'image', video: { id: 'c', duration: 8 } }
    const d = doc([{ ...page('a', [c]), seconds: 3 }])
    expect(scheduleOf(d, opts()).durations[0]).toBe(8)
    expect(scheduleOf(d, opts({ fitClips: false })).durations[0]).toBe(3)
  })
  it('la durée totale maximale tient compte des durées propres', () => {
    const d = doc([{ ...page('a'), seconds: 120 }, ...Array.from({ length: 10 }, (_, i) => ({ ...page(`p${i}`), seconds: 120 }))])
    expect(videoProblem(d, opts())).toBe('tooLong')
  })
})

describe('voix off', () => {
  const voiced = (duration: number, seconds?: number): TramePage => ({ ...page('a'), voice: { id: 'v', duration }, ...(seconds ? { seconds } : {}) })
  it('une page plus courte que sa voix est allongée (silence avant et après compris)', () => {
    expect(scheduleOf(doc([voiced(10)]), opts()).durations[0]).toBeCloseTo(10.7, 5)
  })
  it('une page assez longue garde sa durée', () => {
    expect(scheduleOf(doc([voiced(2)]), opts()).durations[0]).toBe(4)
    expect(scheduleOf(doc([voiced(2, 9)]), opts()).durations[0]).toBe(9)
  })
  it('sans « allonger », la durée choisie est respectée', () => {
    expect(scheduleOf(doc([voiced(10)]), opts({ fitVoices: false })).durations[0]).toBe(4)
  })
  it('voiceSounds : la voix commence peu après le début de sa page et s\'arrête à sa fin', () => {
    const d = { ...doc([page('x'), voiced(2)]), voices: { v: 'data:audio/webm;base64,AAAA' } }
    const s = scheduleOf(d, opts())
    const [v] = voiceSounds(d, s)
    expect(v.id).toBe('v')
    expect(v.at).toBeCloseTo(s.starts[1] + 0.3, 5)
    expect(v.until).toBe(s.total)
  })
  it('voiceSounds : une page sans voix ou dont l\'enregistrement manque n\'a pas de son', () => {
    expect(voiceSounds(doc([page('x')]), scheduleOf(doc([page('x')]), opts()))).toEqual([])
    expect(voiceSounds(doc([voiced(2)]), scheduleOf(doc([voiced(2)]), opts()))).toEqual([])
  })
})

describe('clips vidéo', () => {
  const clipEl = (id: string, duration: number, extra: Partial<TrameElement> = {}): TrameElement => ({ ...el(id), type: 'image', video: { id: `c-${id}`, duration }, ...extra })
  const withClip = (d: number, extra: Partial<TrameElement> = {}, extraVideo: Partial<NonNullable<TrameElement['video']>> = {}) => {
    const c = clipEl('v', d, extra)
    c.video = { ...c.video!, ...extraVideo }
    return doc([page('a', [c]), page('b')])
  }

  it('une page garde sa durée si le clip tient dedans', () => {
    expect(scheduleOf(withClip(3), opts({ secondsPerPage: 4 })).durations).toEqual([4, 4])
  })
  it('une page est allongée pour montrer un clip plus long en entier', () => {
    const s = scheduleOf(withClip(9.2), opts({ secondsPerPage: 4 }))
    expect(s.durations).toEqual([9.2, 4])
    expect(s.starts).toEqual([0, 9.2])
    expect(s.total).toBeCloseTo(13.2)
  })
  it('sans « adapter », la durée reste celle choisie', () => {
    expect(scheduleOf(withClip(9.2), opts({ secondsPerPage: 4, fitClips: false })).durations).toEqual([4, 4])
  })
  it('un clip en boucle n\'allonge pas la page', () => {
    expect(scheduleOf(withClip(9.2, {}, { loop: true }), opts({ secondsPerPage: 4 })).durations[0]).toBe(4)
  })
  it('un clip qui apparaît à un clic demande plus de temps (il démarre plus tard)', () => {
    const d = doc([page('a', [el('x'), clipEl('v', 3, { build: 1 })])])
    const s = scheduleOf(d, opts({ secondsPerPage: 4 }))
    expect(s.durations[0]).toBeGreaterThan(5)
    // le clip a bien le temps de se finir avant la fin de la page
    const frame = clipsAt(d, opts({ secondsPerPage: 4 }), s, layersAt(d, opts({ secondsPerPage: 4 }), s.total - 0.01, s)[0], s.total - 0.01)
    expect(frame[0].time).toBeCloseTo(3 - 0.05, 1)
  })
  it('la durée totale tient compte des pages allongées (et du plafond)', () => {
    expect(totalSeconds(withClip(9.2), opts({ secondsPerPage: 4 }))).toBeCloseTo(13.2)
    expect(videoProblem(withClip(1500), opts({ secondsPerPage: 4 }))).toBe('tooLong')
  })
  it('layersAt suit les départs de pages inégales', () => {
    const d = withClip(9.2)
    const o = opts({ secondsPerPage: 4 })
    expect(layersAt(d, o, 9.0)[0].page).toBe(0)
    // 0,3 s après le départ de la page 2, on est encore dans la transition : la page 1 est dessous, la page 2 dessus
    expect(layersAt(d, o, 9.5).map((l) => l.page)).toEqual([0, 1])
    expect(layersAt(d, o, 10.5).map((l) => l.page)).toEqual([1])
  })

  it('clipsAt : le clip démarre avec sa page, son temps avance avec la vidéo', () => {
    const d = withClip(9)
    const o = opts({ secondsPerPage: 4 })
    const s = scheduleOf(d, o)
    const l = layersAt(d, o, 2, s)[0]
    expect(clipsAt(d, o, s, l, 2)).toEqual([expect.objectContaining({ time: 2 })])
    expect(clipsAt(d, o, s, l, 0)[0].time).toBe(0)
  })
  it('clipsAt : sans boucle il reste sur sa dernière image, en boucle il recommence', () => {
    const o = opts({ secondsPerPage: 1, fitClips: false })
    const plain = withClip(2)
    const sp = scheduleOf(plain, o)
    const lp: Layer = { page: 0, step: 0, alpha: 1, tx: 0, scale: 1, shadow: false }
    expect(clipsAt(plain, o, sp, lp, 5)[0].time).toBeCloseTo(1.95, 2)
    const loop = withClip(2, {}, { loop: true })
    expect(clipsAt(loop, o, scheduleOf(loop, o), lp, 5)[0].time).toBeCloseTo(1, 5)
  })
  it('clipsAt : un clip à clic n\'est pas montré avant son étape', () => {
    const d = doc([page('a', [clipEl('v', 3, { build: 1 })])])
    const o = opts({ secondsPerPage: 6 })
    const s = scheduleOf(d, o)
    expect(clipsAt(d, o, s, { page: 0, step: 0, alpha: 1, tx: 0, scale: 1, shadow: false }, 0.1)).toEqual([])
    expect(clipsAt(d, o, s, { page: 0, step: 1, alpha: 1, tx: 0, scale: 1, shadow: false }, s.total - 0.5)).toHaveLength(1)
  })
  it('clipsAt : la page quittée garde son horloge pendant la transition', () => {
    const d = withClip(9)
    const o = opts({ secondsPerPage: 4 })
    const s = scheduleOf(d, o)
    const [from] = layersAt(d, o, s.starts[1] + 0.1, s)
    expect(from.page).toBe(0)
    // son horloge continue (9,1 s) mais le clip de 9 s est fini : il reste sur sa dernière image
    expect(clipsAt(d, o, s, from, s.starts[1] + 0.1)[0].time).toBeCloseTo(8.95, 5)
  })

  it('clipSounds : un son par clip non muet, de sa page, avec ses réglages', () => {
    const d = doc([page('a', [clipEl('v', 3, {}), { ...clipEl('m', 3), video: { id: 'c-m', duration: 3, muted: true } }, { ...clipEl('q', 3), video: { id: 'c-q', duration: 3, volume: 0 } }]), page('b', [{ ...clipEl('w', 2), video: { id: 'c-w', duration: 2, loop: true, volume: 0.5 } }])])
    const o = opts({ secondsPerPage: 4 })
    const s = scheduleOf(d, o)
    const sounds = clipSounds(d, o, s)
    expect(sounds.map((x) => x.id)).toEqual(['c-v', 'c-w'])
    expect(sounds[0]).toMatchObject({ at: 0, until: s.durations[0], volume: 1, loop: false })
    expect(sounds[1]).toMatchObject({ at: s.starts[1], volume: 0.5, loop: true })
  })

  it('un clip monté : sa durée de lecture décide de l\'allongement de la page', () => {
    const o = opts({ secondsPerPage: 4 })
    // 10 s dont on garde 6 s, ×2 : 3 s, la page de 4 s suffit
    expect(scheduleOf(withClip(10, {}, { start: 2, end: 8, speed: 2 }), o).durations[0]).toBe(4)
    // 10 s ralentis ×0,5 : 20 s
    expect(scheduleOf(withClip(10, {}, { speed: 0.5 }), o).durations[0]).toBe(20)
  })
  it('clipsAt : l\'instant montré est celui du clip d\'origine (début et vitesse appliqués)', () => {
    const d = withClip(10, {}, { start: 2, end: 8, speed: 2 })
    const o = opts({ secondsPerPage: 4 })
    const s = scheduleOf(d, o)
    const l: Layer = { page: 0, step: 0, alpha: 1, tx: 0, scale: 1, shadow: false }
    expect(clipsAt(d, o, s, l, 0)[0].time).toBe(2)
    expect(clipsAt(d, o, s, l, 1)[0].time).toBe(4)
    expect(clipsAt(d, o, s, l, 3.9)[0].time).toBeCloseTo(7.95, 2)
  })
  it('clipSounds : transmet le morceau gardé et la vitesse', () => {
    const d = withClip(10, {}, { start: 2, end: 8, speed: 2 })
    expect(clipSounds(d, opts({ secondsPerPage: 4 }), scheduleOf(d, opts({ secondsPerPage: 4 })))[0]).toMatchObject({ start: 2, end: 8, speed: 2 })
  })
})
