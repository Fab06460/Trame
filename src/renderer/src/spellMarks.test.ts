import { describe, expect, it } from 'vitest'
import { lineStarts, marksOnLine, wavePoints } from './spellMarks'

describe('lineStarts', () => {
  it('retrouve où commence chaque ligne, espaces de coupure et retours à la ligne passés', () => {
    expect(lineStarts('un deux trois\nquatre', ['un deux', 'trois', 'quatre'])).toEqual([0, 8, 14])
  })
  it('une ligne répétée est retrouvée à sa place, dans l\'ordre', () => {
    expect(lineStarts('ab ab ab', ['ab', 'ab', 'ab'])).toEqual([0, 3, 6])
  })
  it('une ligne introuvable donne -1 sans décaler les suivantes', () => {
    expect(lineStarts('un deux', ['un', 'zzz', 'deux'])).toEqual([0, -1, 3])
  })
})

describe('marksOnLine', () => {
  it('garde la part des mots qui tombe sur la ligne, en indices de ligne', () => {
    expect(marksOnLine([{ start: 8, end: 13 }], 8, 5)).toEqual([{ start: 0, end: 5 }])
    expect(marksOnLine([{ start: 2, end: 6 }], 4, 10)).toEqual([{ start: 0, end: 2 }])
  })
  it('ignore les mots d\'autres lignes', () => {
    expect(marksOnLine([{ start: 0, end: 2 }, { start: 20, end: 25 }], 4, 10)).toEqual([])
  })
})

describe('wavePoints', () => {
  it('une ligne brisée de x0 à x1 qui alterne au-dessus et au-dessous de y', () => {
    const p = wavePoints(10, 20, 100, 4, 1)
    expect(p[0]).toEqual([10, 99])
    expect(p[1]).toEqual([14, 101])
    expect(p[p.length - 1][0]).toBe(20)
    expect(p.every(([, y]) => Math.abs(y - 100) === 1)).toBe(true)
  })
})
