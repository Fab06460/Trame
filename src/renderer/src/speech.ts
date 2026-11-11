import { visualOrder, readable } from '@/accessibility'
import type { TrameDocument } from '@/types'

/** Lecture à voix haute : logique pure (texte à lire, découpage, choix de la voix, file de lecture). Les voix sont celles du système (Web Speech). */

export type ReadScope = 'selection' | 'page' | 'all'

export interface ReadItem {
  pageId: string
  pageIndex: number
  elementId: string
  text: string
}

export const MIN_RATE = 0.6
export const MAX_RATE = 1.6
export const DEFAULT_RATE = 1
export const clampRate = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(MAX_RATE, Math.max(MIN_RATE, v)) : DEFAULT_RATE)

/**
 * Les textes à lire, dans l'ordre où on les lit à l'écran (de haut en bas, puis de gauche à droite) : la sélection, la page courante ou
 * tout le document. Les textes masqués, transparents ou vides ne sont pas lus.
 */
export function readingItems(doc: Pick<TrameDocument, 'pages'>, scope: ReadScope, pageId: string, selectedIds: string[]): ReadItem[] {
  const out: ReadItem[] = []
  doc.pages.forEach((page, pageIndex) => {
    if (scope !== 'all' && page.id !== pageId) return
    const texts = page.elements.filter((e) => readable(e) && (scope !== 'selection' || selectedIds.includes(e.id)))
    for (const e of visualOrder(texts)) out.push({ pageId: page.id, pageIndex, elementId: e.id, text: e.text ?? '' })
  })
  return out
}

/** Longueur maximale d'un morceau lu d'un seul tenant : au-delà, certains moteurs s'arrêtent en route et la pause devient imprécise. */
export const MAX_CHUNK = 220

/**
 * Découpe un texte en morceaux à lire un par un : un par ligne, puis par phrase, puis à une virgule ou une espace si une phrase est trop
 * longue. Un morceau sans lettre ni chiffre (« • », « — ») est ignoré : le moteur le lirait comme un silence ou une erreur.
 */
export function splitSpeech(text: string, max = MAX_CHUNK): string[] {
  const out: string[] = []
  const flush = (s: string): void => {
    const t = s.replace(/\s+/g, ' ').trim()
    if (/[\p{L}\p{N}]/u.test(t)) out.push(t)
  }
  for (const line of text.split(/\r\n|\r|\n/)) {
    for (const sentence of line.split(/(?<=[.!?…](?:\s?["'’”»)\]])*)\s+(?!["'’”»)\]])/u)) {
      let rest = sentence.trim()
      while (rest.length > max) {
        let cut = Math.max(rest.lastIndexOf(', ', max), rest.lastIndexOf('; ', max), rest.lastIndexOf(': ', max))
        if (cut < max / 3) cut = rest.lastIndexOf(' ', max)
        if (cut < 1) cut = max
        flush(rest.slice(0, cut + 1))
        rest = rest.slice(cut + 1).trim()
      }
      flush(rest)
    }
  }
  return out
}

export interface VoiceInfo {
  voiceURI: string
  name: string
  lang: string
  local: boolean
}

const langOf = (v: string): string => v.toLowerCase().replace('_', '-').split('-')[0]

/**
 * La voix à utiliser : celle que l'utilisateur a choisie si elle existe encore, sinon une voix de la langue demandée (locale au
 * système avant une voix en ligne, puis la voix par défaut), sinon aucune (le moteur prendra sa voix par défaut).
 */
export function pickVoice(voices: VoiceInfo[], lang: string, chosenUri: string): VoiceInfo | null {
  const chosen = chosenUri ? voices.find((v) => v.voiceURI === chosenUri) : undefined
  if (chosen) return chosen
  const same = voices.filter((v) => langOf(v.lang) === langOf(lang))
  return same.find((v) => v.local) ?? same[0] ?? null
}

/** Les voix à proposer : celles de la langue de l'interface d'abord, puis les autres, chaque groupe par nom. */
export function voiceOptions(voices: VoiceInfo[], lang: string): VoiceInfo[] {
  const rank = (v: VoiceInfo): number => (langOf(v.lang) === langOf(lang) ? 0 : 1)
  return [...voices].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))
}

// --- file de lecture --------------------------------------------------------------------------------------------------------------

export type ReaderState = 'idle' | 'playing' | 'paused'

/** Ce qu'il faut du moteur de synthèse : le vrai (`speechSynthesis`) ou un faux dans les tests. */
export interface SynthLike {
  speak(utterance: UtteranceLike): void
  cancel(): void
  pause(): void
  resume(): void
}
export interface UtteranceLike {
  text: string
  lang: string
  rate: number
  voice: unknown
  onend: ((e: unknown) => void) | null
  onerror: ((e: { error?: string }) => void) | null
}
export interface SpeakOptions {
  lang: string
  rate: number
  voice: unknown
}

/** Trois erreurs de suite : le moteur ne marche pas, on arrête au lieu de parcourir tout le document en silence. */
const MAX_FAILURES = 3

/**
 * Lit des textes les uns après les autres, un morceau à la fois (la pause, l'arrêt et le changement de vitesse ou de voix sont ainsi
 * immédiats). Un arrêt invalide les fins de morceau en retard (`generation`) : annuler un morceau déclenche son événement d'erreur.
 */
export class Reader {
  state: ReaderState = 'idle'
  private generation = 0
  private units: Array<{ item: number; text: string }> = []
  private items: ReadItem[] = []
  private index = 0
  private lastItem = -1
  private failures = 0

  constructor(
    private synth: () => SynthLike | null,
    private make: (text: string) => UtteranceLike,
    private options: () => SpeakOptions,
    private events: {
      /** l'état ou l'avancement a changé (`item` = numéro du texte en cours, de 0 à `total` − 1) */
      change: (state: ReaderState, item: number, total: number) => void
      /** on passe à un nouveau texte */
      item: (item: ReadItem) => void
      /** le moteur échoue de façon répétée */
      failed: () => void
    }
  ) {}

  play(items: ReadItem[]): boolean {
    const synth = this.synth()
    this.stop()
    this.items = items
    this.units = items.flatMap((it, i) => splitSpeech(it.text).map((text) => ({ item: i, text })))
    if (!synth || !this.units.length) return false
    this.index = 0
    this.lastItem = -1
    this.failures = 0
    this.state = 'playing'
    this.next(++this.generation)
    return true
  }

  pause(): void {
    if (this.state !== 'playing') return
    this.synth()?.pause()
    this.state = 'paused'
    this.events.change(this.state, Math.max(0, this.lastItem), this.items.length)
  }

  resume(): void {
    if (this.state !== 'paused') return
    this.synth()?.resume()
    this.state = 'playing'
    this.events.change(this.state, Math.max(0, this.lastItem), this.items.length)
  }

  stop(): void {
    this.generation++
    if (this.state !== 'idle') {
      this.synth()?.cancel()
      this.state = 'idle'
      this.events.change('idle', 0, 0)
    }
  }

  private next(gen: number): void {
    if (gen !== this.generation) return
    const unit = this.units[this.index]
    const synth = this.synth()
    if (!unit || !synth) {
      this.state = 'idle'
      this.events.change('idle', 0, 0)
      return
    }
    if (unit.item !== this.lastItem) {
      this.lastItem = unit.item
      this.events.item(this.items[unit.item])
      if (gen !== this.generation) return // le gestionnaire a pu arrêter la lecture (texte disparu)
      this.events.change(this.state, unit.item, this.items.length)
    }
    const o = this.options()
    const u = this.make(unit.text)
    u.lang = o.lang
    u.rate = o.rate
    try {
      if (o.voice) u.voice = o.voice
    } catch {
      /* voix refusée par le moteur : il prendra sa voix par défaut */
    }
    u.onend = () => {
      if (gen !== this.generation) return
      this.failures = 0
      this.index++
      this.next(gen)
    }
    u.onerror = (e) => {
      if (gen !== this.generation || e.error === 'canceled' || e.error === 'interrupted') return
      if (++this.failures >= MAX_FAILURES) {
        this.stop()
        this.events.failed()
        return
      }
      this.index++
      this.next(gen)
    }
    synth.speak(u)
  }
}
