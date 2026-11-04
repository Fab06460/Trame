// Génère src/renderer/src/iconData.json à partir de @phosphor-icons/core (licence MIT, voir docs/ARCHITECTURE.md § Icônes).
// Chaque icône devient un chemin SVG « absolu » (M, L, C, Z seulement, arcs convertis en courbes de Bézier) dans un viewBox 100 × 100 :
// c'est le format du type d'élément `path`, que l'éditeur sait étirer sans déformer un contour et que le PDF dessine en vectoriel.
// Usage : node scripts/build-icons.mjs
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { toAbsolute } from './svg-path.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pkgDir = join(root, 'node_modules/@phosphor-icons/core')
const { icons } = await import('@phosphor-icons/core')

const SIZE = 256
const K = 100 / SIZE
const num = (v) => String(Number((v * K).toFixed(2)))

const format = (cmds) => cmds.map(([c, ...a]) => c + a.map(num).join(' ')).join('')

const svgPath = async (file) => {
  const svg = await readFile(file, 'utf8')
  const ds = [...svg.matchAll(/ d="([^"]+)"/g)].map((m) => m[1])
  if (ds.length === 0) throw new Error(`${file} : aucun chemin`)
  // quelques icônes ont plusieurs chemins pleins : mis bout à bout, ils se remplissent ensemble
  return format(ds.flatMap((d) => toAbsolute(d)))
}

const categories = []
const out = []
for (const icon of icons) {
  if (icon.categories.includes('brands')) continue // marques déposées : pas dans la bibliothèque
  const cats = icon.categories.map((c) => {
    let at = categories.indexOf(c)
    if (at < 0) at = categories.push(c) - 1
    return at
  })
  const tags = icon.tags.filter((t) => !t.startsWith('*'))
  out.push([icon.name, cats, tags, await svgPath(join(pkgDir, 'assets/regular', `${icon.name}.svg`)), await svgPath(join(pkgDir, 'assets/fill', `${icon.name}-fill.svg`))])
}
const file = join(root, 'src/renderer/src/iconData.json')
await writeFile(file, JSON.stringify({ categories, icons: out }))
console.log(`${out.length} icônes, ${categories.length} catégories → ${file}`)
