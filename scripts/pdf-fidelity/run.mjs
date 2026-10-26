#!/usr/bin/env node
/**
 * Fidélité de l'export PDF vectoriel : pour chaque document de test (documents.ts), exporte le PDF et l'image Konva
 * (celle de l'éditeur), rastérise le PDF avec PDFKit, mesure l'écart pixel à pixel et vérifie que le texte est extractible.
 *
 *     npm run fidelity      (macOS : nécessite Swift / PDFKit)
 *
 * Les images (PDF rastérisé, Konva, différences) sont conservées dans le dossier affiché en fin d'exécution.
 */
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

/** Seuil : part maximale (en %) de pixels très différents (> 64/255) par page. Mesuré ~0,2–0,9 % : le reste est du lissage. */
const MAX_BIG_PCT = 2

if (process.platform !== 'darwin') {
  console.log('npm run fidelity : macOS uniquement (PDFKit). Ignoré.')
  process.exit(0)
}

const here = import.meta.dirname
const root = resolve(here, '../..')
const electron = createRequire(import.meta.url)(join(root, 'node_modules/electron'))

const sh = (cmd, args, opts = {}) =>
  new Promise((res) => {
    let out = ''
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'inherit'], ...opts })
    p.stdout.on('data', (d) => (out += d))
    p.on('exit', (code) => res({ code, out }))
  })

const out = await mkdtemp(join(tmpdir(), 'trame-fidelity-'))

console.log('Construction de la page de test…')
const build = await sh('npx', ['vite', 'build', '--config', join(here, 'vite.config.mjs')], { cwd: root })
if (build.code !== 0) throw new Error('vite build a échoué')

console.log('Export des documents (PDF + image Konva)…')
const env = { ...process.env, FIDELITY_OUT: out }
delete env.ELECTRON_RUN_AS_NODE
const run = await sh(electron, [join(here, 'main.cjs')], { env })
if (run.code !== 0) {
  const err = await readFile(join(out, 'error.txt'), 'utf-8').catch(() => '(pas de détail)')
  throw new Error(`l'export a échoué :\n${err}`)
}

const report = JSON.parse(await readFile(join(out, 'report.json'), 'utf-8'))
let failures = 0
const norm = (s) => s.replace(/\s+/g, ' ').trim()

console.log(`\n${'document'.padEnd(12)} page   écart moyen   pixels très différents   texte extractible   export`)
for (const [name, info] of Object.entries(report)) {
  const res = await sh('swift', [join(here, 'compare.swift'), join(out, `${name}.pdf`), join(out, `${name}-konva`), String(info.width), join(out, `${name}-pdf`)])
  const pages = res.out.trim().split('\n').map((l) => JSON.parse(l))
  const allText = norm(pages.map((p) => p.text).join(' '))
  const missing = info.expectText.filter((t) => !allText.includes(norm(t)))
  const fbOk = info.fallbacks.length === info.expectFallbacks
  if (!fbOk) {
    failures++
    console.log(`${name.padEnd(12)} ✗ replis en image : ${info.fallbacks.length} (attendu ${info.expectFallbacks}) ${info.fallbacks.map((f) => `« ${f.text.slice(0, 24)} » (${f.reason})`).join(' ; ')}`)
  }
  for (const p of pages) {
    const bad = p.error || p.bigPct > MAX_BIG_PCT
    const textOk = missing.length === 0
    if (bad || (p.page === 1 && !textOk)) failures++
    console.log(
      `${name.padEnd(12)} ${String(p.page).padEnd(4)} ` +
        (p.error
          ? `ERREUR : ${p.error}`
          : `${p.meanDiff.toFixed(2).padStart(8)}/255   ${(p.bigPct.toFixed(2) + ' %').padStart(10)} ${p.bigPct > MAX_BIG_PCT ? '✗' : '✓'}            ` +
            `${p.page === 1 ? (textOk ? '✓' : '✗ manque : ' + missing.join(' | ')) : '·'}`.padEnd(20)) +
        `   ${p.page === 1 ? info.exportMs + ' ms' : ''}`
    )
  }
}

console.log(`\nImages (PDF rastérisé, Konva) : ${out}`)
console.log(failures ? `✗ ${failures} problème(s) de fidélité (seuil : ${MAX_BIG_PCT} % de pixels très différents)` : '✓ Fidélité OK')
process.exit(failures ? 1 : 0)
