import { createHash, randomBytes } from 'node:crypto'
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { gunzip as gunzipCb, gzip as gzipCb } from 'node:zlib'

const gzip = promisify(gzipCb)
const gunzip = promisify(gunzipCb)

/** Une version gardée d'un document : un instantané complet du fichier `.trame`, compressé. */
export interface VersionMeta {
  id: string
  /** date de l'instantané, en ms */
  at: number
  /** nom donné par l'utilisateur ; une version nommée est gardée plus longtemps que les automatiques */
  label?: string
  manual: boolean
  pages: number
  /** nom du document à ce moment-là */
  name: string
  /** taille compressée sur le disque */
  bytes: number
  /** empreinte du contenu : deux enregistrements identiques ne font qu'une version */
  hash: string
}

/** Combien on garde : les versions automatiques s'effacent les premières, les nommées sont gardées plus longtemps. */
export const LIMITS = { auto: 30, manual: 60, bytes: 400 * 1024 * 1024 }

export const VERSION_ID = /^[0-9a-f]{12}$/

const sha = (data: string | Buffer, len?: number): string => createHash('sha256').update(data).digest('hex').slice(0, len)

/** Dossier de l'historique d'un fichier : l'historique suit le chemin du fichier (déplacer le fichier le sépare de son historique). */
export const historyDir = (base: string, path: string): string => join(base, 'history', sha(path, 20))

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** Lit l'index ; tout contenu illisible donne une liste vide, une entrée invalide est ignorée. */
export function parseIndex(raw: string): VersionMeta[] {
  try {
    const data = JSON.parse(raw)
    const list = Array.isArray(data?.versions) ? data.versions : []
    return list
      .filter((v: any) => v && typeof v.id === 'string' && VERSION_ID.test(v.id) && isNum(v.at) && typeof v.hash === 'string')
      .map(
        (v: any): VersionMeta => ({
          id: v.id,
          at: v.at,
          ...(typeof v.label === 'string' && v.label.trim() ? { label: v.label.slice(0, 80) } : {}),
          manual: v.manual === true,
          pages: isNum(v.pages) ? v.pages : 0,
          name: typeof v.name === 'string' ? v.name.slice(0, 80) : '',
          bytes: isNum(v.bytes) ? v.bytes : 0,
          hash: v.hash
        })
      )
      .sort((a: VersionMeta, b: VersionMeta) => b.at - a.at)
  } catch {
    return []
  }
}

/** Identifiants à supprimer pour revenir dans les limites (la version la plus récente n'est jamais supprimée). */
export function pruneIds(list: VersionMeta[], limits = LIMITS): string[] {
  const newestFirst = [...list].sort((a, b) => b.at - a.at)
  const drop = new Set<string>()
  const over = (manual: boolean, max: number): void => {
    newestFirst.filter((v) => v.manual === manual).slice(max).forEach((v) => drop.add(v.id))
  }
  over(false, limits.auto)
  over(true, limits.manual)
  let kept = newestFirst.filter((v) => !drop.has(v.id))
  let total = kept.reduce((n, v) => n + v.bytes, 0)
  // encore trop lourd : on enlève les plus anciennes, les automatiques d'abord
  const victims = [...kept.slice(1)].reverse().sort((a, b) => Number(a.manual) - Number(b.manual) || a.at - b.at)
  for (const v of victims) {
    if (total <= limits.bytes) break
    drop.add(v.id)
    total -= v.bytes
  }
  kept = kept.filter((v) => !drop.has(v.id))
  return [...drop]
}

// Les opérations d'un même dossier s'exécutent l'une après l'autre : l'index est relu puis réécrit en entier.
const queues = new Map<string, Promise<unknown>>()
function serial<T>(dir: string, job: () => Promise<T>): Promise<T> {
  const run = (queues.get(dir) ?? Promise.resolve()).then(job, job)
  queues.set(dir, run.catch(() => {}))
  return run
}

async function readIndex(dir: string): Promise<VersionMeta[]> {
  return parseIndex(await readFile(join(dir, 'index.json'), 'utf-8').catch(() => ''))
}

async function writeIndex(dir: string, versions: VersionMeta[], path: string): Promise<void> {
  await writeFile(join(dir, 'index.json'), JSON.stringify({ path, versions }), 'utf-8')
}

/** Résumé d'un fichier `.trame` pour l'index (sans le valider : l'historique garde ce qu'on lui donne). */
function summary(json: string): { pages: number; name: string } {
  try {
    const doc = JSON.parse(json)
    return { pages: Array.isArray(doc?.pages) ? doc.pages.length : 0, name: typeof doc?.name === 'string' ? doc.name : '' }
  } catch {
    return { pages: 0, name: '' }
  }
}

export interface AddOptions {
  /** version demandée par l'utilisateur */
  manual?: boolean
  label?: string
  now?: number
}

/**
 * Ajoute une version. Un contenu identique à la plus récente n'en crée pas : si la demande est manuelle, la
 * version existante est simplement nommée. Retourne la version concernée.
 */
export function addVersion(base: string, path: string, json: string, opts: AddOptions = {}): Promise<VersionMeta> {
  const dir = historyDir(base, path)
  return serial(dir, async () => {
    await mkdir(dir, { recursive: true })
    const list = await readIndex(dir)
    const hash = sha(json)
    const label = opts.label?.trim().slice(0, 80) || undefined
    const newest = list[0]
    if (newest && newest.hash === hash) {
      if (opts.manual && (!newest.manual || label)) {
        const named: VersionMeta = { ...newest, manual: true, ...(label ? { label } : {}) }
        await writeIndex(dir, [named, ...list.slice(1)], path)
        return named
      }
      return newest
    }
    const id = randomBytes(6).toString('hex')
    const packed = await gzip(Buffer.from(json, 'utf-8'), { level: 1 })
    await writeFile(join(dir, `${id}.json.gz`), packed)
    const meta: VersionMeta = { id, at: opts.now ?? Date.now(), ...(label ? { label } : {}), manual: opts.manual === true, ...summary(json), bytes: packed.length, hash }
    const all = [meta, ...list]
    const drop = new Set(pruneIds(all))
    await Promise.all([...drop].map((d) => rm(join(dir, `${d}.json.gz`), { force: true })))
    await writeIndex(dir, all.filter((v) => !drop.has(v.id)), path)
    return meta
  })
}

/** Contenu d'un fichier déjà sur le disque, versionné s'il diffère de la dernière version (pour garder l'état d'avant une écrasure). */
export async function addIfNew(base: string, path: string, json: string): Promise<VersionMeta | null> {
  const dir = historyDir(base, path)
  const list = await serial(dir, () => readIndex(dir))
  if (list[0]?.hash === sha(json)) return null
  return addVersion(base, path, json)
}

export async function listVersions(base: string, path: string): Promise<VersionMeta[]> {
  const dir = historyDir(base, path)
  return serial(dir, async () => {
    const list = await readIndex(dir)
    // une version dont le fichier a disparu n'est pas proposée
    const files = new Set(await readdir(dir).catch(() => [] as string[]))
    return list.filter((v) => files.has(`${v.id}.json.gz`))
  })
}

/** Contenu d'une version, ou null si elle n'existe plus. */
export async function readVersion(base: string, path: string, id: string): Promise<string | null> {
  if (!VERSION_ID.test(id)) return null
  try {
    return (await gunzip(await readFile(join(historyDir(base, path), `${id}.json.gz`)))).toString('utf-8')
  } catch {
    return null
  }
}

/** Nomme (ou renomme) une version ; un nom vide la remet parmi les versions automatiques. */
export function labelVersion(base: string, path: string, id: string, label: string): Promise<boolean> {
  const dir = historyDir(base, path)
  return serial(dir, async () => {
    const list = await readIndex(dir)
    const i = list.findIndex((v) => v.id === id)
    if (i < 0) return false
    const name = label.trim().slice(0, 80)
    const { label: _old, ...rest } = list[i]
    void _old
    list[i] = name ? { ...rest, label: name, manual: true } : { ...rest, manual: false }
    await writeIndex(dir, list, path)
    return true
  })
}

export function deleteVersion(base: string, path: string, id: string): Promise<boolean> {
  const dir = historyDir(base, path)
  return serial(dir, async () => {
    if (!VERSION_ID.test(id)) return false
    const list = await readIndex(dir)
    if (!list.some((v) => v.id === id)) return false
    await rm(join(dir, `${id}.json.gz`), { force: true })
    await writeIndex(dir, list.filter((v) => v.id !== id), path)
    return true
  })
}
