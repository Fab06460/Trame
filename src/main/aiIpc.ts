import { app, ipcMain, net, safeStorage } from 'electron'
import { join } from 'path'
import { MAX_AI_PROMPT, MAX_WRITE_TEXT, VARIATION_INSTRUCTION, isAiProvider, isAiSize, isEditKind, isWriteAction, providerInfo, type AiGenerateResult, type AiStatus, type AiTextResult } from '../shared/ai'
import { DEFAULT_BASES, editImage, generateImage, parseEditImage, writeText, type HttpPost } from './aiClient'
import { createCredentialStore, type SecretBox } from './aiCredentials'
import { isAllowedUrl } from './photos'

/** Délai maximal d'une génération (un service saturé peut mettre longtemps ; au-delà, on abandonne). */
const GENERATION_TIMEOUT_MS = Number(process.env.TRAME_AI_TIMEOUT_MS) || 120_000

// Réservé aux tests de bout en bout : TRAME_AI_URL remplace l'adresse des services (et autorise http://127.0.0.1) ; le chiffrement du
// système (trousseau macOS, qui peut ouvrir une boîte de dialogue) est remplacé par un chiffrement factice.
const BASE_OVERRIDE = process.env.TRAME_AI_URL
const TEST_MODE = !!process.env.TRAME_TEST_EXPORT_DIR

const systemBox: SecretBox = {
  available: () => safeStorage.isEncryptionAvailable(),
  encrypt: (text) => safeStorage.encryptString(text),
  decrypt: (data) => safeStorage.decryptString(data)
}
const testBox: SecretBox = { available: () => true, encrypt: (t) => Buffer.from(t, 'utf-8'), decrypt: (b) => b.toString('utf-8') }

let store: ReturnType<typeof createCredentialStore> | null = null
const credentials = (): ReturnType<typeof createCredentialStore> => (store ??= createCredentialStore(join(app.getPath('userData'), 'ai-credentials.json'), TEST_MODE ? testBox : systemBox))

const running = new Map<string, AbortController>()

// net.fetch : pile réseau de Chromium (proxy du système, certificats), comme pour les photos
const post: HttpPost = (url, init) => net.fetch(url, { method: 'POST', headers: init.headers, body: init.body as string, signal: init.signal })

/** Exécute une demande annulable (`ai:cancel`) avec un délai maximal, et journalise les échecs sans jamais écrire d'identifiant. */
async function run<T extends AiGenerateResult | AiTextResult>(requestId: unknown, call: (signal: AbortSignal) => Promise<T>, provider: string): Promise<T> {
  const cancel = new AbortController()
  const id = typeof requestId === 'string' && requestId.length <= 64 ? requestId : null
  if (id) running.set(id, cancel)
  try {
    const result = await call(AbortSignal.any([cancel.signal, AbortSignal.timeout(GENERATION_TIMEOUT_MS)]))
    if (!result.ok && result.error !== 'cancelled') console.error('[ai]', provider, result.error, result.detail ?? '')
    return result
  } finally {
    if (id) running.delete(id)
  }
}

/**
 * Génération d'images par un service en ligne. Tout le réseau et tous les identifiants restent ici : l'interface envoie une demande
 * (service, texte, format) et reçoit une image ; elle ne voit jamais un jeton ni une adresse, et ne peut pas faire contacter un autre site.
 */
export function registerAiHandlers(): void {
  ipcMain.handle('ai:status', (): Promise<AiStatus> => credentials().status())

  ipcMain.handle('ai:save', (_e, provider: unknown, values: unknown) => (isAiProvider(provider) ? credentials().set(provider, values) : { ok: false as const, field: '' }))

  ipcMain.handle('ai:forget', async (_e, provider: unknown) => {
    if (isAiProvider(provider)) await credentials().forget(provider)
  })

  ipcMain.handle('ai:cancel', (_e, requestId: unknown) => {
    if (typeof requestId === 'string') running.get(requestId)?.abort()
  })

  ipcMain.handle('ai:generate', async (_e, provider: unknown, prompt: unknown, size: unknown, requestId: unknown): Promise<AiGenerateResult> => {
    if (!isAiProvider(provider)) return { ok: false, error: 'unavailable', detail: 'service' }
    const text = typeof prompt === 'string' ? prompt.trim() : ''
    if (!text || text.length > MAX_AI_PROMPT) return { ok: false, error: 'unavailable', detail: 'prompt' }
    const values = await credentials().get(provider)
    if (!values) return { ok: false, error: 'no-credentials' }
    const base = BASE_OVERRIDE ?? DEFAULT_BASES[provider]
    if (!isAllowedUrl(base, !!BASE_OVERRIDE)) return { ok: false, error: 'unavailable', detail: 'address refused' }

    return run(requestId, (signal) => generateImage(provider, text, isAiSize(size) ? size : providerInfo(provider).sizes[0], values, { base, signal, post }), provider)
  })

  ipcMain.handle('ai:edit', async (_e, provider: unknown, kind: unknown, instruction: unknown, imageDataUrl: unknown, width: unknown, height: unknown, requestId: unknown): Promise<AiGenerateResult> => {
    if (!isAiProvider(provider) || !isEditKind(kind)) return { ok: false, error: 'unavailable', detail: 'service' }
    const text = kind === 'variation' ? VARIATION_INSTRUCTION : typeof instruction === 'string' ? instruction.trim() : ''
    if (!text || text.length > Math.max(MAX_AI_PROMPT, VARIATION_INSTRUCTION.length)) return { ok: false, error: 'unavailable', detail: 'prompt' }
    const source = parseEditImage(imageDataUrl, width, height)
    if (!source) return { ok: false, error: 'unavailable', detail: 'image' }
    const values = await credentials().get(provider)
    if (!values) return { ok: false, error: 'no-credentials' }
    const base = BASE_OVERRIDE ?? DEFAULT_BASES[provider]
    if (!isAllowedUrl(base, !!BASE_OVERRIDE)) return { ok: false, error: 'unavailable', detail: 'address refused' }
    return run(requestId, (signal) => editImage(provider, text, source, values, { base, signal, post }), provider)
  })

  ipcMain.handle('ai:write', async (_e, provider: unknown, action: unknown, text: unknown, option: unknown, requestId: unknown): Promise<AiTextResult> => {
    if (!isAiProvider(provider) || !isWriteAction(action)) return { ok: false, error: 'unavailable', detail: 'service' }
    const body = typeof text === 'string' ? text : ''
    const opt = typeof option === 'string' ? option : ''
    if (body.length > MAX_WRITE_TEXT || opt.length > MAX_AI_PROMPT) return { ok: false, error: 'unavailable', detail: 'request' }
    const values = await credentials().get(provider)
    if (!values) return { ok: false, error: 'no-credentials' }
    const base = BASE_OVERRIDE ?? DEFAULT_BASES[provider]
    if (!isAllowedUrl(base, !!BASE_OVERRIDE)) return { ok: false, error: 'unavailable', detail: 'address refused' }
    return run(requestId, (signal) => writeText(provider, action, body, opt, values, { base, signal, post }), provider)
  })
}
