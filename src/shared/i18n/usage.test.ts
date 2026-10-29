import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { fr } from './locales/fr'

/** Tous les fichiers source (hors tests et catalogues) : une clé qui n'est lue nulle part est une traduction inutile. */
function sources(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) {
      if (name !== 'locales' && name !== 'node_modules') out.push(...sources(path))
    } else if (/\.(ts|tsx)$/.test(name) && !/\.test\.ts$/.test(name)) out.push(path)
  }
  return out
}

describe('usage des clés de traduction', () => {
  const text = sources(join(__dirname, '..', '..')).map((f) => readFileSync(f, 'utf-8')).join('\n')
  const keys = Object.keys(fr)

  // une clé est « utilisée » si elle apparaît comme texte littéral, ou si un préfixe construit (`transition.${id}`) la couvre
  const prefixes = [...text.matchAll(/[`'"]([a-z][\w-]*(?:\.[\w-]+)*\.)\$\{/g)].map((m) => m[1])
  const used = (key: string): boolean => text.includes(`'${key}'`) || text.includes(`"${key}"`) || text.includes(`\`${key}\``) || prefixes.some((p) => key.startsWith(p))

  it('toutes les clés du français sont utilisées quelque part', () => {
    expect(keys.filter((k) => !used(k))).toEqual([])
  })
})
