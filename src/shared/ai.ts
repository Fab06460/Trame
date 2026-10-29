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
  /** retouche guidée d'une image existante (et variantes) */
  edit: {
    model: string
    /** plus grand côté de l'image envoyée (le service refuse ou facture davantage au-delà) */
    maxInputSide: number
    costNote: MessageKey
  }
  /** aide à la rédaction (modèle de texte) */
  text: {
    model: string
    costNote: MessageKey
  }
  /** description d'une image pour le texte alternatif (modèle qui voit les images) */
  vision: {
    model: string
    costNote: MessageKey
  }
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
    signupUrl: 'dash.cloudflare.com',
    // FLUX.2 klein 4B : « toutes les images en entrée doivent faire moins de 512×512 » (documentation Cloudflare)
    edit: { model: 'FLUX.2 klein 4B', maxInputSide: 512, costNote: 'aie.cost.cloudflare' },
    // point d'accès compatible OpenAI (`/ai/v1/chat/completions`) : même format de réponse que pour OpenAI
    text: { model: '@cf/meta/llama-3.1-8b-instruct-fp8-fast', costNote: 'aiw.cost.cloudflare' },
    // Mistral Small 3.1 : licence Apache 2.0 (Llama 3.2 Vision exige d'accepter la licence de Meta par une première requête « agree »), bon en français
    vision: { model: '@cf/mistralai/mistral-small-3.1-24b-instruct', costNote: 'alt.cost.cloudflare' }
  },
  {
    id: 'openai',
    name: 'OpenAI',
    model: 'gpt-image-1',
    fields: [{ id: 'key', secret: true, label: 'ai.field.key', placeholder: 'sk-…' }],
    sizes: ['square', 'landscape', 'portrait'],
    free: false,
    costNote: 'ai.cost.openai',
    signupUrl: 'platform.openai.com',
    edit: { model: 'gpt-image-1', maxInputSide: 1024, costNote: 'aie.cost.openai' },
    text: { model: 'gpt-4.1-mini', costNote: 'aiw.cost.openai' },
    vision: { model: 'gpt-4.1-mini', costNote: 'alt.cost.openai' }
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

/** Consigne de la variante : le modèle de retouche reçoit l'image et ce texte (en anglais, langue où ces modèles obéissent le mieux). */
export const VARIATION_INSTRUCTION = 'Create a variation of this image: keep the same subject and overall style, but change the details, the composition and the colours slightly.'

/** Taille maximale (en base64) de l'image envoyée à un service pour être retouchée. */
export const MAX_EDIT_IMAGE_CHARS = 8_000_000

export type EditKind = 'edit' | 'variation'
export const isEditKind = (v: unknown): v is EditKind => v === 'edit' || v === 'variation'

const roundTo16 = (n: number): number => Math.min(1920, Math.max(256, Math.round(n / 16) * 16))

/**
 * Taille de l'image produite pour une image source de `w` × `h` : même proportions. Cloudflare accepte une largeur et une hauteur
 * (multiples de 16, de 256 à 1920) ; OpenAI trois formats seulement (carré, paysage, portrait), choisi d'après les proportions.
 */
export function editOutput(provider: AiProviderId, w: number, h: number): { width: number; height: number } | { size: AiSize } {
  const ratio = w > 0 && h > 0 ? w / h : 1
  if (provider === 'cloudflare') {
    const long = 1024
    return ratio >= 1 ? { width: roundTo16(long), height: roundTo16(long / ratio) } : { width: roundTo16(long * ratio), height: roundTo16(long) }
  }
  return { size: ratio >= 1.2 ? 'landscape' : ratio <= 1 / 1.2 ? 'portrait' : 'square' }
}

// ── Aide à la rédaction ──────────────────────────────────────────────────────────────────────────────────────────────

export type WriteAction = 'rewrite' | 'shorten' | 'expand' | 'fix' | 'formal' | 'casual' | 'translate' | 'free'
export const WRITE_ACTIONS: readonly WriteAction[] = ['rewrite', 'shorten', 'expand', 'fix', 'formal', 'casual', 'translate', 'free']
export const isWriteAction = (v: unknown): v is WriteAction => WRITE_ACTIONS.includes(v as WriteAction)

/** Langues proposées pour la traduction : code, nom dans la langue elle-même (affiché) et en anglais (envoyé au modèle). */
export const TRANSLATE_LANGUAGES: ReadonlyArray<{ code: string; name: string; english: string }> = [
  { code: 'fr', name: 'Français', english: 'French' },
  { code: 'en', name: 'English', english: 'English' },
  { code: 'de', name: 'Deutsch', english: 'German' },
  { code: 'es', name: 'Español', english: 'Spanish' },
  { code: 'it', name: 'Italiano', english: 'Italian' },
  { code: 'pt', name: 'Português', english: 'Portuguese' }
]

/** Longueur maximale du texte envoyé (le résultat d'une demande sur un long texte coûterait cher et dépasserait la réponse permise). */
export const MAX_WRITE_TEXT = 4000

export type AiTextResult =
  | { ok: true; text: string; provider: AiProviderId; model: string }
  | { ok: false; error: AiErrorKind; detail?: string }

/** Longueur maximale d'un texte alternatif (PowerPoint en accepte davantage ; au-delà, ce n'est plus une description courte). */
export const MAX_ALT = 500
