import { basename } from 'path'

/** Extensions que l'export vers un dossier accepte d'écrire. */
export const EXPORT_EXTENSIONS = ['png', 'jpg', 'svg', 'pdf']

/**
 * Nom de fichier accepté pour un export vers un dossier : un simple nom (jamais de chemin), à l'extension connue, sans caractère
 * interdit ni point initial. Retourne le nom, ou null s'il est refusé. Le renderer ne peut ainsi écrire que des images dans le
 * dossier que l'utilisateur a choisi.
 */
export function safeExportName(name: unknown): string | null {
  if (typeof name !== 'string' || name.length === 0 || name.length > 180) return null
  if (basename(name) !== name || name.includes('\\')) return null
  if (name.startsWith('.')) return null
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f<>:"|?*]/.test(name)) return null
  const ext = name.split('.').pop()!.toLowerCase()
  return EXPORT_EXTENSIONS.includes(ext) ? name : null
}
