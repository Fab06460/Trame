import { mkdtemp, rm, writeFile, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MAX_AGE_MS, clearRecovery, listRecoverable, readRecovery, recoveryDir, writeRecovery } from './recoveryStore'

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'

describe('recoveryStore', () => {
  let base: string
  beforeEach(async () => {
    base = await mkdtemp(join(tmpdir(), 'trame-recovery-'))
  })
  afterEach(() => rm(base, { recursive: true, force: true }))

  it("propose la copie d'une autre session, pas celle de la session en cours", async () => {
    await writeRecovery(base, A, '{"a":1}', { path: '/d/a.trame', name: 'Cours' }, 1000)
    await writeRecovery(base, B, '{"b":1}', { name: 'Sans titre' }, 2000)
    const list = await listRecoverable(base, B, 3000)
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ id: A, path: '/d/a.trame', name: 'Cours', at: 1000 })
    expect(await readRecovery(base, A)).toBe('{"a":1}')
  })

  it('classe les copies de la plus récente à la plus ancienne ; un document jamais enregistré n\'a pas de chemin', async () => {
    await writeRecovery(base, A, '{}', { name: 'x' }, 1000)
    await writeRecovery(base, B, '{}', { name: 'y' }, 2000)
    const list = await listRecoverable(base, '33333333-3333-4333-8333-333333333333', 3000)
    expect(list.map((r) => r.id)).toEqual([B, A])
    expect(list[0].path).toBeUndefined()
  })

  it('une copie remplace la précédente de la même session', async () => {
    await writeRecovery(base, A, '{"v":1}', { name: 'x' }, 1000)
    await writeRecovery(base, A, '{"v":2}', { name: 'x' }, 2000)
    expect(await readRecovery(base, A)).toBe('{"v":2}')
    expect((await readdir(recoveryDir(base))).filter((f) => f.endsWith('.tmp'))).toEqual([])
  })

  it('efface une copie, et supprime celles qui sont trop anciennes', async () => {
    await writeRecovery(base, A, '{}', { name: 'x' }, 1000)
    await writeRecovery(base, B, '{}', { name: 'y' }, 1000)
    await clearRecovery(base, A)
    expect(await readRecovery(base, A)).toBeNull()
    expect(await listRecoverable(base, '33333333-3333-4333-8333-333333333333', 1000 + MAX_AGE_MS + 1)).toEqual([])
    expect(await readdir(recoveryDir(base))).toEqual([])
  })

  it('retire une copie sans fiche ou une fiche illisible', async () => {
    await writeFile(join(recoveryDir(base), `${A}.trame`), '{}').catch(async () => {
      await writeRecovery(base, B, '{}', { name: 'z' }, 1)
      await rm(join(recoveryDir(base), `${B}.json`))
      await writeFile(join(recoveryDir(base), `${A}.trame`), '{}')
    })
    await writeFile(join(recoveryDir(base), `${A}.json`), 'pas du json')
    await listRecoverable(base, '33333333-3333-4333-8333-333333333333', 5)
    expect(await readdir(recoveryDir(base))).toEqual([])
  })

  it('refuse un identifiant qui n\'est pas celui d\'une session', async () => {
    expect(await writeRecovery(base, '../x', '{}', { name: 'x' })).toBe(false)
    expect(await readRecovery(base, '../../etc/passwd')).toBeNull()
  })
})
