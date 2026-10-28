/** Notes de l'orateur : un texte libre par page, jamais dessiné dans les exports image/PDF. */

export const MAX_NOTES = 20000

/** Texte saisi → texte stocké : fins de ligne normalisées, caractères de contrôle retirés, longueur bornée ; vide = pas de notes. */
export function limitNotes(text: string): string | undefined {
  // eslint-disable-next-line no-control-regex
  const clean = text.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').slice(0, MAX_NOTES)
  return clean === '' ? undefined : clean
}

/** Valeur lue dans un fichier : tout ce qui n'est pas du texte non vide est ignoré. */
export function cleanNotes(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.trim() === '') return undefined
  return limitNotes(value)
}

/** Supprime ou nettoie `notes` sur une page chargée. */
export function sanitizeNotes(page: { notes?: unknown }): void {
  const n = cleanNotes(page.notes)
  if (n === undefined) delete page.notes
  else page.notes = n
}
