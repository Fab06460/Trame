import { describe, expect, it } from 'vitest'
import { pendingNews } from './news'

const memory = (init: Record<string, string> = {}): { getItem: (k: string) => string | null; setItem: (k: string, v: string) => void; data: Record<string, string> } => {
  const data = { ...init }
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v) }
}

describe('nouveautés au lancement', () => {
  it('première installation (visite guidée pas encore faite) : rien, mais la version est retenue', () => {
    const s = memory()
    expect(pendingNews('0.13.0', s)).toEqual([])
    expect(s.data['trame.lastVersion']).toBe('0.13.0')
  })

  it('mise à jour depuis une version qui ne retenait pas son numéro : la version courante seule', () => {
    const s = memory({ 'trame.tour': '1' })
    expect(pendingNews('0.13.0', s).map((n) => n.version)).toEqual(['0.13.0'])
    expect(s.data['trame.lastVersion']).toBe('0.13.0')
    expect(pendingNews('0.13.0', s)).toEqual([]) // une seule fois
  })

  it('mise à jour d\'une version connue : tout ce qui est arrivé depuis', () => {
    const s = memory({ 'trame.tour': '1', 'trame.lastVersion': '0.10.0' })
    expect(pendingNews('0.12.0', s).map((n) => n.version)).toEqual(['0.12.0', '0.11.0'])
  })

  it('même version, ou stockage inutilisable : rien', () => {
    expect(pendingNews('0.13.0', memory({ 'trame.lastVersion': '0.13.0' }))).toEqual([])
    expect(pendingNews('0.13.0', null)).toEqual([])
    const broken = { getItem: () => { throw new Error('x') }, setItem: () => {} }
    expect(pendingNews('0.13.0', broken)).toEqual([])
  })
})
