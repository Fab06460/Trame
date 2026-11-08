import { describe, expect, it } from 'vitest'
import { drift, formatDrift, pageSpent, plannedBefore, plannedMs, plannedTotal, recap, secondsFromSpent } from './timing'
import type { TrameDocument } from './types'

const doc = (seconds: Array<number | undefined>): Pick<TrameDocument, 'pages'> => ({ pages: seconds.map((s, i) => ({ id: 'p' + i, background: '#fff', elements: [], ...(s === undefined ? {} : { seconds: s }) })) })

describe('temps prévu', () => {
  it('vient de la durée de la page, 0 sans durée', () => {
    expect(plannedMs({ seconds: 90 })).toBe(90000)
    expect(plannedMs({ seconds: 2.5 })).toBe(2500)
    expect(plannedMs({})).toBe(0)
  })
  it('total et cumul avant une page', () => {
    const d = doc([60, undefined, 30])
    expect(plannedTotal(d)).toBe(90000)
    expect(plannedBefore(d, 0)).toBe(0)
    expect(plannedBefore(d, 2)).toBe(60000)
    expect(plannedBefore(d, 3)).toBe(90000)
  })
})

describe('temps passé', () => {
  it('cumule les visites précédentes et la visite en cours', () => {
    expect(pageSpent([5000, 12000], 1000, 1, 4000)).toBe(15000)
    expect(pageSpent([], 1000, 0, 4000)).toBe(3000)
    expect(pageSpent([], 5000, 0, 4000)).toBe(0)
  })
})

describe('drift', () => {
  const d = doc([60, 60, 60])
  it('retard : plus de temps passé ailleurs que de temps prévu avant', () => {
    expect(drift(d, [75000, 0, 0], 1)).toBe(15000)
  })
  it('avance : moins de temps passé', () => {
    expect(drift(d, [40000, 0, 0], 1)).toBe(-20000)
  })
  it('à l\'arrivée sur la première page : nul', () => {
    expect(drift(d, [0, 0, 0], 0)).toBe(0)
  })
  it('ignore le temps de la page courante', () => {
    expect(drift(d, [60000, 99999, 0], 1)).toBe(0)
  })
  it('une page sautée compte comme du temps gagné', () => {
    expect(drift(d, [10000, 0, 0], 2)).toBe(10000 - 120000)
  })
  it('sans aucun temps prévu : 0', () => {
    expect(drift(doc([undefined, undefined]), [50000, 0], 1)).toBe(0)
  })
})

describe('formatDrift', () => {
  it('signe et durée', () => {
    expect(formatDrift(42000)).toBe('+0:42')
    expect(formatDrift(-70000)).toBe('−1:10')
    expect(formatDrift(400)).toBe('0:00')
    expect(formatDrift(-400)).toBe('0:00')
  })
})

describe('recap', () => {
  it('une ligne par page avec l\'écart quand un temps est prévu', () => {
    const r = recap(doc([60, undefined]), [75000, 30000])
    expect(r.rows).toEqual([
      { index: 0, pageId: 'p0', spent: 75000, planned: 60000, diff: 15000 },
      { index: 1, pageId: 'p1', spent: 30000, planned: 0, diff: null }
    ])
    expect(r.spent).toBe(105000)
    expect(r.planned).toBe(60000)
  })
  it('une page jamais vue a 0', () => {
    expect(recap(doc([10]), []).rows[0].spent).toBe(0)
  })
})

describe('secondsFromSpent', () => {
  it('arrondit à la seconde, entre 1 et 120', () => {
    expect(secondsFromSpent(45400)).toBe(45)
    expect(secondsFromSpent(45600)).toBe(46)
    expect(secondsFromSpent(1000)).toBe(1)
    expect(secondsFromSpent(999999)).toBe(120)
  })
  it('null pour une page à peine regardée', () => {
    expect(secondsFromSpent(0)).toBeNull()
    expect(secondsFromSpent(999)).toBeNull()
    expect(secondsFromSpent(Number.NaN)).toBeNull()
  })
})
