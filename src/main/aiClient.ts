import { MAX_ALT, MAX_EDIT_IMAGE_CHARS, TRANSLATE_LANGUAGES, editOutput, providerInfo, type AiErrorKind, type AiGenerateResult, type AiProviderId, type AiSize, type AiTextResult, type WriteAction } from '../shared/ai'
import { buildMessages, cleanDescription, cleanOutput, describePrompt, type ChatMessage } from './aiWriting'
import { buildMultipart } from './multipart'

/** Réponse HTTP minimale (celle de `net.fetch`, ou d'un faux en test). */
export interface HttpResponse {
  status: number
  ok: boolean
  text(): Promise<string>
}
export type HttpPost = (url: string, init: { headers: Record<string, string>; body: string | Uint8Array; signal?: AbortSignal }) => Promise<HttpResponse>

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
  body: string | Uint8Array
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
  if (/content_policy|moderation|safety|not allowed|inappropriate|flagged|3030/.test(text)) return 'refused'
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

/** Image à retoucher, déjà décodée et vérifiée. */
export interface EditSource {
  bytes: Uint8Array
  mime: 'image/png' | 'image/jpeg' | 'image/webp'
  width: number
  height: number
}

/**
 * Image reçue de l'interface pour être retouchée : data URL png / jpeg / webp dont le type est confirmé par les premiers octets,
 * de taille bornée, avec ses dimensions (entières, raisonnables). Sinon null.
 */
export function parseEditImage(dataUrl: unknown, width: unknown, height: unknown): EditSource | null {
  if (typeof dataUrl !== 'string' || dataUrl.length > MAX_EDIT_IMAGE_CHARS + 64) return null
  const m = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl)
  if (!m || sniffImageMime(m[2]) !== m[1]) return null
  const dim = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 8000 ? v : null)
  const w = dim(width)
  const h = dim(height)
  if (!w || !h) return null
  return { bytes: Buffer.from(m[2], 'base64'), mime: m[1] as EditSource['mime'], width: w, height: h }
}

const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' } as const

/** Requête de retouche guidée (ou de variante) : l'image et la consigne partent en `multipart/form-data`. */
export function buildEditRequest(provider: AiProviderId, instruction: string, src: EditSource, values: Record<string, string>, base: string): BuiltRequest {
  const root = base.replace(/\/+$/, '')
  const out = editOutput(provider, src.width, src.height)
  if (provider === 'cloudflare') {
    const dims = out as { width: number; height: number }
    const m = buildMultipart({ prompt: instruction, width: dims.width, height: dims.height }, [{ field: 'input_image_0', filename: `image.${EXT[src.mime]}`, contentType: src.mime, bytes: src.bytes }])
    return { url: `${root}/client/v4/accounts/${values.account}/ai/run/@cf/black-forest-labs/flux-2-klein-4b`, headers: { Authorization: `Bearer ${values.token}`, 'Content-Type': m.contentType }, body: m.body }
  }
  const m = buildMultipart({ model: providerInfo('openai').edit.model, prompt: instruction, n: 1, size: OPENAI_SIZE[(out as { size: AiSize }).size], quality: 'medium' }, [{ field: 'image', filename: `image.${EXT[src.mime]}`, contentType: src.mime, bytes: src.bytes }])
  return { url: `${root}/v1/images/edits`, headers: { Authorization: `Bearer ${values.key}`, 'Content-Type': m.contentType }, body: m.body }
}

/** Retouche une image. Ne lève jamais : toute erreur devient un résultat `{ ok: false }`. */
export function editImage(provider: AiProviderId, instruction: string, src: EditSource, values: Record<string, string>, o: GenerateOptions): Promise<AiGenerateResult> {
  const info = providerInfo(provider)
  return send(provider, buildEditRequest(provider, instruction, src, values, o.base ?? DEFAULT_BASES[provider]), info.edit.model, o)
}

/** Demande une image. Ne lève jamais : toute erreur devient un résultat `{ ok: false }`. */
export async function generateImage(provider: AiProviderId, prompt: string, size: AiSize, values: Record<string, string>, o: GenerateOptions): Promise<AiGenerateResult> {
  const info = providerInfo(provider)
  const req = buildRequest(provider, prompt, info.sizes.includes(size) ? size : info.sizes[0], values, o.base ?? DEFAULT_BASES[provider])
  return send(provider, req, info.model, o)
}

type Raw = { ok: true; body: unknown } | { ok: false; error: AiErrorKind; detail?: string }

/** Envoie une requête et retourne le corps JSON de la réponse, ou l'erreur classée. */
async function sendRaw(provider: AiProviderId, req: BuiltRequest, o: GenerateOptions): Promise<Raw> {
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
  return { ok: true, body }
}

/** Envoie une requête et lit l'image de la réponse (génération comme retouche). */
async function send(provider: AiProviderId, req: BuiltRequest, model: string, o: GenerateOptions): Promise<AiGenerateResult> {
  const raw = await sendRaw(provider, req, o)
  if (!raw.ok) return raw
  const b64 = extractImage(provider, raw.body)
  const mime = b64 ? sniffImageMime(b64) : null
  if (!b64 || !mime) return { ok: false, error: 'unavailable', detail: 'no image in the response' }
  return { ok: true, dataUrl: `data:${mime};base64,${b64}`, provider, model }
}

// ── Aide à la rédaction : conversation avec un modèle de texte (format « chat completions », le même chez les deux services) ──

export function buildTextRequest(provider: AiProviderId, messages: ChatMessage[], values: Record<string, string>, base: string): BuiltRequest {
  const root = base.replace(/\/+$/, '')
  const model = providerInfo(provider).text.model
  if (provider === 'cloudflare') {
    return {
      url: `${root}/client/v4/accounts/${values.account}/ai/v1/chat/completions`,
      headers: { Authorization: `Bearer ${values.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, max_tokens: 1024 })
    }
  }
  return {
    url: `${root}/v1/chat/completions`,
    headers: { Authorization: `Bearer ${values.key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, max_completion_tokens: 1024 })
  }
}

/** Texte de la réponse : `choices[0].message.content` (format commun), ou `result.response` (réponse native de Cloudflare). */
export function extractText(body: unknown): string | null {
  const o = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  const first = Array.isArray(o.choices) ? o.choices[0] : null
  const message = first && typeof first === 'object' ? (first as Record<string, unknown>).message : null
  let content = message && typeof message === 'object' ? (message as Record<string, unknown>).content : null
  if (content === null || content === undefined) {
    const r = o.result && typeof o.result === 'object' ? (o.result as Record<string, unknown>) : null
    content = r?.response ?? null
  }
  return typeof content === 'string' && content.trim() ? content : null
}

/** Demande un texte. Ne lève jamais. `original` : texte d'origine (pour ne pas retirer ses propres guillemets). */
export async function writeText(provider: AiProviderId, action: WriteAction, text: string, option: string, values: Record<string, string>, o: GenerateOptions): Promise<AiTextResult> {
  const messages = buildMessages(action, text, option)
  if (!messages) return { ok: false, error: 'unavailable', detail: 'request' }
  const raw = await sendRaw(provider, buildTextRequest(provider, messages, values, o.base ?? DEFAULT_BASES[provider]), o)
  if (!raw.ok) return raw
  const out = extractText(raw.body)
  const cleaned = out ? cleanOutput(out, text) : ''
  if (!cleaned) return { ok: false, error: 'unavailable', detail: 'no text in the response' }
  return { ok: true, text: cleaned, provider, model: providerInfo(provider).text.model }
}

// ── Texte alternatif : un modèle qui voit l'image la décrit ─────────────────────────────────────────────────────────────

/** Image data URL png / jpeg / webp dont le type est confirmé par les premiers octets (sans contrainte de dimensions), ou null. */
export function parseImageDataUrl(dataUrl: unknown): { mime: EditSource['mime']; dataUrl: string } | null {
  if (typeof dataUrl !== 'string' || dataUrl.length > MAX_EDIT_IMAGE_CHARS + 64) return null
  const m = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl)
  if (!m || sniffImageMime(m[2]) !== m[1]) return null
  return { mime: m[1] as EditSource['mime'], dataUrl }
}

/** Requête de description d'image : format « chat completions » avec une partie `image_url` (le même chez les deux services). */
export function buildDescribeRequest(provider: AiProviderId, language: string, imageDataUrl: string, values: Record<string, string>, base: string): BuiltRequest | null {
  const lang = TRANSLATE_LANGUAGES.find((l) => l.code === language)
  if (!lang) return null
  const { system, user } = describePrompt(lang.english)
  const root = base.replace(/\/+$/, '')
  const model = providerInfo(provider).vision.model
  const messages = [
    { role: 'system', content: system },
    { role: 'user', content: [{ type: 'text', text: user }, { type: 'image_url', image_url: { url: imageDataUrl } }] }
  ]
  if (provider === 'cloudflare') {
    return {
      url: `${root}/client/v4/accounts/${values.account}/ai/v1/chat/completions`,
      headers: { Authorization: `Bearer ${values.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, max_tokens: 300 })
    }
  }
  return {
    url: `${root}/v1/chat/completions`,
    headers: { Authorization: `Bearer ${values.key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, max_completion_tokens: 300 })
  }
}

/** Décrit une image. Ne lève jamais. */
export async function describeImage(provider: AiProviderId, language: string, imageDataUrl: string, values: Record<string, string>, o: GenerateOptions): Promise<AiTextResult> {
  const req = buildDescribeRequest(provider, language, imageDataUrl, values, o.base ?? DEFAULT_BASES[provider])
  if (!req) return { ok: false, error: 'unavailable', detail: 'language' }
  const raw = await sendRaw(provider, req, o)
  if (!raw.ok) return raw
  const out = extractText(raw.body)
  const text = out ? cleanDescription(out, MAX_ALT) : ''
  if (!text) return { ok: false, error: 'unavailable', detail: 'no description in the response' }
  return { ok: true, text, provider, model: providerInfo(provider).vision.model }
}
