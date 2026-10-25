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
import { mkdtemp, rm, mkdir, readFile, readdir } from 'node:fs/promises'
import { inflateSync } from 'node:zlib'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const electronPath = createRequire(import.meta.url)(join(root, 'node_modules/electron'))
const port = 9300 + Math.floor(Math.random() * 400)
const tmp = await mkdtemp(join(tmpdir(), 'trame-smoke-'))
await mkdir(join(tmp, 'proj'))
await mkdir(join(tmp, 'exports'))

const env = { ...process.env, TRAME_TEST_EXPORT_DIR: join(tmp, 'exports') }
delete env.ELECTRON_RUN_AS_NODE // sinon Electron démarre comme un simple Node
const app = spawn(electronPath, [root, `--remote-debugging-port=${port}`, `--user-data-dir=${join(tmp, 'data')}`], {
  env,
  stdio: 'ignore'
})
let exited = false
app.on('exit', () => (exited = true))

/** Autres instances d'Electron lancées sur la machine (hors celle du test). */
async function otherElectronPids() {
  const ps = await new Promise((resolve) => {
    let out = ''
    const p = spawn('ps', ['-axo', 'pid=,command='])
    p.stdout.on('data', (d) => (out += d))
    p.on('exit', () => resolve(out))
  })
  return ps
    .split('\n')
    .filter((l) => l.includes('/Electron.app/Contents/MacOS/Electron') && !l.includes('Helper'))
    .map((l) => Number(l.trim().split(/\s+/)[0]))
    .filter((pid) => pid && pid !== app.pid)
}
const bundle = resolve(electronPath, '../../..')
const openWithApp = (...args) => new Promise((r) => spawn('open', args, { stdio: 'ignore' }).on('exit', r))

const failures = []
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` ${detail}`}`)
  if (!ok) failures.push(name)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function connect(p = port) {
  for (let i = 0; i < 50; i++) {
    try {
      const page = (await (await fetch(`http://127.0.0.1:${p}/json`)).json()).find((t) => t.type === 'page')
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

async function coldStartTest() {
  // association de fichiers : l'application n'est pas lancée et démarre à cause du fichier (double-clic à froid)
  if (process.platform === 'darwin') {
    const coldPort = port + 500
    const coldFile = join(tmp, 'proj', 'demarrage-a-froid.trame')
    const { writeFile } = await import('node:fs/promises')
    await writeFile(coldFile, JSON.stringify({ version: 2, name: 'Froid', width: 200, height: 100, pages: [{ id: 'p', background: '#fff', elements: [] }] }))
    await openWithApp('-n', '-a', bundle, coldFile, '--args', root, `--remote-debugging-port=${coldPort}`, `--user-data-dir=${join(tmp, 'cold')}`)
    try {
      const ws = await connect(coldPort)
      let title = ''
      for (let i = 0; i < 40 && !title.startsWith('demarrage-a-froid'); i++) {
        await sleep(250)
        title = await new Promise((resolve) => {
          ws.onmessage = (m) => resolve(JSON.parse(m.data).result?.result?.value ?? '')
          ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: 'document.title', returnByValue: true } }))
        })
      }
      check("double-clic dans le Finder (appli fermée) : elle démarre et ouvre le projet", title.startsWith('demarrage-a-froid'), title)
      ws.close()
    } catch (err) {
      check("double-clic dans le Finder (appli fermée)", false, String(err))
    } finally {
      // arrêt de l'instance lancée par `open` (on n'a pas son pid) puis attente de sa disparition
      spawn('pkill', ['-f', `remote-debugging-port=${coldPort}`], { stdio: 'ignore' })
      for (let i = 0; i < 20; i++) {
        await sleep(250)
        const alive = await new Promise((resolve) =>
          spawn('pgrep', ['-f', `remote-debugging-port=${coldPort}`], { stdio: 'ignore' }).on('exit', (code) => resolve(code === 0))
        )
        if (!alive) break
      }
    }
  }
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

  // modèles de l'utilisateur : pont IPC
  const tpls = async () => run('window.trame.listUserTemplates()')
  check("aucun modèle personnel au premier lancement", (await tpls()).length === 0)
  check('un identifiant malveillant ne lit rien', (await run(`window.trame.loadUserTemplate('../../../../etc/hosts')`)) === null)
  check('un identifiant malveillant ne supprime rien (aucune erreur)', (await run(`window.trame.deleteUserTemplate('../../x').then(() => 'ok')`)) === 'ok')

  // modèles de l'utilisateur : parcours dans l'interface (ajout d'un élément puis « Enregistrer comme modèle »)
  const click = (selector, text) =>
    run(`(() => { const el = [...document.querySelectorAll(${JSON.stringify(selector)})].find(b => ${JSON.stringify(text)} === null || b.textContent.trim().includes(${JSON.stringify(text)})); if (!el) return false; el.click(); return true })()`)
  check('bouton « Rectangle » de la barre d’outils', (await click('header.toolbar button', 'Rectangle')) === true)
  check('onglet « Modèles »', (await click('.sidebar .tabs button', 'Modèles')) === true)
  await sleep(200)
  check('« Enregistrer ce design comme modèle » est actif avec un élément', (await click('.sidebar button.wide:not([disabled])', 'Enregistrer ce design')) === true)
  await sleep(200)
  await run(`(() => { const i = document.querySelector('.sidebar .text-field'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, 'Mon modèle de test'); i.dispatchEvent(new Event('input', { bubbles: true })) })()`)
  await sleep(100)
  check('validation du nom', (await click('.sidebar form button[type=submit]', 'Enregistrer')) === true)
  let saved = []
  for (let i = 0; i < 30 && saved.length === 0; i++) {
    await sleep(200)
    saved = await tpls()
  }
  check('le modèle est enregistré avec son nom', saved[0]?.name === 'Mon modèle de test', JSON.stringify(saved.map((t) => t.name)))
  check('miniature JPEG générée par le rendu hors écran', saved[0]?.thumbnail?.startsWith('data:image/jpeg;base64,') && saved[0].thumbnail.length > 1000)
  check('métadonnées : 1 page, 1080 × 1080', saved[0]?.pageCount === 1 && saved[0]?.width === 1080 && saved[0]?.height === 1080)
  check('le modèle apparaît dans la liste de l’interface', (await run(`document.querySelectorAll('.user-template').length`)) === 1)
  // application du modèle : après rechargement le document est propre, donc pas de confirmation native
  await run('location.reload()')
  for (let i = 0; i < 40 && (await run(`document.querySelector('header.toolbar') ? 1 : 0`)) !== 1; i++) await sleep(250)
  await click('.sidebar .tabs button', 'Modèles')
  for (let i = 0; i < 20 && (await run(`document.querySelectorAll('.user-template').length`)) === 0; i++) await sleep(200)
  check('le modèle survit au rechargement (persistance)', (await run(`document.querySelectorAll('.user-template').length`)) === 1)
  await click('.user-template .card-open', null)
  for (let i = 0; i < 20 && !(await run('document.title')).includes('Mon modèle de test'); i++) await sleep(200)
  check('appliquer le modèle crée un document nommé d’après lui', (await run('document.title')).startsWith('Mon modèle de test'), await run('document.title'))
  check('le document appliqué contient le rectangle (miniature de page)', (await run(`document.querySelectorAll('.page-item .thumb div div').length`)) >= 1)
  check('le document appliqué n’est pas marqué modifié', !(await run('document.title')).includes('•'))

  const stored = await run(`window.trame.loadUserTemplate(${JSON.stringify(saved[0]?.id)})`)
  check('le document du modèle contient bien le rectangle', JSON.parse(stored ?? '{}').pages?.[0]?.elements?.[0]?.type === 'rect')
  await run(`window.trame.deleteUserTemplate(${JSON.stringify(saved[0]?.id)})`)
  check('suppression du modèle', (await tpls()).length === 0 && (await run(`window.trame.loadUserTemplate(${JSON.stringify(saved[0]?.id)})`)) === null)

  // export PDF vectoriel : on ajoute du texte dans l'interface, on exporte, puis on inspecte le PDF produit
  check("bouton « Texte » de la barre d'outils", (await click('header.toolbar button', 'Texte')) === true)
  await sleep(300)
  check("bouton « Export PDF »", (await click('header.toolbar button', 'Export PDF')) === true)
  let pdfFile
  for (let i = 0; i < 40 && !pdfFile; i++) {
    await sleep(250)
    pdfFile = (await readdir(join(tmp, 'exports'))).find((f) => f.endsWith('.pdf'))
  }
  check('le PDF est écrit', !!pdfFile)
  if (pdfFile) {
    const pdf = await readFile(join(tmp, 'exports', pdfFile))
    // les objets du PDF sont compressés : on décompresse tous les flux pour y chercher polices et opérateurs de texte
    const streams = []
    for (let at = 0; ; ) {
      const start = pdf.indexOf('stream', at)
      if (start < 0) break
      const from = pdf[start + 6] === 0x0d ? start + 8 : start + 7
      const end = pdf.indexOf('endstream', from)
      try {
        streams.push(inflateSync(pdf.subarray(from, end)).toString('latin1'))
      } catch {
        /* flux non compressé (police, image) */
      }
      at = end + 9
    }
    const all = streams.join('\n')
    check('le texte est du vrai texte PDF (opérateur TJ)', all.includes(' TJ'))
    check('une police Type0 avec ToUnicode (texte sélectionnable) est embarquée', all.includes('/Type0') && all.includes('/ToUnicode'))
    check("le texte n'est pas une image (aucun objet image)", !all.includes('/Subtype /Image') && !pdf.includes('/Subtype /Image'))
    check('métadonnées : créateur « Trame »', all.includes('/Creator <FEFF005400720061006D0065>')) // « Trame » en UTF-16
  }

  // association de fichiers : ouverture depuis le Finder alors que l'application tourne
  const finderFile = join(tmp, 'proj', 'ouvert-par-finder.trame')
  const finderDoc = JSON.stringify({ version: 2, name: 'Ouvert', width: 200, height: 100, pages: [{ id: 'p', background: '#fff', elements: [] }] })
  await run(`window.trame.saveProject(${JSON.stringify(finderDoc)}, ${JSON.stringify(finderFile)}, 'Ouvert')`)
  await run('location.reload()') // état propre : pas de confirmation native
  for (let i = 0; i < 40 && (await run(`document.querySelector('header.toolbar') ? 1 : 0`)) !== 1; i++) await sleep(250)
  if (process.platform === 'darwin' && !(await otherElectronPids()).length) {
    await openWithApp('-a', bundle, finderFile)
    for (let i = 0; i < 30 && !(await run('document.title')).startsWith('ouvert-par-finder'); i++) await sleep(200)
    check('double-clic dans le Finder (appli ouverte) : le projet s\'ouvre', (await run('document.title')).startsWith('ouvert-par-finder'), await run('document.title'))
  } else {
    console.log('- ouverture depuis le Finder (appli ouverte) : ignorée (macOS, aucune autre instance d\'Electron)')
  }

  // sortie avec modifications non enregistrées (régression : l'appli restait ouverte sans fenêtre)
  if (process.platform === 'darwin') {
    // AppleScript désigne l'application par son bundle, pas par un pid : si une autre instance d'Electron tourne
    // (par ex. `npm run dev`), elle recevrait aussi l'ordre de quitter. On ne lance alors pas ce test.
    const others = await otherElectronPids()
    if (others.length) {
      console.log(`- sortie avec modifications : ignorée (une autre instance d'Electron tourne : pid ${others.join(', ')})`)
    } else {
      // le document du renderer est modifié depuis les étapes précédentes : on recharge la page pour repartir d'un
      // état propre (sinon la confirmation native bloquerait), puis on signale seulement au processus principal
      // des modifications non enregistrées : le renderer, lui, confirme tout de suite la fermeture
      await run('location.reload()')
      for (let i = 0; i < 40 && (await run(`document.querySelector('header.toolbar') ? 1 : 0`)) !== 1; i++) await sleep(250)
      await run('window.trame.setState({ dirty: true })')
      spawn('osascript', ['-e', `tell application ${JSON.stringify(bundle)} to quit`], { stdio: 'ignore' })
      for (let i = 0; i < 40 && !exited; i++) await sleep(250)
      check("⌘Q avec des modifications confirmées quitte vraiment l'application", exited)
    }
  } else {
    console.log('- sortie avec modifications : ignorée (macOS uniquement)')
  }
  ws.close()
  await coldStartTest()
} catch (err) {
  check('exécution du test', false, String(err))
} finally {
  if (!exited) app.kill()
  await rm(tmp, { recursive: true, force: true })
}

console.log(failures.length ? `\n${failures.length} échec(s)` : '\nTout est OK')
process.exit(failures.length ? 1 : 0)
