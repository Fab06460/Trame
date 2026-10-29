import { describe, expect, it } from 'vitest'
import { buildRequest, classifyError, extractImage, generateImage, sniffImageMime, type HttpPost } from './aiClient'

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(200, 7)]).toString('base64')
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 7)]).toString('base64')
const CF = { account: 'a'.repeat(32), token: 'jeton-secret' }
const OA = { key: 'sk-secret' }
const reply = (status: number, body: unknown): HttpPost => async () => ({ status, ok: status >= 200 && status < 300, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) })

describe('requêtes', () => {
  it('Cloudflare : adresse du modèle, jeton en en-tête, 4 étapes', () => {
    const r = buildRequest('cloudflare', 'un chat', 'square', CF, 'https://api.cloudflare.com/')
    expect(r.url).toBe(`https://api.cloudflare.com/client/v4/accounts/${'a'.repeat(32)}/ai/run/@cf/black-forest-labs/flux-1-schnell`)
    expect(r.headers.Authorization).toBe('Bearer jeton-secret')
    expect(JSON.parse(r.body)).toEqual({ prompt: 'un chat', steps: 4 })
  })

  it('OpenAI : taille selon le format, une seule image', () => {
    expect(JSON.parse(buildRequest('openai', 'x', 'square', OA, 'https://h').body)).toMatchObject({ model: 'gpt-image-1', n: 1, size: '1024x1024' })
    expect(JSON.parse(buildRequest('openai', 'x', 'landscape', OA, 'https://h').body).size).toBe('1536x1024')
    expect(JSON.parse(buildRequest('openai', 'x', 'portrait', OA, 'https://h').body).size).toBe('1024x1536')
    expect(buildRequest('openai', 'x', 'square', OA, 'https://h/').url).toBe('https://h/v1/images/generations')
  })
})

describe('réponses', () => {
  it('reconnaît le vrai type d’image, pas celui que le service annonce', () => {
    expect(sniffImageMime(PNG)).toBe('image/png')
    expect(sniffImageMime(JPG)).toBe('image/jpeg')
    expect(sniffImageMime(Buffer.from('<html>pas une image</html>'.repeat(5)).toString('base64'))).toBeNull()
  })

  it('lit l’image dans les deux formats de réponse de Cloudflare et dans celui d’OpenAI', () => {
    expect(extractImage('cloudflare', { result: { image: PNG }, success: true })).toBe(PNG)
    expect(extractImage('cloudflare', { image: PNG })).toBe(PNG)
    expect(extractImage('openai', { data: [{ b64_json: PNG }] })).toBe(PNG)
    expect(extractImage('openai', { data: [{ url: 'https://x/y.png' }] })).toBeNull()
    expect(extractImage('cloudflare', { result: { image: 'pas du base64 !' } })).toBeNull()
    expect(extractImage('openai', null)).toBeNull()
  })
})

describe('classement des erreurs', () => {
  it('distingue identifiants, quota, limite, refus de contenu', () => {
    expect(classifyError('openai', 401, { error: { message: 'Incorrect API key' } })).toBe('auth')
    expect(classifyError('cloudflare', 403, { errors: [{ code: 10000, message: 'Authentication error' }] })).toBe('auth')
    expect(classifyError('openai', 429, { error: { code: 'insufficient_quota', message: 'You exceeded your current quota' } })).toBe('quota')
    expect(classifyError('openai', 429, { error: { code: 'rate_limit_exceeded' } })).toBe('rate-limit')
    expect(classifyError('cloudflare', 429, { errors: [{ code: 4006, message: 'you have used up your daily free allocation of 10,000 neurons' }] })).toBe('quota')
    expect(classifyError('openai', 400, { error: { code: 'moderation_blocked', message: 'Your request was rejected by the safety system' } })).toBe('refused')
    expect(classifyError('openai', 500, 'Server Error')).toBe('unavailable')
  })
})

describe('generateImage', () => {
  it('retourne l’image en data URL avec le service et le modèle', async () => {
    const r = await generateImage('cloudflare', 'x', 'square', CF, { post: reply(200, { result: { image: JPG }, success: true }) })
    expect(r).toEqual({ ok: true, dataUrl: `data:image/jpeg;base64,${JPG}`, provider: 'cloudflare', model: 'FLUX.1 schnell' })
  })

  it('un format non géré par le service retombe sur son format par défaut', async () => {
    let body = ''
    await generateImage('cloudflare', 'x', 'landscape', CF, { post: async (_u, init) => ((body = init.body), { status: 200, ok: true, text: async () => JSON.stringify({ image: PNG }) }) })
    expect(JSON.parse(body)).toEqual({ prompt: 'x', steps: 4 })
  })

  it('traduit les échecs en résultats, jamais en exception', async () => {
    expect(await generateImage('openai', 'x', 'square', OA, { post: reply(401, { error: { message: 'bad key' } }) })).toMatchObject({ ok: false, error: 'auth' })
    expect(await generateImage('openai', 'x', 'square', OA, { post: reply(200, { data: [] }) })).toMatchObject({ ok: false, error: 'unavailable' })
    expect(await generateImage('openai', 'x', 'square', OA, { post: reply(200, 'pas du json') })).toMatchObject({ ok: false, error: 'unavailable' })
    expect(await generateImage('openai', 'x', 'square', OA, { post: reply(200, { data: [{ b64_json: Buffer.from('<html>'.repeat(40)).toString('base64') }] }) })).toMatchObject({ ok: false, error: 'unavailable' })
    const down: HttpPost = async () => {
      throw new Error('getaddrinfo ENOTFOUND')
    }
    expect(await generateImage('openai', 'x', 'square', OA, { post: down })).toMatchObject({ ok: false, error: 'offline', detail: expect.stringContaining('ENOTFOUND') })
  })

  it('l’annulation est distinguée d’une panne réseau', async () => {
    const ctl = new AbortController()
    const slow: HttpPost = async () => {
      ctl.abort()
      throw new Error('aborted')
    }
    expect(await generateImage('openai', 'x', 'square', OA, { post: slow, signal: ctl.signal })).toEqual({ ok: false, error: 'cancelled' })
  })

  it('le détail technique ne contient jamais le jeton', async () => {
    const r = await generateImage('cloudflare', 'x', 'square', CF, { post: reply(500, { errors: [{ code: 1, message: 'boom' }] }) })
    expect(JSON.stringify(r)).not.toContain('jeton-secret')
  })
})
