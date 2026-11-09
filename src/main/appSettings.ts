/**
 * Réglages généraux de l'application (purs, testés) : pour l'instant, rouvrir au lancement le document en cours lors de la session
 * précédente. Les autres réglages (langue, affichage, correcteur…) gardent leur propre stockage ; la fenêtre « Réglages » les réunit.
 */

export interface AppSettings {
  /** au lancement, rouvrir le dernier document enregistré (s'il existe encore) */
  reopenLast: boolean
}

export const DEFAULT_APP_SETTINGS: AppSettings = { reopenLast: true }

function parseObject(raw: unknown): Record<string, unknown> | null {
  let data: unknown = raw
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw)
    } catch {
      return null
    }
  }
  return data && typeof data === 'object' ? (data as Record<string, unknown>) : null
}

/** `defaults` : valeurs prises quand le fichier ne dit rien (les tests de bout en bout partent de documents vides, donc sans réouverture). */
export function parseAppSettings(raw: unknown, defaults: AppSettings = DEFAULT_APP_SETTINGS): AppSettings {
  const o = parseObject(raw)
  return { reopenLast: typeof o?.reopenLast === 'boolean' ? o.reopenLast : defaults.reopenLast }
}

/** Chemin du document en cours à la fermeture, tel qu'enregistré ; `null` si le document n'avait pas de fichier (ou si le contenu est invalide). */
export function parseLastDocument(raw: unknown): string | null {
  const path = parseObject(raw)?.path
  return typeof path === 'string' && path.length > 0 && path.length < 4096 && path.endsWith('.trame') ? path : null
}

/**
 * Le document à rouvrir au lancement : le dernier, sauf si le réglage est coupé, s'il n'y en a pas, ou si un fichier a été demandé
 * par le système (double-clic, glisser sur l'icône), qui passe toujours avant.
 */
export function lastDocumentToReopen(settings: AppSettings, last: string | null, systemFileWaiting: boolean): string | null {
  return settings.reopenLast && last && !systemFileWaiting ? last : null
}
