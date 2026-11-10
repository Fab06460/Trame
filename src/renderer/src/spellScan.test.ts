import { describe, expect, it } from 'vitest'
import { issueCount, marksByElement, scanDocument } from './spellScan'

const check = (words: string[]): Array<{ suggestions: string[] } | null> => words.map((w) => (w === 'bonjuor' || w === 'monde' ? { suggestions: ['x'] } : null))
const text = (id: string, t: string, hidden = false) => ({ id, type: 'text', text: t, hidden })
const doc = { pages: [{ id: 'p1', elements: [text('a', 'bonjuor tout le monde'), text('b', 'rien', false)] }, { id: 'p2', elements: [text('c', 'bonjuor'), text('d', 'bonjuor', true)] }] }

describe('scanDocument', () => {
  const issues = scanDocument(doc as never, check, [])
  it('regroupe les fautes par mot, avec leurs occurrences dans l\'ordre des pages ; les calques masqués sont laissés', () => {
    expect(issues.map((i) => i.word)).toEqual(['bonjuor', 'monde'])
    expect(issues[0].occurrences.map((o) => [o.pageNumber, o.elementId])).toEqual([[1, 'a'], [2, 'c']])
    expect(issueCount(issues)).toBe(3)
    expect(issueCount(null)).toBe(0)
  })
  it('un mot ignoré n\'est plus signalé', () => {
    expect(scanDocument(doc as never, check, ['bonjuor']).map((i) => i.word)).toEqual(['monde'])
  })
  it('donne, pour chaque texte, ses fautes et le texte qu\'elles concernent', () => {
    const marks = marksByElement(issues)
    expect(marks.a).toEqual({ text: 'bonjuor tout le monde', marks: [{ start: 0, end: 7 }, { start: 16, end: 21 }] })
    expect(marks.c.marks).toEqual([{ start: 0, end: 7 }])
    expect(marks.b).toBeUndefined()
  })
})
