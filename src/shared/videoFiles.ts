/** Formats de clip vidéo que le lecteur de l'application sait jouer, avec leur type de média. */
export const VIDEO_TYPES: Record<string, string> = {
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  ogv: 'video/ogg'
}

/** Taille maximale d'un clip : il est gardé dans le document (en base64, un tiers de plus). */
export const MAX_CLIP_BYTES = 50 * 1024 * 1024

const extOf = (name: string): string => {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
}

export const isVideoFile = (name: string): boolean => extOf(name) in VIDEO_TYPES
export const videoMime = (name: string): string | null => VIDEO_TYPES[extOf(name)] ?? null

/** Réponse du processus principal à « choisir un clip vidéo » : le fichier, une raison de refus, ou rien (choix annulé). */
export type VideoPick = { name: string; mime: string; bytes: Uint8Array } | { error: 'tooBig' | 'unreadable' } | null
