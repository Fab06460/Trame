#!/usr/bin/env node
/**
 * Publication macOS : signature Developer ID, notarisation, agrafage, vérifications.
 *
 *     npm run release:check    vérifie seulement les prérequis (rien n'est construit, rien n'est envoyé à Apple)
 *     npm run release:mac      construit, signe, notarise (plusieurs minutes), agrafe et vérifie
 *
 * Prérequis (voir docs/PACKAGING.md) :
 *   1. un certificat « Developer ID Application » dans le trousseau ;
 *   2. un profil d'identifiants de notarisation enregistré dans le trousseau avec `xcrun notarytool store-credentials`.
 * Aucun secret n'est lu ni écrit par ce script : Apple ne voit que ce que notarytool lit lui-même dans le trousseau.
 */
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const CHECK_ONLY = process.argv.includes('--check')
const PROFILE = process.env.TRAME_NOTARY_PROFILE ?? 'trame-notary'
// Trousseau contenant le profil de notarisation. Par défaut on n'en impose AUCUN : `notarytool store-credentials` range le profil
// là où macOS le décide (souvent le trousseau iCloud, pas « Connexion »), et lui seul sait le retrouver. TRAME_KEYCHAIN force un
// chemin si le profil a été enregistré avec `--keychain`.
const KEYCHAIN = process.env.TRAME_KEYCHAIN

if (process.platform !== 'darwin') {
  console.error('La publication macOS ne peut se faire que sous macOS.')
  process.exit(1)
}

const run = (cmd, args, opts = {}) =>
  new Promise((res) => {
    let out = ''
    const p = spawn(cmd, args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], ...opts })
    p.stdout.on('data', (d) => (out += d))
    p.stderr.on('data', (d) => (out += d))
    p.on('exit', (code) => res({ code, out }))
  })

/** Lance une commande en affichant sa sortie en direct (build, notarisation). */
const stream = (cmd, args, env = {}) =>
  new Promise((res) => {
    const p = spawn(cmd, args, { cwd: root, stdio: 'inherit', env: { ...process.env, ...env } })
    p.on('exit', (code) => res(code))
  })

let problems = 0
const ok = (msg) => console.log(`  ✓ ${msg}`)
const ko = (msg, how) => {
  problems++
  console.log(`  ✗ ${msg}`)
  for (const line of how) console.log(`      ${line}`)
}

console.log('Prérequis de publication\n')

// 1. outils Xcode
const notarytool = await run('xcrun', ['--find', 'notarytool'])
const stapler = await run('xcrun', ['--find', 'stapler'])
if (notarytool.code === 0 && stapler.code === 0) ok('outils Xcode : notarytool et stapler disponibles')
else ko('outils Xcode introuvables (notarytool / stapler)', ['Installer Xcode (ou les Command Line Tools) : xcode-select --install'])

// 2. certificat Developer ID Application
const ids = await run('security', ['find-identity', '-v', '-p', 'codesigning'])
const devId = [...ids.out.matchAll(/"(Developer ID Application: (.+?) \(([A-Z0-9]{10})\))"/g)].map((m) => ({ full: m[1], name: `${m[2]} (${m[3]})`, team: m[3] }))
const identity = devId.find((d) => !process.env.TRAME_SIGN_IDENTITY || d.full.includes(process.env.TRAME_SIGN_IDENTITY))
if (identity) {
  ok(`certificat : ${identity.full}`)
  if (devId.length > 1) console.log(`      (${devId.length} certificats Developer ID trouvés ; pour en choisir un : TRAME_SIGN_IDENTITY="<nom>")`)
} else {
  const others = [...ids.out.matchAll(/"((?:Apple Development|Apple Distribution|Mac Developer)[^"]*)"/g)].map((m) => m[1])
  ko('aucun certificat « Developer ID Application » valide dans le trousseau', [
    ...(others.length ? [`Présents mais inutilisables pour distribuer hors App Store : ${others.join(' ; ')}`] : []),
    'Pour le créer (compte Apple Developer payant, rôle Titulaire ou Admin) :',
    '  Xcode → Réglages → Comptes → votre équipe → Gérer les certificats… → « + » → Developer ID Application',
    '  (ou developer.apple.com → Certificates → « + » → Developer ID Application, puis double-clic sur le .cer)',
    'La clé privée doit se trouver sur CE Mac : un certificat créé ailleurs ne suffit pas sans son export (.p12).'
  ])
}

// l'identifiant d'équipe se lit aussi dans les certificats « Apple Distribution » (où il figure entre parenthèses)
const teamHint = identity?.team ?? ids.out.match(/Apple Distribution: .+? \(([A-Z0-9]{10})\)/)?.[1]

// 3. identifiants de notarisation
if (notarytool.code === 0) {
  // même appel exactement que celui de la notarisation (mêmes arguments de trousseau), pour ne pas valider autre chose
  const hist = await run('xcrun', ['notarytool', 'history', '--keychain-profile', PROFILE, ...(KEYCHAIN ? ['--keychain', KEYCHAIN] : []), '--output-format', 'json'])
  if (hist.code === 0) ok(`notarisation : profil « ${PROFILE} » valide (connexion à Apple réussie)`)
  else {
    const missing = /No Keychain password item found|could not find/i.test(hist.out)
    ko(missing ? `profil de notarisation « ${PROFILE} » introuvable dans le trousseau` : `profil « ${PROFILE} » inutilisable : ${hist.out.trim().split('\n').pop()}`, [
      'Créer un mot de passe d\'application : appleid.apple.com → Connexion et sécurité → Mots de passe d\'application.',
      'Puis l\'enregistrer dans le trousseau (il vous demandera le mot de passe, sans l\'afficher ni l\'écrire ailleurs) :',
      `  xcrun notarytool store-credentials "${PROFILE}" --apple-id "<votre identifiant Apple>" --team-id "${teamHint ?? '<ID d\'équipe>'}"`,
      '(Alternative sans mot de passe : une clé d\'API App Store Connect, voir docs/PACKAGING.md.)'
    ])
  }
}

// 4. cohérence : l'équipe du certificat
if (identity) console.log(`\n  Équipe : ${identity.team}`)

if (problems) {
  console.log(`\n${problems} prérequis manquant(s). Rien n'a été construit ni envoyé.`)
  process.exit(1)
}
console.log('\nTous les prérequis sont réunis.')
if (CHECK_ONLY) process.exit(0)

// ── Publication ─────────────────────────────────────────────────────────────────────────────────────────
console.log('\n1/3 Construction, signature et notarisation (la notarisation prend en général 2 à 10 minutes)…\n')
const env = { CSC_NAME: identity.name, APPLE_KEYCHAIN_PROFILE: PROFILE, ...(KEYCHAIN ? { APPLE_KEYCHAIN: KEYCHAIN } : {}) }
delete process.env.ELECTRON_RUN_AS_NODE
if ((await stream('npx', ['electron-vite', 'build'])) !== 0) process.exit(1)
if ((await stream('npx', ['electron-builder', '--mac', '--config', 'electron-builder.release.cjs'], env)) !== 0) {
  console.error('\n✗ electron-builder a échoué (voir ci-dessus).')
  process.exit(1)
}

console.log('\n2/3 Vérifications…\n')
const dist = join(root, 'dist')
const app = join(dist, 'mac-arm64/Trame.app')
const files = await readdir(dist)
// seulement les fichiers de la version en cours : dist/ garde les anciennes versions, qu'il ne faut ni vérifier ni annoncer
const { version } = JSON.parse(await readFile(join(root, 'package.json'), 'utf-8'))
const dmg = files.find((f) => f.endsWith('.dmg') && f.includes(`-${version}-`))
const zip = files.find((f) => f.endsWith('-mac.zip') && f.includes(`-${version}-`))

let failed = 0
const check = async (label, cmd, args, expect) => {
  const r = await run(cmd, args)
  const good = r.code === 0 && (!expect || expect.test(r.out))
  if (!good) failed++
  console.log(`  ${good ? '✓' : '✗'} ${label}${good ? '' : `\n      ${r.out.trim().split('\n').slice(-3).join('\n      ')}`}`)
}
await check('signature valide (profonde, stricte)', 'codesign', ['--verify', '--deep', '--strict', '--verbose=2', app])
await check('runtime durci activé', 'codesign', ['-d', '--verbose=2', app], /flags=0x[0-9a-f]*\(runtime\)/)
await check('signée par Developer ID', 'codesign', ['-dv', '--verbose=2', app], /Authority=Developer ID Application/)
await check('ticket de notarisation agrafé à l\'app', 'xcrun', ['stapler', 'validate', app])
await check('Gatekeeper accepte l\'app (source : Notarized Developer ID)', 'spctl', ['--assess', '--type', 'execute', '-vv', app], /accepted[\s\S]*Notarized Developer ID/)
if (dmg) {
  const mount = join(root, 'dist/.verify-mount')
  const a = await run('hdiutil', ['attach', '-nobrowse', '-readonly', '-mountpoint', mount, join(dist, dmg)])
  if (a.code === 0) {
    await check('l\'app contenue dans le DMG est agrafée et acceptée', 'spctl', ['--assess', '--type', 'execute', '-vv', join(mount, 'Trame.app')], /accepted[\s\S]*Notarized Developer ID/)
    await run('hdiutil', ['detach', mount])
  } else {
    failed++
    console.log('  ✗ impossible de monter le DMG pour le vérifier')
  }
}

console.log('\n3/3 Résultat\n')
for (const f of [dmg, zip].filter(Boolean)) {
  const hash = createHash('sha256')
  await new Promise((res) => createReadStream(join(dist, f)).on('data', (d) => hash.update(d)).on('end', res))
  console.log(`  ${f}\n      sha256 ${hash.digest('hex')}`)
}
console.log(failed ? `\n✗ ${failed} vérification(s) en échec : ne pas distribuer ces fichiers.` : '\n✓ Application signée, notarisée et vérifiée : prête à être distribuée.')
process.exit(failed ? 1 : 0)
