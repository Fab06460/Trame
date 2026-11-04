// Génère src/renderer/src/illustrationData.json à partir des « Open Doodles » de Pablo Stanley (licence CC0, voir docs/ARCHITECTURE.md
// § Illustrations), tels que publiés dans le paquet react-open-doodles (MIT) : un composant TSX par dessin, deux couleurs (encre et accent).
// Chaque dessin devient une liste de couches (un chemin par couche, avec sa couleur : 0 = accent, 1 = encre), les transformations (translate, rotate)
// étant cuites dans les coordonnées, dans un viewBox 100 × 100 (le format du type d'élément `path`, étiré à la taille de l'élément).
// Usage : git clone --depth 1 https://github.com/lunahq/react-open-doodles /tmp/od && node scripts/build-illustrations.mjs /tmp/od
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { toAbsolute } from './svg-path.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = process.argv[2]
if (!src) throw new Error('Usage : node scripts/build-illustrations.mjs <dossier de react-open-doodles>')
const dir = join(src, 'src/components')

const round = (v) => String(Number(v.toFixed(2)))

/** Les attributs d'une balise `<g>` ou `<path>` : nom → valeur (texte entre guillemets, ou nom de variable entre accolades). */
function attrs(tag) {
  const out = {}
  for (const m of tag.matchAll(/([a-zA-Z]+)=(?:"([^"]*)"|\{([^}]*)\})/g)) out[m[1]] = m[2] ?? `{${m[3]}}`
  return out
}

const IDENTITY = [1, 0, 0, 1, 0, 0]
/** Produit de deux matrices SVG [a b c d e f] : `m` puis `n` (n appliquée en premier aux points). */
const mul = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]]

/** Attribut `transform` (translate, rotate, scale, dans cet ordre de lecture) → matrice. */
function matrixOf(text, file) {
  let m = IDENTITY
  let rest = text.trim()
  while (rest) {
    const t = /^(translate|rotate|scale)\(([^)]*)\)\s*/.exec(rest)
    if (!t) throw new Error(`${file} : transformation non gérée « ${text} »`)
    const v = t[2].split(/[\s,]+/).filter(Boolean).map(Number)
    let n
    if (t[1] === 'translate') n = [1, 0, 0, 1, v[0], v[1] ?? 0]
    else if (t[1] === 'scale') n = [v[0], 0, 0, v[1] ?? v[0], 0, 0]
    else {
      const r = (v[0] * Math.PI) / 180
      const rot = [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0]
      n = v.length === 3 ? mul(mul([1, 0, 0, 1, v[1], v[2]], rot), [1, 0, 0, 1, -v[1], -v[2]]) : rot
    }
    m = mul(m, n)
    rest = rest.slice(t[0].length)
  }
  return m
}

/** Les couches d'un dessin, dans l'ordre de peinture : { color: 0 | 1, d }. */
function layersOf(tsx, file) {
  const body = tsx.slice(tsx.indexOf('<svg'), tsx.indexOf('</svg>'))
  const [vw, vh] = /viewBox="0 0 (\d+) (\d+)"/.exec(body).slice(1).map(Number)
  const layers = []
  const stack = [{ fill: 'none', m: IDENTITY }]
  for (const m of body.matchAll(/<g\b[^>]*>|<\/g>|<path\b[^>]*\/>/g)) {
    const tag = m[0]
    if (tag === '</g>') {
      stack.pop()
      continue
    }
    const a = attrs(tag)
    const top = stack[stack.length - 1]
    const here = { fill: a.fill ?? top.fill, m: a.transform ? mul(top.m, matrixOf(a.transform, file)) : top.m }
    if (tag.startsWith('<g')) {
      stack.push(here)
      continue
    }
    if (here.fill === 'none') continue
    const color = here.fill === '{accent}' ? 0 : here.fill === '{ink}' ? 1 : -1
    if (color < 0) throw new Error(`${file} : couleur inattendue « ${here.fill} »`)
    // coordonnées absolues (M L C Z), transformation cuite, ramenées au viewBox 100 × 100
    const [ma, mb, mc, md, me, mf] = here.m
    const d = toAbsolute(a.d)
      .map(([c, ...p]) => {
        const pts = []
        for (let i = 0; i < p.length; i += 2) pts.push(round(((ma * p[i] + mc * p[i + 1] + me) * 100) / vw), round(((mb * p[i] + md * p[i + 1] + mf) * 100) / vh))
        return c + pts.join(' ')
      })
      .join('')
    layers.push([color, d])
  }
  return { vw, vh, layers }
}

// « Bikini » (une personne en maillot de bain) est écarté : la bibliothèque doit rester utilisable dans tous les contextes (école, entreprise…)
const SKIPPED = new Set(['BikiniDoodle.tsx'])
const files = (await readdir(dir)).filter((f) => f.endsWith('Doodle.tsx') && !SKIPPED.has(f)).sort()
const out = []
for (const f of files) {
  const id = f.replace('Doodle.tsx', '').replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()
  const { vw, vh, layers } = layersOf(await readFile(join(dir, f), 'utf8'), f)
  out.push([id, vw / vh, layers])
}
const file = join(root, 'src/renderer/src/illustrationData.json')
await writeFile(file, JSON.stringify(out))
console.log(`${out.length} illustrations, ${out.reduce((n, o) => n + o[2].length, 0)} couches → ${file}`)
