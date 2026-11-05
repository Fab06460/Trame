/** Formats audio que le décodeur de l'application sait lire (musique de fond des vidéos). */
export const AUDIO_EXTENSIONS = ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'oga', 'opus', 'flac'] as const

/** Taille maximale du fichier audio choisi. */
export const MAX_AUDIO_BYTES = 40 * 1024 * 1024

/** Un fichier dont l'extension est celle d'un format audio connu. */
export function isAudioFile(name: string): boolean {
  const dot = name.lastIndexOf('.')
  return dot > 0 && (AUDIO_EXTENSIONS as readonly string[]).includes(name.slice(dot + 1).toLowerCase())
}

/** Réponse du processus principal à « choisir un fichier audio » : le fichier, une raison de refus, ou rien (choix annulé). */
export type AudioPick = { name: string; bytes: Uint8Array } | { error: 'tooBig' | 'unreadable' } | null
