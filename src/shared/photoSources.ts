/** Sources de photos libres de droits interrogées sur demande (le réseau passe par le processus principal). */
export const PHOTO_SOURCES = ['commons', 'openverse', 'nasa', 'cleveland'] as const
export type PhotoSource = (typeof PHOTO_SOURCES)[number]

/** « Automatique » : Wikimedia Commons, puis Openverse s'il ne répond pas ; NASA et Cleveland se choisissent à la main (ce sont des fonds thématiques). */
export type PhotoSourceChoice = 'auto' | PhotoSource

/** Noms propres des services : jamais traduits. */
export const PHOTO_SOURCE_NAMES: Record<PhotoSource, string> = {
  commons: 'Wikimedia Commons',
  openverse: 'Openverse',
  nasa: 'NASA Images',
  cleveland: 'Cleveland Museum of Art'
}

/** Ordre d'interrogation d'un choix : « auto » essaie Commons puis Openverse (Openverse a de longues pannes). */
export function sourcesFor(choice: unknown): PhotoSource[] {
  return PHOTO_SOURCES.includes(choice as PhotoSource) ? [choice as PhotoSource] : ['commons', 'openverse']
}
