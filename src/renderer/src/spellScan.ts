import { findMisspellings, type Misspelling } from '@/spelling'
import type { SpellMarks } from '@/spellMarks'
import type { TrameDocument } from '@/types'

export interface Occurrence {
  pageId: string
  pageNumber: number
  elementId: string
  text: string
  spans: Misspelling[]
  span: Misspelling
}

export interface Issue {
  word: string
  suggestions: string[]
  occurrences: Occurrence[]
}

/** Les fautes possibles de tout le document, regroupées par mot, dans l'ordre des pages. */
export function scanDocument(doc: Pick<TrameDocument, 'pages'>, check: (words: string[]) => Array<{ suggestions: string[] } | null>, ignored: readonly string[]): Issue[] {
  const meta = new Map<string, { pageId: string; pageNumber: number; elementId: string; text: string }>()
  doc.pages.forEach((page, i) => {
    for (const el of page.elements) if (el.type === 'text' && !el.hidden && el.text?.trim()) meta.set(`${page.id}:${el.id}`, { pageId: page.id, pageNumber: i + 1, elementId: el.id, text: el.text })
  })
  const found = findMisspellings([...meta].map(([key, m]) => ({ key, text: m.text })), check, new Set(ignored))
  const issues = new Map<string, Issue>()
  for (const [key, spans] of found) {
    const m = meta.get(key)!
    for (const span of spans) {
      const issue = issues.get(span.word) ?? { word: span.word, suggestions: span.suggestions, occurrences: [] }
      issue.occurrences.push({ ...m, spans, span })
      issues.set(span.word, issue)
    }
  }
  return [...issues.values()]
}

/** Le nombre de fautes possibles (une par occurrence). */
export const issueCount = (issues: readonly Issue[] | null): number => issues?.reduce((n, i) => n + i.occurrences.length, 0) ?? 0

/** Les fautes de chaque texte, par identifiant de calque, pour les souligner sur le canevas. */
export function marksByElement(issues: readonly Issue[] | null): Record<string, SpellMarks> {
  const out: Record<string, SpellMarks> = {}
  for (const issue of issues ?? []) {
    for (const o of issue.occurrences) {
      const entry = (out[o.elementId] ??= { text: o.text, marks: [] })
      entry.marks.push({ start: o.span.start, end: o.span.end })
    }
  }
  return out
}
