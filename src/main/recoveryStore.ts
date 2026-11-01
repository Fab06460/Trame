import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * Copie de secours du document en cours : le renderer l'écrit régulièrement tant qu'il y a des modifications non
 * enregistrées, et elle est effacée à toute fermeture normale. Une copie qui reste au lancement suivant est donc celle
 * d'une session interrompue (plantage, coupure de courant, arrêt forcé) : on propose de la reprendre.
 */
export interface RecoveryInfo {
  /** session qui l'a écrite */
  id: string
  /** fichier d'origine du document, s'il avait été enregistré */
  path?: string
  name: string
  /** date de la dernière copie, en ms */
  at: number
  bytes: number
}

export const RECOVERY_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
/** Au-delà, une copie de secours est considérée comme abandonnée et supprimée. */
export const MAX_AGE_MS = 30 * 24 * 3600 * 1000

export const recoveryDir = (base: string): string => join(base, 'recovery')
const docFile = (base: string, id: string): string => join(recoveryDir(base), `${id}.trame`)
const infoFile = (base: string, id: string): string => join(recoveryDir(base), `${id}.json`)

/** Écrit (ou remplace) la copie de la session `id`. L'écriture passe par un fichier temporaire : un arrêt en plein milieu ne détruit pas la copie précédente. */
export async function writeRecovery(base: string, id: string, json: string, info: { path?: string; name: string }, now = Date.now()): Promise<boolean> {
  if (!RECOVERY_ID.test(id)) return false
  await mkdir(recoveryDir(base), { recursive: true })
  const tmp = `${docFile(base, id)}.tmp`
  await writeFile(tmp, json, 'utf-8')
  await rename(tmp, docFile(base, id))
  await writeFile(infoFile(base, id), JSON.stringify({ ...(info.path ? { path: info.path } : {}), name: info.name.slice(0, 80), at: now }), 'utf-8')
  return true
}

export async function clearRecovery(base: string, id: string): Promise<void> {
  if (!RECOVERY_ID.test(id)) return
  await Promise.all([rm(docFile(base, id), { force: true }), rm(infoFile(base, id), { force: true }), rm(`${docFile(base, id)}.tmp`, { force: true })])
}

/** Copies laissées par d'autres sessions, la plus récente d'abord. Les copies trop anciennes ou incomplètes sont supprimées. */
export async function listRecoverable(base: string, currentId: string, now = Date.now()): Promise<RecoveryInfo[]> {
  const names = await readdir(recoveryDir(base)).catch(() => [] as string[])
  const out: RecoveryInfo[] = []
  for (const file of names) {
    const m = /^(.+)\.json$/.exec(file)
    if (!m || !RECOVERY_ID.test(m[1]) || m[1] === currentId) continue
    const id = m[1]
    try {
      const raw = JSON.parse(await readFile(infoFile(base, id), 'utf-8'))
      const size = (await stat(docFile(base, id))).size
      if (typeof raw?.at !== 'number' || !Number.isFinite(raw.at) || now - raw.at > MAX_AGE_MS || size === 0) throw new Error('abandonnée')
      out.push({ id, ...(typeof raw.path === 'string' && raw.path ? { path: raw.path } : {}), name: typeof raw.name === 'string' ? raw.name : '', at: raw.at, bytes: size })
    } catch {
      await clearRecovery(base, id)
    }
  }
  // un document écrit sans fiche (arrêt entre les deux écritures) ne peut pas être présenté : on le retire aussi
  for (const file of names) {
    const m = /^(.+)\.trame$/.exec(file)
    if (m && RECOVERY_ID.test(m[1]) && m[1] !== currentId && !names.includes(`${m[1]}.json`)) await clearRecovery(base, m[1])
  }
  return out.sort((a, b) => b.at - a.at)
}

export async function readRecovery(base: string, id: string): Promise<string | null> {
  if (!RECOVERY_ID.test(id)) return null
  return readFile(docFile(base, id), 'utf-8').catch(() => null)
}
