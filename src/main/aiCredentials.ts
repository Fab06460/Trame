import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { AI_PROVIDERS, checkCredentials, type AiProviderId, type AiStatus } from '../shared/ai'

/** Chiffrement fourni par le système (Keychain, DPAPI, trousseau) : injecté pour pouvoir tester sans lui. */
export interface SecretBox {
  available(): boolean | Promise<boolean>
  encrypt(text: string): Buffer
  decrypt(data: Buffer): string
}

type Saved = Partial<Record<AiProviderId, Record<string, string>>>

/**
 * Identifiants des services d'images IA. Chaque valeur est chiffrée avant d'être écrite ; sans chiffrement disponible (poste Linux
 * sans trousseau), rien n'est écrit sur le disque : les identifiants ne vivent qu'en mémoire jusqu'à la fermeture de l'application.
 * Les valeurs secrètes ne sortent JAMAIS de ce module vers l'interface (voir `status`).
 */
export function createCredentialStore(file: string, box: SecretBox) {
  const memory: Saved = {}
  let loaded = false

  async function load(): Promise<void> {
    if (loaded) return
    loaded = true
    if (!(await box.available())) return
    let raw: unknown
    try {
      raw = JSON.parse(await readFile(file, 'utf-8'))
    } catch {
      return // fichier absent ou illisible : rien d'enregistré
    }
    if (!raw || typeof raw !== 'object') return
    for (const p of AI_PROVIDERS) {
      const entry = (raw as Record<string, unknown>)[p.id]
      if (!entry || typeof entry !== 'object') continue
      const values: Record<string, string> = {}
      try {
        for (const f of p.fields) values[f.id] = box.decrypt(Buffer.from(String((entry as Record<string, unknown>)[f.id] ?? ''), 'base64'))
      } catch {
        continue // chiffré par un autre compte du système, ou corrompu : comme si rien n'était enregistré
      }
      const ok = checkCredentials(p.id, values)
      if (ok.ok) memory[p.id] = ok.values
    }
  }

  async function persist(): Promise<void> {
    if (!(await box.available())) return
    const out: Record<string, Record<string, string>> = {}
    for (const p of AI_PROVIDERS) {
      const values = memory[p.id]
      if (values) out[p.id] = Object.fromEntries(p.fields.map((f) => [f.id, box.encrypt(values[f.id]).toString('base64')]))
    }
    await mkdir(dirname(file), { recursive: true })
    await writeFile(file, JSON.stringify(out), { encoding: 'utf-8', mode: 0o600 })
  }

  return {
    /** État pour l'interface : quels services sont configurés, et les champs non secrets seulement. */
    async status(): Promise<AiStatus> {
      await load()
      return {
        persistent: await box.available(),
        providers: AI_PROVIDERS.map((p) => ({
          id: p.id,
          configured: !!memory[p.id],
          values: Object.fromEntries(p.fields.filter((f) => !f.secret && memory[p.id]).map((f) => [f.id, memory[p.id]![f.id]]))
        }))
      }
    },
    /** Valeurs complètes, pour le processus principal seulement. */
    async get(provider: AiProviderId): Promise<Record<string, string> | null> {
      await load()
      return memory[provider] ?? null
    },
    async set(provider: AiProviderId, values: unknown): Promise<{ ok: true } | { ok: false; field: string }> {
      await load()
      const checked = checkCredentials(provider, values)
      if (!checked.ok) return checked
      memory[provider] = checked.values
      await persist()
      return { ok: true }
    },
    async forget(provider: AiProviderId): Promise<void> {
      await load()
      delete memory[provider]
      await persist()
    }
  }
}

