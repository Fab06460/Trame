/**
 * Aide intégrée : des rubriques courtes, faites de blocs simples. Les raccourcis sont notés à la façon de macOS (⌘N) et convertis à
 * l'affichage (`shortcutText`) ; `**gras**` est le seul balisage dans le texte.
 */
export type HelpBlock =
  | { p: string }
  | { steps: string[] }
  | { tip: string }
  | { keys: [keys: string, action: string][] }

export type HelpTopic = {
  id: string
  /** identifiant du groupe dans `HelpContent.groups` */
  group: string
  title: string
  /** mots que l'on peut chercher sans qu'ils figurent dans le texte (« pdf », « mp4 »…) */
  keywords?: string
  body: HelpBlock[]
}

export type HelpContent = {
  /** groupes dans l'ordre d'affichage */
  groups: { id: string; title: string }[]
  topics: HelpTopic[]
}
