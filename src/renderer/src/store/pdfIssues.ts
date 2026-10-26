import { create } from 'zustand'
import { fontkit, type FontkitFont } from '@/fontkit'
import { loadFontBytes, type FontChoice } from '@/pdfFonts'
import { checkText, type TextIssue } from '@/pdfTextCheck'
import type { TrameDocument } from '@/types'

export interface IssueEntry {
  issue: TextIssue
  /** page (à partir de 1) et texte, pour les messages */
  page: number
  text: string
}

/** Textes du document qui seraient exportés en image dans le PDF (clé : identifiant de l'élément). Mis à jour par `watchDocument`. */
export const usePdfIssues = create<{ issues: Record<string, IssueEntry> }>(() => ({ issues: {} }))

const layouts = new Map<string, Promise<FontkitFont | null>>()

/** Police lue une seule fois par variante (sans pdf-lib : seule la couverture des caractères nous intéresse). */
function liveLayout(choice: FontChoice): Promise<FontkitFont | null> {
  const key = `${choice.def.slug}/${choice.variant}`
  if (!layouts.has(key)) {
    layouts.set(
      key,
      (async () => {
        try {
          const bytes = await loadFontBytes(choice)
          return bytes ? fontkit.create(bytes) : null
        } catch {
          return null
        }
      })()
    )
  }
  return layouts.get(key)!
}

// Le verdict ne dépend que de la police, du style et du texte : on évite de tout recalculer à chaque déplacement d'un élément
const verdicts = new Map<string, TextIssue | null>()
const MAX_CACHED = 1000

/** Recalcule les avertissements d'un document (tous ses textes, toutes ses pages). Annulable : retourne null si `isStale()` devient vrai. */
export async function computeIssues(doc: TrameDocument, isStale: () => boolean = () => false): Promise<Record<string, IssueEntry> | null> {
  const next: Record<string, IssueEntry> = {}
  for (const [i, page] of doc.pages.entries()) {
    for (const el of page.elements) {
      if (el.type !== 'text') continue
      const key = JSON.stringify([el.fontFamily, el.fontStyle, el.text])
      let verdict = verdicts.get(key)
      if (verdict === undefined) {
        verdict = await checkText(el, liveLayout)
        if (isStale()) return null
        if (verdicts.size >= MAX_CACHED) verdicts.clear()
        verdicts.set(key, verdict)
      }
      if (verdict) next[el.id] = { issue: verdict, page: i + 1, text: el.text ?? '' }
    }
  }
  return next
}

/** Met à jour le store après chaque modification du document (avec un léger délai pendant la frappe). Retourne la fonction d'arrêt. */
export function watchDocument(doc: TrameDocument, delayMs = 250): () => void {
  let stale = false
  const timer = setTimeout(async () => {
    const next = await computeIssues(doc, () => stale)
    if (!next || stale) return
    // ne pas réveiller toute l'interface si rien n'a changé
    if (JSON.stringify(next) !== JSON.stringify(usePdfIssues.getState().issues)) usePdfIssues.setState({ issues: next })
  }, delayMs)
  return () => {
    stale = true
    clearTimeout(timer)
  }
}
