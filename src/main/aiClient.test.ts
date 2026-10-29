import { describe, expect, it } from 'vitest'
import { editOutput } from '../shared/ai'
import { buildEditRequest, buildRequest, classifyError, editImage, extractImage, generateImage, parseEditImage, sniffImageMime, type EditSource, type HttpPost } from './aiClient'
import { buildMultipart } from './multipart'

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
    expect(JSON.parse(String(r.body))).toEqual({ prompt: 'un chat', steps: 4 })
  })

  it('OpenAI : taille selon le format, une seule image', () => {
    expect(JSON.parse(String(buildRequest('openai', 'x', 'square', OA, 'https://h').body))).toMatchObject({ model: 'gpt-image-1', n: 1, size: '1024x1024' })
    expect(JSON.parse(String(buildRequest('openai', 'x', 'landscape', OA, 'https://h').body)).size).toBe('1536x1024')
    expect(JSON.parse(String(buildRequest('openai', 'x', 'portrait', OA, 'https://h').body)).size).toBe('1024x1536')
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
    await generateImage('cloudflare', 'x', 'landscape', CF, { post: async (_u, init) => ((body = String(init.body)), { status: 200, ok: true, text: async () => JSON.stringify({ image: PNG }) }) })
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

const SRC: EditSource = { bytes: Buffer.from(PNG, 'base64'), mime: 'image/png', width: 400, height: 200 }
const text = (b: unknown): string => Buffer.from(b as Uint8Array).toString('latin1')

describe('multipart/form-data', () => {
  it('champs puis fichiers, séparés par la frontière, octets du fichier intacts', () => {
    const m = buildMultipart({ prompt: 'un "chat"\r\nX', n: 1 }, [{ field: 'image', filename: 'a"b.png', contentType: 'image/png', bytes: Buffer.from([0, 1, 2, 255]) }], 'BORD')
    expect(m.contentType).toBe('multipart/form-data; boundary=BORD')
    const t = text(m.body)
    expect(t.startsWith('--BORD\r\nContent-Disposition: form-data; name="prompt"\r\n\r\nun "chat"')).toBe(true)
    expect(t).toContain('name="n"\r\n\r\n1\r\n')
    expect(t).toContain('name="image"; filename="a_b.png"\r\nContent-Type: image/png\r\n\r\n\u0000\u0001\u0002\u00ff\r\n--BORD--\r\n')
  })
})

describe('retouche guidée', () => {
  it('Cloudflare : FLUX.2 klein, image dans input_image_0, taille de même proportion', () => {
    const r = buildEditRequest('cloudflare', 'ciel rose', SRC, CF, 'https://api.cloudflare.com')
    expect(r.url).toBe(`https://api.cloudflare.com/client/v4/accounts/${'a'.repeat(32)}/ai/run/@cf/black-forest-labs/flux-2-klein-4b`)
    expect(r.headers.Authorization).toBe('Bearer jeton-secret')
    expect(r.headers['Content-Type']).toMatch(/^multipart\/form-data; boundary=/)
    const t = text(r.body)
    expect(t).toContain('name="prompt"\r\n\r\nciel rose')
    expect(t).toContain('name="width"\r\n\r\n1024')
    expect(t).toContain('name="height"\r\n\r\n512')
    expect(t).toContain('name="input_image_0"; filename="image.png"')
    expect(t).toContain('\u0089PNG')
  })

  it('OpenAI : /v1/images/edits, gpt-image-1, format d’après les proportions', () => {
    const r = buildEditRequest('openai', 'ciel rose', SRC, OA, 'https://api.openai.com')
    expect(r.url).toBe('https://api.openai.com/v1/images/edits')
    expect(r.headers.Authorization).toBe('Bearer sk-secret')
    const t = text(r.body)
    expect(t).toContain('name="model"\r\n\r\ngpt-image-1')
    expect(t).toContain('name="size"\r\n\r\n1536x1024')
    expect(t).toContain('name="image"; filename="image.png"')
  })

  it('tailles de sortie : proportions conservées, multiples de 16 entre 256 et 1920', () => {
    expect(editOutput('cloudflare', 400, 200)).toEqual({ width: 1024, height: 512 })
    expect(editOutput('cloudflare', 200, 400)).toEqual({ width: 512, height: 1024 })
    expect(editOutput('cloudflare', 300, 300)).toEqual({ width: 1024, height: 1024 })
    const extreme = editOutput('cloudflare', 4000, 100) as { width: number; height: number }
    expect(extreme.height).toBe(256)
    expect(extreme.width % 16).toBe(0)
    expect(editOutput('openai', 400, 200)).toEqual({ size: 'landscape' })
    expect(editOutput('openai', 200, 400)).toEqual({ size: 'portrait' })
    expect(editOutput('openai', 300, 290)).toEqual({ size: 'square' })
  })

  it('retourne l’image retouchée avec le modèle de retouche', async () => {
    const r = await editImage('cloudflare', 'x', SRC, CF, { post: reply(200, { result: { image: PNG }, success: true }) })
    expect(r).toEqual({ ok: true, dataUrl: `data:image/png;base64,${PNG}`, provider: 'cloudflare', model: 'FLUX.2 klein 4B' })
    expect(await editImage('openai', 'x', SRC, OA, { post: reply(200, { data: [{ b64_json: JPG }] }) })).toMatchObject({ ok: true, model: 'gpt-image-1' })
    expect(await editImage('cloudflare', 'x', SRC, CF, { post: reply(400, { errors: [{ code: 3030, message: 'result_flagged' }] }) })).toMatchObject({ ok: false, error: 'refused' })
  })

  it('l’image reçue de l’interface est vérifiée (type réel, taille, dimensions)', () => {
    const png = `data:image/png;base64,${PNG}`
    expect(parseEditImage(png, 400, 200)).toMatchObject({ mime: 'image/png', width: 400, height: 200 })
    expect(parseEditImage(`data:image/jpeg;base64,${JPG}`, 10, 10)).toMatchObject({ mime: 'image/jpeg' })
    expect(parseEditImage(`data:image/jpeg;base64,${PNG}`, 10, 10)).toBeNull() // type annoncé ≠ type réel
    expect(parseEditImage('data:image/svg+xml;base64,' + PNG, 10, 10)).toBeNull()
    expect(parseEditImage('https://exemple.org/a.png', 10, 10)).toBeNull()
    expect(parseEditImage(png, 0, 10)).toBeNull()
    expect(parseEditImage(png, 10.5, 10)).toBeNull()
    expect(parseEditImage(png, 10, 99999)).toBeNull()
    expect(parseEditImage(null, 10, 10)).toBeNull()
    expect(parseEditImage('data:image/png;base64,' + 'A'.repeat(9_000_000), 10, 10)).toBeNull()
  })
})
