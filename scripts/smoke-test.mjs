#!/usr/bin/env node
/**
 * Test de fumée de bout en bout : lance l'application construite (`out/`) avec un dossier de données
 * temporaire, la pilote via le protocole de débogage de Chromium et vérifie le pont preload ↔ processus
 * principal (projets récents, sécurité de l'ouverture par chemin) ainsi que la sortie avec modifications
 * non enregistrées (macOS).
 *
 *     npm run smoke        (construit puis teste)
 *
 * Ne touche ni aux vrais projets récents ni aux préférences de l'utilisateur.
 */
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdtemp, rm, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const electronPath = createRequire(import.meta.url)(join(root, 'node_modules/electron'))
const port = 9300 + Math.floor(Math.random() * 400)
const tmp = await mkdtemp(join(tmpdir(), 'trame-smoke-'))
await mkdir(join(tmp, 'proj'))

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE // sinon Electron démarre comme un simple Node
const app = spawn(electronPath, [root, `--remote-debugging-port=${port}`, `--user-data-dir=${join(tmp, 'data')}`], {
  env,
  stdio: 'ignore'
})
let exited = false
app.on('exit', () => (exited = true))

const failures = []
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` ${detail}`}`)
  if (!ok) failures.push(name)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function connect() {
  for (let i = 0; i < 50; i++) {
    try {
      const page = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page')
      if (page) {
        const ws = new WebSocket(page.webSocketDebuggerUrl)
        await new Promise((resolve, reject) => ((ws.onopen = resolve), (ws.onerror = reject)))
        return ws
      }
    } catch {
      /* pas encore prêt */
    }
    await sleep(200)
  }
  throw new Error("L'application n'a pas démarré (build à jour ? lancer `npm run build`)")
}

try {
  const ws = await connect()
  let id = 0
  const pending = new Map()
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data)
    if (d.id && pending.has(d.id)) pending.get(d.id)(d)
  }
  const run = (expression) =>
    new Promise((resolve) => {
      const i = ++id
      pending.set(i, resolve)
      ws.send(JSON.stringify({ id: i, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }))
    }).then((d) => (d.result.exceptionDetails ? { __error: d.result.exceptionDetails.exception?.description } : d.result.result.value))

  const doc = JSON.stringify({ version: 2, name: 'Test', width: 100, height: 100, pages: [{ id: 'p', background: '#fff', elements: [] }] })
  const a = join(tmp, 'proj', 'a.trame')
  const b = join(tmp, 'proj', 'b.trame')
  const names = async () => (await run('window.trame.listRecents()')).map((r) => r.name)

  // interface montée
  await sleep(500)
  const tabs = await run(`document.querySelector('.sidebar .tabs')?.innerText ?? ''`)
  check("l'interface se monte (onglets de la barre latérale)", tabs.includes('Récents') && tabs.includes('Modèles'), tabs)

  // projets récents
  check('liste des récents vide au premier lancement', (await names()).length === 0)
  check('enregistrer retourne le chemin', (await run(`window.trame.saveProject(${JSON.stringify(doc)}, ${JSON.stringify(a)}, 'Test')`)) === a)
  check('le projet enregistré apparaît dans les récents', (await names()).join() === 'a')
  check('openPath relit un projet de la liste', (await run(`window.trame.openPath(${JSON.stringify(a)}).then(r => r && r.json === ${JSON.stringify(doc)})`)) === true)
  check("openPath refuse un fichier qui n'est pas dans la liste", (await run(`window.trame.openPath('/etc/hosts')`)) === null)
  check('openPath refuse un projet non listé', (await run(`window.trame.openPath(${JSON.stringify(b)})`)) === null)
  await run(`window.trame.saveProject(${JSON.stringify(doc)}, ${JSON.stringify(b)}, 'Test')`)
  check('le plus récent est en tête', (await names()).join() === 'b,a')
  await rm(a)
  const listed = await run('window.trame.listRecents()')
  check('un fichier supprimé est signalé introuvable', listed.find((r) => r.name === 'a')?.modified === null)
  check('openPath sur un fichier supprimé retourne null', (await run(`window.trame.openPath(${JSON.stringify(a)})`)) === null)
  await run(`window.trame.removeRecent(${JSON.stringify(a)})`)
  check('removeRecent retire une entrée', (await names()).join() === 'b')
  await run('window.trame.clearRecents()')
  check('clearRecents vide la liste', (await names()).length === 0)

  // sortie avec modifications non enregistrées (régression : l'appli restait ouverte sans fenêtre)
  if (process.platform === 'darwin') {
    // AppleScript désigne l'application par son bundle, pas par un pid : si une autre instance d'Electron tourne
    // (par ex. `npm run dev`), elle recevrait aussi l'ordre de quitter. On ne lance alors pas ce test.
    const ps = await new Promise((resolve) => {
      let out = ''
      const p = spawn('ps', ['-axo', 'pid=,command='])
      p.stdout.on('data', (d) => (out += d))
      p.on('exit', () => resolve(out))
    })
    const others = ps
      .split('\n')
      .filter((l) => l.includes('/Electron.app/Contents/MacOS/Electron') && !l.includes('Helper'))
      .map((l) => Number(l.trim().split(/\s+/)[0]))
      .filter((pid) => pid && pid !== app.pid)
    if (others.length) {
      console.log(`- sortie avec modifications : ignorée (une autre instance d'Electron tourne : pid ${others.join(', ')})`)
    } else {
      await run('window.trame.setState({ dirty: true })') // le renderer, lui, est propre : il confirme tout de suite la fermeture
      const bundle = resolve(electronPath, '../../..')
      spawn('osascript', ['-e', `tell application ${JSON.stringify(bundle)} to quit`], { stdio: 'ignore' })
      for (let i = 0; i < 40 && !exited; i++) await sleep(250)
      check("⌘Q avec des modifications confirmées quitte vraiment l'application", exited)
    }
  } else {
    console.log('- sortie avec modifications : ignorée (macOS uniquement)')
  }
  ws.close()
} catch (err) {
  check('exécution du test', false, String(err))
} finally {
  if (!exited) app.kill()
  await rm(tmp, { recursive: true, force: true })
}

console.log(failures.length ? `\n${failures.length} échec(s)` : '\nTout est OK')
process.exit(failures.length ? 1 : 0)
