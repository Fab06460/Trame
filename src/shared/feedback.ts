/**
 * Retours des testeurs : formulaire Google (sans compte pour le répondant), rempli à l'avance avec la version, le système et la langue.
 * L'application n'envoie rien d'elle-même : le testeur ouvre le formulaire dans son navigateur et choisit ce qu'il y écrit.
 * Pour changer de formulaire, il suffit de modifier cette adresse et les identifiants de champs (lien « pré-rempli » de Google Forms).
 */
export const FEEDBACK_FORM_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSelbeSWu467jA44HhuhTFrfwHoXmeR5c6A_VPdv0OibC68Mpw/viewform'

/** Identifiants (`entry.…`) des champs préremplis du formulaire. */
export const FEEDBACK_FIELDS = {
  version: 'entry.796230494',
  system: 'entry.1922881712',
  language: 'entry.148499426'
} as const

export type FeedbackInfo = {
  version: string
  /** « macOS 15.1 », « Windows 11 »… */
  system: string
  language: string
}

/** Adresse du formulaire avec les champs d'information déjà remplis. */
export function feedbackUrl(info: FeedbackInfo): string {
  const url = new URL(FEEDBACK_FORM_URL)
  url.searchParams.set('usp', 'pp_url')
  url.searchParams.set(FEEDBACK_FIELDS.version, info.version)
  url.searchParams.set(FEEDBACK_FIELDS.system, info.system)
  url.searchParams.set(FEEDBACK_FIELDS.language, info.language)
  return url.href
}

/** Informations techniques à coller dans le formulaire : jamais le contenu d'un document. */
export function diagnosticText(info: FeedbackInfo & { arch?: string; screen?: string }): string {
  const lines = [`Trame ${info.version}`, `Système : ${info.system}${info.arch ? ` (${info.arch})` : ''}`, `Langue : ${info.language}`]
  if (info.screen) lines.push(`Écran : ${info.screen}`)
  return lines.join('\n')
}
