import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createCredentialStore, type SecretBox } from './aiCredentials'

// « chiffrement » de test : reconnaissable, réversible, et qui prouve que le texte clair n'est pas écrit
const box = (available = true): SecretBox => ({
  available: () => available,
  encrypt: (t) => Buffer.from('ENC:' + Buffer.from(t).reverse().toString('latin1'), 'latin1'),
  decrypt: (b) => {
    const s = b.toString('latin1')
    if (!s.startsWith('ENC:')) throw new Error('déchiffrement impossible')
    return Buffer.from(s.slice(4), 'latin1').reverse().toString()
  }
})

let dir: string
beforeEach(async () => (dir = await mkdtemp(join(tmpdir(), 'trame-ai-'))))
afterEach(() => rm(dir, { recursive: true, force: true }))

describe('identifiants des services d’images IA', () => {
  it('enregistre chiffré, relit après redémarrage, ne renvoie que les champs non secrets', async () => {
    const file = join(dir, 'ai.json')
    const a = createCredentialStore(file, box())
    expect(await a.set('cloudflare', { account: 'ABCDEF0123456789abcdef0123456789', token: 'jeton-secret' })).toEqual({ ok: true })
    const onDisk = await readFile(file, 'utf-8')
    expect(onDisk).not.toContain('jeton-secret')
    expect(onDisk).not.toContain('abcdef0123456789')
    const b = createCredentialStore(file, box()) // nouveau lancement
    const status = await b.status()
    expect(status.persistent).toBe(true)
    expect(status.providers.find((p) => p.id === 'cloudflare')).toEqual({ id: 'cloudflare', configured: true, values: { account: 'abcdef0123456789abcdef0123456789' } })
    expect(JSON.stringify(status)).not.toContain('jeton-secret')
    expect(await b.get('cloudflare')).toEqual({ account: 'abcdef0123456789abcdef0123456789', token: 'jeton-secret' })
    expect((await b.status()).providers.find((p) => p.id === 'openai')!.configured).toBe(false)
  })

  it('refuse les valeurs invalides sans rien enregistrer', async () => {
    const s = createCredentialStore(join(dir, 'ai.json'), box())
    expect(await s.set('cloudflare', { account: 'trop-court', token: 'x' })).toEqual({ ok: false, field: 'account' })
    expect(await s.set('cloudflare', { account: 'a'.repeat(32), token: 'avec espace' })).toEqual({ ok: false, field: 'token' })
    expect(await s.set('cloudflare', { account: '../../etc/passwd' + 'a'.repeat(20), token: 'x' })).toEqual({ ok: false, field: 'account' })
    expect(await s.set('openai', { key: '' })).toEqual({ ok: false, field: 'key' })
    expect(await s.set('openai', null)).toEqual({ ok: false, field: 'key' })
    expect((await s.status()).providers.every((p) => !p.configured)).toBe(true)
  })

  it('oublier efface aussi du disque', async () => {
    const file = join(dir, 'ai.json')
    const s = createCredentialStore(file, box())
    await s.set('openai', { key: 'sk-secret' })
    await s.forget('openai')
    expect(await createCredentialStore(file, box()).get('openai')).toBeNull()
  })

  it('sans chiffrement du système : rien n’est écrit, tout reste en mémoire', async () => {
    const file = join(dir, 'ai.json')
    const s = createCredentialStore(file, box(false))
    await s.set('openai', { key: 'sk-secret' })
    expect((await s.status()).persistent).toBe(false)
    expect(await s.get('openai')).toEqual({ key: 'sk-secret' })
    await expect(readFile(file)).rejects.toThrow()
  })

  it('un fichier illisible ou chiffré ailleurs équivaut à rien d’enregistré', async () => {
    const file = join(dir, 'ai.json')
    await createCredentialStore(file, box()).set('openai', { key: 'sk-secret' })
    const other: SecretBox = { ...box(), decrypt: () => { throw new Error('autre session') } }
    expect(await createCredentialStore(file, other).get('openai')).toBeNull()
  })
})
