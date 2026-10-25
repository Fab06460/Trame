import { describe, expect, it } from 'vitest'
import { formatRelative } from '@/formatDate'

const NOW = new Date('2026-10-25T12:00:00Z').getTime()
const ago = (s: number): number => NOW - s * 1000

describe('formatRelative', () => {
  it('à l’instant sous la minute', () => {
    expect(formatRelative(ago(20), NOW)).toBe("à l'instant")
  })
  it('minutes, heures, jours', () => {
    expect(formatRelative(ago(5 * 60), NOW)).toBe('il y a 5 minutes')
    expect(formatRelative(ago(3 * 3600), NOW)).toBe('il y a 3 heures')
    expect(formatRelative(ago(86400), NOW)).toBe('hier')
    expect(formatRelative(ago(3 * 86400), NOW)).toBe('il y a 3 jours')
  })
  it('date complète au-delà d’une semaine', () => {
    expect(formatRelative(ago(30 * 86400), NOW)).toMatch(/2026/)
  })
})
