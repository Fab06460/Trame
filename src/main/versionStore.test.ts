import { mkdtemp, rm, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  LIMITS,
  addIfNew,
  addVersion,
  deleteVersion,
  historyDir,
  labelVersion,
  listVersions,
  parseIndex,
  pruneIds,
  readVersion,
  type VersionMeta
} from './versionStore'

const doc = (name: string, pages = 1): string => JSON.stringify({ version: 2, name, pages: Array.from({ length: pages }, (_, i) => ({ id: `p${i}` })) })
const meta = (id: string, at: number, extra: Partial<VersionMeta> = {}): VersionMeta => ({ id, at, manual: false, pages: 1, name: 'x', bytes: 10, hash: id, ...extra })

describe('pruneIds', () => {
  it('garde au plus LIMITS.auto versions automatiques, les plus récentes', () => {
    const list = Array.from({ length: LIMITS.auto + 5 }, (_, i) => meta(String(i).padStart(12, '0'), i))
    const drop = pruneIds(list)
    expect(drop).toHaveLength(5)
    expect(drop.every((id) => Number(id) < 5)).toBe(true)
  })

  it('les versions nommées ont leur propre limite et ne comptent pas dans celle des automatiques', () => {
    const list = [
      ...Array.from({ length: LIMITS.auto }, (_, i) => meta(`a${String(i).padStart(11, '0')}`, 1000 + i)),
      ...Array.from({ length: 3 }, (_, i) => meta(`b${String(i).padStart(11, '0')}`, i, { manual: true }))
    ]
    expect(pruneIds(list)).toEqual([])
  })

  it("quand le total est trop lourd, retire les plus anciennes (automatiques d'abord) mais jamais la plus récente", () => {
    const list = [
      meta('a00000000001', 1, { bytes: 60 }),
      meta('b00000000001', 2, { bytes: 60, manual: true }),
      meta('a00000000003', 3, { bytes: 60 })
    ]
    const drop = pruneIds(list, { auto: 10, manual: 10, bytes: 100 })
    expect(drop).toContain('a00000000001')
    expect(drop).not.toContain('a00000000003')
    expect(pruneIds([meta('a00000000001', 1, { bytes: 500 })], { auto: 10, manual: 10, bytes: 100 })).toEqual([])
  })
})

describe('parseIndex', () => {
  it('ignore un contenu illisible et les entrées invalides', () => {
    expect(parseIndex('pas du json')).toEqual([])
    expect(parseIndex('{"versions":[{"id":"../x","at":1,"hash":"h"},{"id":"0123456789ab","at":2,"hash":"h","label":"  "}]}')).toEqual([
      { id: '0123456789ab', at: 2, manual: false, pages: 0, name: '', bytes: 0, hash: 'h' }
    ])
  })
})

describe('versionStore', () => {
  let base: string
  beforeEach(async () => {
    base = await mkdtemp(join(tmpdir(), 'trame-versions-'))
  })
  afterEach(() => rm(base, { recursive: true, force: true }))

  it('garde une version, la relit et la liste (la plus récente en premier)', async () => {
    const a = await addVersion(base, '/docs/a.trame', doc('A', 2), { now: 1000 })
    const b = await addVersion(base, '/docs/a.trame', doc('A2', 3), { now: 2000 })
    const list = await listVersions(base, '/docs/a.trame')
    expect(list.map((v) => v.id)).toEqual([b.id, a.id])
    expect(list[0]).toMatchObject({ pages: 3, name: 'A2', manual: false })
    expect(await readVersion(base, '/docs/a.trame', a.id)).toBe(doc('A', 2))
  })

  it("l'historique est propre à chaque chemin", async () => {
    await addVersion(base, '/docs/a.trame', doc('A'))
    expect(await listVersions(base, '/docs/b.trame')).toEqual([])
  })

  it('un contenu identique à la dernière version ne crée rien', async () => {
    const a = await addVersion(base, '/d/a.trame', doc('A'), { now: 1 })
    const again = await addVersion(base, '/d/a.trame', doc('A'), { now: 2 })
    expect(again.id).toBe(a.id)
    expect(await listVersions(base, '/d/a.trame')).toHaveLength(1)
  })

  it('une demande manuelle sur un contenu identique nomme la version existante', async () => {
    const a = await addVersion(base, '/d/a.trame', doc('A'))
    const named = await addVersion(base, '/d/a.trame', doc('A'), { manual: true, label: 'Rendu au prof' })
    expect(named).toMatchObject({ id: a.id, manual: true, label: 'Rendu au prof' })
    expect(await listVersions(base, '/d/a.trame')).toHaveLength(1)
  })

  it("addIfNew garde l'état du disque avant écrasement, une seule fois", async () => {
    expect(await addIfNew(base, '/d/a.trame', doc('A'))).not.toBeNull()
    expect(await addIfNew(base, '/d/a.trame', doc('A'))).toBeNull()
    expect(await addIfNew(base, '/d/a.trame', doc('B'))).not.toBeNull()
  })

  it('nomme, renomme puis retire le nom (la version redevient automatique)', async () => {
    const a = await addVersion(base, '/d/a.trame', doc('A'))
    expect(await labelVersion(base, '/d/a.trame', a.id, ' Brouillon ')).toBe(true)
    expect((await listVersions(base, '/d/a.trame'))[0]).toMatchObject({ label: 'Brouillon', manual: true })
    expect(await labelVersion(base, '/d/a.trame', a.id, '')).toBe(true)
    const v = (await listVersions(base, '/d/a.trame'))[0]
    expect(v.manual).toBe(false)
    expect(v.label).toBeUndefined()
    expect(await labelVersion(base, '/d/a.trame', 'ffffffffffff', 'x')).toBe(false)
  })

  it('supprime une version et son fichier', async () => {
    const a = await addVersion(base, '/d/a.trame', doc('A'))
    expect(await deleteVersion(base, '/d/a.trame', a.id)).toBe(true)
    expect(await listVersions(base, '/d/a.trame')).toEqual([])
    expect((await readdir(historyDir(base, '/d/a.trame'))).filter((f) => f.endsWith('.gz'))).toEqual([])
    expect(await deleteVersion(base, '/d/a.trame', a.id)).toBe(false)
  })

  it('refuse un identifiant qui sortirait du dossier', async () => {
    expect(await readVersion(base, '/d/a.trame', '../../index')).toBeNull()
    expect(await deleteVersion(base, '/d/a.trame', '../../x')).toBe(false)
  })

  it("n'affiche pas une version dont le fichier a disparu", async () => {
    const a = await addVersion(base, '/d/a.trame', doc('A'))
    await rm(join(historyDir(base, '/d/a.trame'), `${a.id}.json.gz`))
    expect(await listVersions(base, '/d/a.trame')).toEqual([])
    expect(await readVersion(base, '/d/a.trame', a.id)).toBeNull()
  })

  it('des enregistrements simultanés ne perdent aucune version', async () => {
    await Promise.all(Array.from({ length: 8 }, (_, i) => addVersion(base, '/d/a.trame', doc(`v${i}`), { now: i })))
    expect(await listVersions(base, '/d/a.trame')).toHaveLength(8)
  })

  it('applique la limite de versions automatiques', async () => {
    for (let i = 0; i < LIMITS.auto + 3; i++) await addVersion(base, '/d/a.trame', doc(`v${i}`), { now: i })
    const list = await listVersions(base, '/d/a.trame')
    expect(list).toHaveLength(LIMITS.auto)
    expect((await readdir(historyDir(base, '/d/a.trame'))).filter((f) => f.endsWith('.gz'))).toHaveLength(LIMITS.auto)
  })
})
