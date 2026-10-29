import { providerInfo, type AiErrorKind, type AiGenerateResult, type AiProviderId, type AiSize } from '../shared/ai'

/** Réponse HTTP minimale (celle de `net.fetch`, ou d'un faux en test). */
export interface HttpResponse {
  status: number
  ok: boolean
  text(): Promise<string>
}
export type HttpPost = (url: string, init: { headers: Record<string, string>; body: string; signal?: AbortSignal }) => Promise<HttpResponse>

/** Taille maximale acceptée pour une réponse (image en base64 comprise). */
export const MAX_RESPONSE_CHARS = 30_000_000

export const DEFAULT_BASES: Record<AiProviderId, string> = {
  cloudflare: 'https://api.cloudflare.com',
  openai: 'https://api.openai.com'
}

/** Taille demandée à OpenAI pour chaque format de page. */
const OPENAI_SIZE: Record<AiSize, string> = { square: '1024x1024', landscape: '1536x1024', portrait: '1024x1536' }

export interface BuiltRequest {
  url: string
  headers: Record<string, string>
  body: string
}

/** Requête d'un service. `values` : champs enregistrés ; `base` : adresse du service (remplacée en test). */
export function buildRequest(provider: AiProviderId, prompt: string, size: AiSize, values: Record<string, string>, base: string): BuiltRequest {
  const root = base.replace(/\/+$/, '')
  if (provider === 'cloudflare') {
    return {
      // l'identifiant de compte a été validé (32 caractères hexadécimaux) avant d'être enregistré : il ne peut pas sortir du chemin
      url: `${root}/client/v4/accounts/${values.account}/ai/run/@cf/black-forest-labs/flux-1-schnell`,
      headers: { Authorization: `Bearer ${values.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, steps: 4 })
    }
  }
  return {
    url: `${root}/v1/images/generations`,
    headers: { Authorization: `Bearer ${values.key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: providerInfo('openai').model, prompt, n: 1, size: OPENAI_SIZE[size], quality: 'medium' })
  }
}

const json = (text: string): unknown => {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

/** Message d'erreur du service, tel qu'il le donne (pour le diagnostic). */
function errorText(provider: AiProviderId, body: unknown): string {
  const o = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  if (provider === 'openai') {
    const e = (o.error && typeof o.error === 'object' ? o.error : {}) as Record<string, unknown>
    return [e.code, e.message].filter((x) => typeof x === 'string').join(' : ')
  }
  const errs = Array.isArray(o.errors) ? o.errors : []
  return errs.map((e) => (e && typeof e === 'object' ? `${(e as Record<string, unknown>).code ?? ''} ${(e as Record<string, unknown>).message ?? ''}`.trim() : '')).filter(Boolean).join(' ; ')
}

/** Nature d'un refus HTTP. */
export function classifyError(provider: AiProviderId, status: number, body: unknown): AiErrorKind {
  const text = errorText(provider, body).toLowerCase()
  if (status === 401 || status === 403 && !/moderation|policy|safety/.test(text)) return 'auth'
  if (/insufficient_quota|billing|daily free allocation|neurons|exceeded your current quota/.test(text)) return 'quota'
  if (status === 429) return 'rate-limit'
  if (/content_policy|moderation|safety|not allowed|inappropriate|flagged/.test(text)) return 'refused'
  if (status === 400 && provider === 'cloudflare' && /nsfw|policy/.test(text)) return 'refused'
  return 'unavailable'
}

/** Type d'image reconnu d'après les premiers octets du contenu base64 (ce que le service dit n'est pas cru sur parole). */
export function sniffImageMime(base64: string): 'image/png' | 'image/jpeg' | 'image/webp' | null {
  const head = Buffer.from(base64.slice(0, 24), 'base64')
  if (head.length >= 8 && head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png'
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'image/jpeg'
  if (head.length >= 12 && head.subarray(0, 4).toString('latin1') === 'RIFF' && head.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp'
  return null
}

/** Image en base64 dans la réponse d'un service, ou null. */
export function extractImage(provider: AiProviderId, body: unknown): string | null {
  const o = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  let b64: unknown
  if (provider === 'cloudflare') {
    // l'API REST enveloppe le résultat dans `result` ; le modèle lui-même répond `{ image }`
    const r = (o.result && typeof o.result === 'object' ? o.result : o) as Record<string, unknown>
    b64 = r.image
  } else {
    const first = Array.isArray(o.data) ? o.data[0] : null
    b64 = first && typeof first === 'object' ? (first as Record<string, unknown>).b64_json : null
  }
  return typeof b64 === 'string' && b64.length > 100 && /^[A-Za-z0-9+/]+={0,2}$/.test(b64) ? b64 : null
}

export interface GenerateOptions {
  post: HttpPost
  /** adresse du service (par défaut celle du vrai service) */
  base?: string
  signal?: AbortSignal
}

/** Demande une image. Ne lève jamais : toute erreur devient un résultat `{ ok: false }`. */
export async function generateImage(provider: AiProviderId, prompt: string, size: AiSize, values: Record<string, string>, o: GenerateOptions): Promise<AiGenerateResult> {
  const info = providerInfo(provider)
  const req = buildRequest(provider, prompt, info.sizes.includes(size) ? size : info.sizes[0], values, o.base ?? DEFAULT_BASES[provider])
  let res: HttpResponse
  let text: string
  try {
    res = await o.post(req.url, { headers: req.headers, body: req.body, signal: o.signal })
    text = await res.text()
  } catch (err) {
    if (o.signal?.aborted && (o.signal.reason as { name?: string } | undefined)?.name !== 'TimeoutError') return { ok: false, error: 'cancelled' }
    return { ok: false, error: 'offline', detail: err instanceof Error ? err.message : String(err) }
  }
  if (text.length > MAX_RESPONSE_CHARS) return { ok: false, error: 'unavailable', detail: 'response too large' }
  const body = json(text)
  if (!res.ok) {
    const error = classifyError(provider, res.status, body)
    return { ok: false, error, detail: `HTTP ${res.status}${errorText(provider, body) ? ` — ${errorText(provider, body)}`.slice(0, 300) : ''}` }
  }
  const b64 = extractImage(provider, body)
  const mime = b64 ? sniffImageMime(b64) : null
  if (!b64 || !mime) return { ok: false, error: 'unavailable', detail: 'no image in the response' }
  return { ok: true, dataUrl: `data:${mime};base64,${b64}`, provider, model: info.model }
}
