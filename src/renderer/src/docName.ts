export const DEFAULT_NAME = 'Sans titre'
export const MAX_NAME = 80

/** Nom de document valide : espaces rognés, sans caractère de contrôle, longueur bornée ; « Sans titre » s'il ne reste rien. */
export function cleanDocName(raw: unknown): string {
  if (typeof raw !== 'string') return DEFAULT_NAME
  // eslint-disable-next-line no-control-regex
  const name = raw.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME).trim()
  return name || DEFAULT_NAME
}

/** Nom utilisable comme nom de fichier : les caractères interdits ou séparateurs de chemin deviennent « - », et le nom ne commence pas par un point. */
export function fileSafeName(raw: unknown): string {
  const name = cleanDocName(raw).replace(/[\\/:*?"<>|]/g, '-').replace(/^\.+/, '').trim()
  return name || DEFAULT_NAME
}
