import { describe, expect, it } from 'vitest'
import { addSounds, AUDIO_RATE, FADE_SECONDS, isAudioFile, mixTrack, silence } from './audioTrack'

const ramp = (n: number, v = 1): Float32Array => new Float32Array(n).fill(v)

describe('mixTrack', () => {
  it('longueur = durée × fréquence, deux canaux', () => {
    const [l, r] = mixTrack([ramp(1000)], 2, { volume: 1, fade: false })
    expect(l).toHaveLength(2 * AUDIO_RATE)
    expect(r).toHaveLength(2 * AUDIO_RATE)
  })
  it('un son mono est doublé sur les deux canaux', () => {
    const [l, r] = mixTrack([Float32Array.from([0.5, 0.25])], 0.0001, { volume: 1, fade: false })
    expect([...l]).toEqual([...r])
    expect(l[0]).toBeCloseTo(0.5)
  })
  it('stéréo : chaque canal garde son contenu', () => {
    const [l, r] = mixTrack([ramp(10, 0.2), ramp(10, -0.6)], 0.0001, { volume: 1, fade: false })
    expect(l[0]).toBeCloseTo(0.2)
    expect(r[0]).toBeCloseTo(-0.6)
  })
  it('plus de deux canaux : seuls les deux premiers servent', () => {
    const [l, r] = mixTrack([ramp(10, 0.1), ramp(10, 0.2), ramp(10, 0.9)], 0.0001, { volume: 1, fade: false })
    expect(l[0]).toBeCloseTo(0.1)
    expect(r[0]).toBeCloseTo(0.2)
  })
  it('plus courte que la vidéo : elle recommence', () => {
    const [l] = mixTrack([Float32Array.from([0.1, 0.2, 0.3])], 10 / AUDIO_RATE, { volume: 1, fade: false })
    expect([...l].slice(0, 7).map((v) => Math.round(v * 10))).toEqual([1, 2, 3, 1, 2, 3, 1])
  })
  it('plus longue que la vidéo : elle est coupée', () => {
    const src = Float32Array.from({ length: 10 * AUDIO_RATE }, (_, i) => i / (10 * AUDIO_RATE))
    const [l] = mixTrack([src], 1, { volume: 1, fade: false })
    expect(l).toHaveLength(AUDIO_RATE)
    expect(l[AUDIO_RATE - 1]).toBeCloseTo(0.1, 3)
  })
  it('volume : appliqué, ramené entre 0 et 1', () => {
    expect(mixTrack([ramp(10, 0.8)], 0.0001, { volume: 0.5, fade: false })[0][0]).toBeCloseTo(0.4)
    expect(mixTrack([ramp(10, 0.8)], 0.0001, { volume: 7, fade: false })[0][0]).toBeCloseTo(0.8)
    expect(mixTrack([ramp(10, 0.8)], 0.0001, { volume: -1, fade: false })[0][0]).toBe(0)
  })
  it('fondus : silence au début et à la fin, plein volume au milieu', () => {
    const seconds = 10
    const [l] = mixTrack([ramp(1000, 1)], seconds, { volume: 1, fade: true })
    expect(l[0]).toBe(0)
    expect(l[l.length - 1]).toBe(0)
    expect(l[Math.round(5 * AUDIO_RATE)]).toBeCloseTo(1)
    expect(l[Math.round((FADE_SECONDS / 2) * AUDIO_RATE)]).toBeCloseTo(0.5, 1)
  })
  it('vidéo très courte : les fondus se réduisent à la moitié chacun', () => {
    const [l] = mixTrack([ramp(1000, 1)], 1, { volume: 1, fade: true })
    expect(l[Math.round(0.25 * AUDIO_RATE)]).toBeCloseTo(0.5, 1)
    expect(Math.max(...l)).toBeLessThanOrEqual(1)
  })
  it('source vide ou durée nulle : silence', () => {
    expect(Math.max(...mixTrack([], 1, { volume: 1, fade: false })[0])).toBe(0)
    expect(mixTrack([ramp(10)], 0, { volume: 1, fade: false })[0]).toHaveLength(0)
  })
  it('jamais au-delà de ±1', () => {
    const [l] = mixTrack([ramp(10, 5)], 0.0001, { volume: 1, fade: false })
    expect(l[0]).toBe(1)
  })
})

describe('isAudioFile', () => {
  it('reconnaît les formats audio, sans tenir compte de la casse', () => {
    for (const n of ['a.mp3', 'B.WAV', 'c.m4a', 'd.flac', 'e.ogg', 'f.opus', 'g.aac']) expect(isAudioFile(n)).toBe(true)
  })
  it('refuse le reste', () => {
    for (const n of ['a.exe', 'a.mp4', 'mp3', 'a.mp3.txt', '']) expect(isAudioFile(n)).toBe(false)
  })
})

describe('addSounds', () => {
  const at = (s: number): number => Math.round(s * AUDIO_RATE)
  it('silence : la durée voulue, deux canaux', () => {
    const [l, r] = silence(2)
    expect(l).toHaveLength(2 * AUDIO_RATE)
    expect(r).toHaveLength(2 * AUDIO_RATE)
    expect(Math.max(...l)).toBe(0)
  })
  it('un son est placé à son instant, pas avant', () => {
    const track = silence(2)
    addSounds(track, [{ source: [ramp(AUDIO_RATE / 2, 0.5)], at: 1, until: 2, volume: 1, loop: false }])
    expect(track[0][at(0.9)]).toBe(0)
    expect(track[0][at(1.1)]).toBeCloseTo(0.5)
    expect(track[1][at(1.1)]).toBeCloseTo(0.5)
  })
  it('sans boucle, il s\'arrête à sa fin ; en boucle, il continue jusqu\'à la limite', () => {
    const a = silence(2)
    addSounds(a, [{ source: [ramp(AUDIO_RATE / 4, 0.5)], at: 0, until: 2, volume: 1, loop: false }])
    expect(a[0][at(0.4)]).toBe(0)
    const b = silence(2)
    addSounds(b, [{ source: [ramp(AUDIO_RATE / 4, 0.5)], at: 0, until: 1, volume: 1, loop: true }])
    expect(b[0][at(0.9)]).toBeCloseTo(0.5)
    expect(b[0][at(1.1)]).toBe(0)
  })
  it('s\'arrête à la limite même si le son est plus long', () => {
    const track = silence(3)
    addSounds(track, [{ source: [ramp(3 * AUDIO_RATE, 0.5)], at: 0, until: 1, volume: 1, loop: false }])
    expect(track[0][at(0.9)]).toBeCloseTo(0.5)
    expect(track[0][at(1.1)]).toBe(0)
  })
  it('les sons s\'additionnent, sans dépasser ±1', () => {
    const track = silence(1)
    addSounds(track, [
      { source: [ramp(AUDIO_RATE, 0.4)], at: 0, until: 1, volume: 1, loop: false },
      { source: [ramp(AUDIO_RATE, 0.4)], at: 0, until: 1, volume: 0.5, loop: false },
      { source: [ramp(AUDIO_RATE, 0.9)], at: 0, until: 1, volume: 1, loop: false }
    ])
    expect(track[0][10]).toBe(1)
  })
  it('volume appliqué ; événement hors de la bande ou source vide : sans effet', () => {
    const track = silence(1)
    addSounds(track, [
      { source: [ramp(100, 0.8)], at: 0, until: 1, volume: 0.5, loop: true },
      { source: [ramp(100, 0.8)], at: 5, until: 6, volume: 1, loop: true },
      { source: [], at: 0, until: 1, volume: 1, loop: true }
    ])
    expect(track[0][50]).toBeCloseTo(0.4)
    expect(track[0]).toHaveLength(AUDIO_RATE)
  })
})
