import type { MessageKey } from './i18n'

/** Génération d'images par un service en ligne : définitions partagées par le processus principal et l'interface. */

export type AiProviderId = 'cloudflare' | 'openai'
export type AiSize = 'square' | 'landscape' | 'portrait'

export interface AiField {
  id: string
  /** secret : jamais renvoyé à l'interface une fois enregistré */
  secret: boolean
  label: MessageKey
  placeholder?: string
}

export interface AiProviderInfo {
  id: AiProviderId
  /** nom du service (nom propre, jamais traduit) */
  name: string
  /** modèle utilisé (affiché, et enregistré dans l'image) */
  model: string
  fields: readonly AiField[]
  /** formats que le service sait produire (le premier est le défaut) */
  sizes: readonly AiSize[]
  /** gratuit dans une limite quotidienne ? (sinon payant à l'usage) */
  free: boolean
  /** texte sur le coût, affiché avant de générer */
  costNote: MessageKey
  /** où créer le compte et la clé (affiché en clair, jamais ouvert automatiquement) */
  signupUrl: string
}

export const AI_PROVIDERS: readonly AiProviderInfo[] = [
  {
    id: 'cloudflare',
    name: 'Cloudflare Workers AI',
    model: 'FLUX.1 schnell',
    fields: [
      { id: 'account', secret: false, label: 'ai.field.account', placeholder: '0123456789abcdef0123456789abcdef' },
      { id: 'token', secret: true, label: 'ai.field.token' }
    ],
    sizes: ['square'],
    free: true,
    costNote: 'ai.cost.cloudflare',
    signupUrl: 'dash.cloudflare.com'
  },
  {
    id: 'openai',
    name: 'OpenAI',
    model: 'gpt-image-1',
    fields: [{ id: 'key', secret: true, label: 'ai.field.key', placeholder: 'sk-…' }],
    sizes: ['square', 'landscape', 'portrait'],
    free: false,
    costNote: 'ai.cost.openai',
    signupUrl: 'platform.openai.com'
  }
]

export const isAiProvider = (v: unknown): v is AiProviderId => AI_PROVIDERS.some((p) => p.id === v)
export const providerInfo = (id: AiProviderId): AiProviderInfo => AI_PROVIDERS.find((p) => p.id === id)!
export const isAiSize = (v: unknown): v is AiSize => v === 'square' || v === 'landscape' || v === 'portrait'

/** Longueur maximale d'une demande (Cloudflare accepte 2 048 caractères ; on reste bien en dessous). */
export const MAX_AI_PROMPT = 1000

export type AiErrorKind =
  | 'no-credentials' // rien d'enregistré pour ce service
  | 'offline' // pas de réseau, ou délai dépassé
  | 'rate-limit' // trop de demandes
  | 'quota' // quota ou crédit épuisé
  | 'auth' // clé ou jeton refusé
  | 'refused' // demande refusée par le service (règles de contenu)
  | 'cancelled'
  | 'unavailable' // autre refus ou réponse inattendue

export type AiGenerateResult =
  | { ok: true; dataUrl: string; provider: AiProviderId; model: string }
  | { ok: false; error: AiErrorKind; detail?: string }

export interface AiStatus {
  /** les identifiants sont chiffrés par le système et conservés d'un lancement à l'autre */
  persistent: boolean
  providers: Array<{
    id: AiProviderId
    configured: boolean
    /** valeurs des champs non secrets (identifiant de compte…) */
    values: Record<string, string>
  }>
}

/** Valeurs acceptées pour un champ d'identifiant : texte imprimable, rogné, borné ; format précis pour l'identifiant de compte (il entre dans une adresse). */
export function cleanCredential(provider: AiProviderId, field: string, raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const v = raw.trim()
  if (!v || v.length > 300 || /[\u0000-\u001f\u007f\s]/.test(v)) return null
  if (provider === 'cloudflare' && field === 'account') return /^[a-f0-9]{32}$/i.test(v) ? v.toLowerCase() : null
  return v
}

export type CredentialCheck = { ok: true; values: Record<string, string> } | { ok: false; field: string }

/** Vérifie les champs d'un service ; refuse le premier invalide. */
export function checkCredentials(provider: AiProviderId, values: unknown): CredentialCheck {
  const src = (values && typeof values === 'object' ? values : {}) as Record<string, unknown>
  const out: Record<string, string> = {}
  for (const f of providerInfo(provider).fields) {
    const v = cleanCredential(provider, f.id, src[f.id])
    if (v === null) return { ok: false, field: f.id }
    out[f.id] = v
  }
  return { ok: true, values: out }
}
