/** Un mot candidat à la vérification, avec sa place dans le texte (indices de caractères). */
export interface WordSpan {
  word: string
  start: number
  end: number
}

export interface Misspelling extends WordSpan {
  suggestions: string[]
}

/** Réponse du correcteur pour une liste de mots : null = bien écrit, sinon des suggestions. */
export type Checker = (words: string[]) => Array<{ suggestions: string[] } | null>

/** Plus de mots distincts que cela dans un document : on ne vérifie que les premiers (le correcteur du système n'est pas fait pour des dizaines de milliers de mots). */
export const MAX_WORDS = 6000

/** Ce qui n'est pas du texte à corriger : adresses web, courriels, marques de fusion `{{champ}}`, mots-dièse et mentions. */
const SKIP = /(?:https?:\/\/|www\.)\S+|\S+@\S+\.\S+|\{\{[^}]*\}\}|[#@]\p{L}[\p{L}\p{N}_]*/gu
/** Un mot : lettres, avec apostrophes ou traits d'union au milieu (« aujourd'hui », « peut-être »). */
const TOKEN = /[\p{L}\p{M}]+(?:['’‑-][\p{L}\p{M}]+)*/gu
const DIGIT = /[\p{N}_]/u

/** Un mot qu'on ne vérifie pas : sigle (tout en capitales), capitale au milieu (iPhone, YouTube), ou écriture non latine. */
function skipped(word: string): boolean {
  if (word.length < 2) return true
  if (word === word.toUpperCase() && word !== word.toLowerCase()) return true
  if (/\p{Ll}\p{Lu}/u.test(word)) return true
  return !/^[\p{Script=Latin}\p{M}'’‑-]+$/u.test(word)
}

/** Les mots d'un texte à vérifier, avec leur place. Les mots collés à un chiffre (A4, 3D, 2e) et ceux qu'on ne corrige pas sont ignorés. */
export function wordsIn(text: string): WordSpan[] {
  const masked = text.replace(SKIP, (m) => ' '.repeat(m.length))
  const out: WordSpan[] = []
  for (const m of masked.matchAll(TOKEN)) {
    const start = m.index as number
    const end = start + m[0].length
    if ((start > 0 && DIGIT.test(masked[start - 1])) || (end < masked.length && DIGIT.test(masked[end]))) continue
    if (!skipped(m[0])) out.push({ word: m[0], start, end })
  }
  return out
}

/** Un mot composé (apostrophe, trait d'union) se vérifie d'abord en entier, puis par morceaux s'il est refusé. */
const COMPOUND = /['’‑-]/

function partsOf(span: WordSpan): WordSpan[] {
  const parts: WordSpan[] = []
  for (const m of span.word.matchAll(/[\p{L}\p{M}]+/gu)) {
    const start = span.start + (m.index as number)
    if (!skipped(m[0])) parts.push({ word: m[0], start, end: start + m[0].length })
  }
  return parts
}

export interface TextItem {
  key: string
  text: string
}

/**
 * Les fautes possibles de plusieurs textes, en deux passes sur le correcteur : les mots entiers, puis les morceaux des mots composés
 * refusés (« aujourd'hui » est un mot ; « aujourd » et « hui » ne le sont pas). Les mots sont dédoublonnés avant l'appel.
 * Retourne, pour chaque clé, ses fautes dans l'ordre du texte (aucune entrée si le texte est sain).
 */
export function findMisspellings(items: readonly TextItem[], check: Checker, ignored: ReadonlySet<string> = new Set()): Map<string, Misspelling[]> {
  const spans = items.map((it) => ({ key: it.key, spans: wordsIn(it.text).filter((s) => !ignored.has(s.word.toLowerCase())) }))
  const verdicts = new Map<string, { suggestions: string[] } | null>()
  const ask = (words: Iterable<string>): void => {
    const fresh = [...new Set(words)].filter((w) => !verdicts.has(w)).slice(0, Math.max(0, MAX_WORDS - verdicts.size))
    if (!fresh.length) return
    const res = check(fresh)
    fresh.forEach((w, i) => verdicts.set(w, res[i] ?? null))
  }
  ask(spans.flatMap((s) => s.spans.map((x) => x.word)))
  const compoundParts = spans.flatMap((s) => s.spans.filter((x) => COMPOUND.test(x.word) && verdicts.get(x.word)).flatMap(partsOf))
  ask(compoundParts.map((p) => p.word))

  const out = new Map<string, Misspelling[]>()
  for (const { key, spans: list } of spans) {
    const found: Misspelling[] = []
    for (const span of list) {
      const v = verdicts.get(span.word)
      if (!v) continue
      if (COMPOUND.test(span.word)) {
        // refusé en entier : on ne signale que les morceaux eux-mêmes refusés (aucun = le mot composé est accepté tel quel par morceaux)
        for (const part of partsOf(span)) {
          const pv = verdicts.get(part.word)
          if (pv && !ignored.has(part.word.toLowerCase())) found.push({ ...part, suggestions: pv.suggestions })
        }
      } else found.push({ ...span, suggestions: v.suggestions })
    }
    if (found.length) out.set(key, found)
  }
  return out
}

/** Remplace tous les mots signalés égaux à `word` dans le texte. Un indice qui ne correspond plus au texte (texte modifié depuis) est laissé tel quel. */
export function replaceWord(text: string, misspellings: readonly Misspelling[], word: string, replacement: string): string {
  let out = text
  for (const m of [...misspellings].filter((x) => x.word === word).sort((a, b) => b.start - a.start)) {
    if (out.slice(m.start, m.end) !== word) continue
    out = out.slice(0, m.start) + replacement + out.slice(m.end)
  }
  return out
}

/** Quelques mots autour de la faute, pour la reconnaître dans la liste ; le mot est au milieu. */
export function contextAround(text: string, m: Pick<WordSpan, 'start' | 'end'>, radius = 28): { before: string; word: string; after: string } {
  const flat = (s: string): string => s.replace(/\s+/g, ' ')
  const before = flat(text.slice(Math.max(0, m.start - radius), m.start))
  const after = flat(text.slice(m.end, m.end + radius))
  return { before: (m.start > radius ? '…' : '') + before, word: text.slice(m.start, m.end), after: after + (m.end + radius < text.length ? '…' : '') }
}
