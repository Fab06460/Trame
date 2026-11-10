import { fr } from './fr'
import type { HelpBlock, HelpContent, HelpTopic } from './types'

export type { HelpBlock, HelpContent, HelpTopic } from './types'

/**
 * Contenu de l'aide : rédigé en français ; une langue sans rubrique traduite retombe sur le français. Quand une traduction paraît,
 * l'ajouter ici (`TRANSLATED`) : seules les rubriques qu'elle contient remplacent celles du français.
 */
const TRANSLATED: Record<string, Partial<HelpContent> | undefined> = {}

export function helpContent(locale: string): HelpContent {
  const own = TRANSLATED[locale]
  if (!own) return fr
  const byId = new Map((own.topics ?? []).map((t) => [t.id, t]))
  return {
    groups: own.groups?.length ? own.groups : fr.groups,
    topics: fr.topics.map((t) => byId.get(t.id) ?? t)
  }
}

/** Minuscules sans accents, pour chercher « presentation » et trouver « présentation ». */
export function fold(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

export function blockText(b: HelpBlock): string {
  if ('p' in b) return b.p
  if ('tip' in b) return b.tip
  if ('steps' in b) return b.steps.join(' ')
  return b.keys.map(([k, a]) => `${k} ${a}`).join(' ')
}

/**
 * Rubriques qui contiennent tous les mots cherchés (titre, mots-clés, texte), celles dont le titre correspond en premier.
 * Une recherche vide rend tout, dans l'ordre du contenu.
 */
export function searchHelp(topics: HelpTopic[], query: string): HelpTopic[] {
  const words = fold(query).split(/\s+/).filter(Boolean)
  if (!words.length) return topics
  const scored: { topic: HelpTopic; inTitle: boolean; order: number }[] = []
  topics.forEach((topic, order) => {
    const title = fold(topic.title)
    const all = `${title} ${fold(topic.keywords ?? '')} ${fold(topic.body.map(blockText).join(' '))}`
    if (words.every((w) => all.includes(w))) scored.push({ topic, inTitle: words.every((w) => title.includes(w)), order })
  })
  return scored.sort((a, b) => Number(b.inTitle) - Number(a.inTitle) || a.order - b.order).map((s) => s.topic)
}
