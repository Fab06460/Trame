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
import { readFileSync, readdirSync } from 'node:fs'
import { createServer } from 'node:http'
import { mkdtemp, rm, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { deflateSync, inflateSync } from 'node:zlib'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')

/** Pixel (x, y) d'un PNG 8 bits RGBA/RGB non entrelacé, en [r, g, b]. Suffit pour vérifier ce qu'un export a réellement dessiné. */
function pngPixel(buf, px, py) {
  let w = 0, h = 0, channels = 4
  const idat = []
  for (let at = 8; at < buf.length; ) {
    const len = buf.readUInt32BE(at)
    const type = buf.toString('latin1', at + 4, at + 8)
    const data = buf.subarray(at + 8, at + 8 + len)
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); channels = data[9] === 2 ? 3 : 4 }
    if (type === 'IDAT') idat.push(data)
    at += 12 + len
  }
  const raw = inflateSync(Buffer.concat(idat))
  const stride = w * channels
  const rows = []
  for (let y = 0, o = 0; y < h; y++) {
    const filter = raw[o++]
    const row = Buffer.from(raw.subarray(o, o + stride)); o += stride
    const prev = rows[y - 1] ?? Buffer.alloc(stride)
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? row[i - channels] : 0, b = prev[i], c = i >= channels ? prev[i - channels] : 0
      const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c)
      row[i] = (row[i] + (filter === 1 ? a : filter === 2 ? b : filter === 3 ? ((a + b) >> 1) : filter === 4 ? (pa <= pb && pa <= pc ? a : pb <= pc ? b : c) : 0)) & 255
    }
    rows.push(row)
  }
  const i = px * channels
  return [rows[py][i], rows[py][i + 1], rows[py][i + 2]]
}
/** PNG RGB 8 bits : moitié gauche rouge, moitié droite bleue, un carré vert en haut à gauche (repère de recadrage et de miroir). */
function testPng(w, h) {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
  const chunk = (type, data) => { const t = Buffer.from(type, 'latin1'); const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const c = Buffer.alloc(4); c.writeUInt32BE(crc(Buffer.concat([t, data]))); return Buffer.concat([len, t, data, c]) }
  const raw = Buffer.alloc((w * 3 + 1) * h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = y * (w * 3 + 1) + 1 + x * 3
    const green = x < w / 4 && y < h / 4
    const [r, g, b] = green ? [0, 200, 0] : x < w / 2 ? [220, 30, 30] : [30, 30, 220]
    raw[o] = r; raw[o + 1] = g; raw[o + 2] = b
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}

const electronPath = createRequire(import.meta.url)(join(root, 'node_modules/electron'))
const port = 9300 + Math.floor(Math.random() * 400)
const tmp = await mkdtemp(join(tmpdir(), 'trame-smoke-'))
await mkdir(join(tmp, 'proj'))
await mkdir(join(tmp, 'exports'))

// faux serveur Openverse (le vrai n'est jamais contacté par les tests) : photos, miniatures, erreurs
const photoRequests = []
const photoServer = createServer((req, res) => {
  const url = new URL(req.url, 'http://x')
  photoRequests.push({ path: url.pathname, query: url.searchParams, ua: req.headers['user-agent'] ?? '' })
  const base = `http://127.0.0.1:${photoServer.address().port}`
  const png = (w, h) => { res.writeHead(200, { 'content-type': 'image/png' }); res.end(testPng(w, h)) }
  if (url.pathname === '/v1/images/') {
    const q = url.searchParams.get('q'), page = url.searchParams.get('page')
    if (q === 'lent') return // ne répond jamais : le délai de la recherche expire
    if (q === 'toutpanne') { res.writeHead(500); return res.end('Server Error') }
    if (q === 'limite') { res.writeHead(429); return res.end('{}') }
    if (q === 'planteur' && url.searchParams.has('license_type')) { res.writeHead(500, { 'content-type': 'text/html' }); return res.end('<h1>Server Error (500)</h1>') }
    if (q === 'refus') { res.writeHead(403, { 'content-type': 'application/json' }); return res.end('{"detail":"Accès refusé pour test"}') }
    if (q === 'horsligne') return req.socket.destroy()
    res.writeHead(200, { 'content-type': 'application/json' })
    const results = q === 'vide' ? [] : page === '2'
      ? [{ id: 'c3', title: 'Troisième', creator: 'Cléo', license: 'cc0', license_version: '1.0', url: `${base}/img/a.png`, thumbnail: `${base}/thumb/a.png`, foreign_landing_url: `${base}/p/c3`, width: 800, height: 400 }]
      : [
          { id: 'a1', title: 'Montagne', creator: 'Ada', license: 'by', license_version: '4.0', url: `${base}/img/a.png`, thumbnail: `${base}/thumb/a.png`, foreign_landing_url: `${base}/p/a1`, width: 800, height: 400 },
          { id: 'nc9', title: 'Interdit', creator: 'Zed', license: 'by-nc', license_version: '4.0', url: `${base}/img/a.png`, thumbnail: `${base}/thumb/a.png`, foreign_landing_url: `${base}/p/nc9`, width: 800, height: 400 },
          { id: 'b2', title: 'Lac', creator: 'Bob', license: 'by-sa', license_version: '3.0', url: `${base}/img/absent.png`, thumbnail: `${base}/thumb/a.png`, foreign_landing_url: `${base}/p/b2`, width: 800, height: 400 }
        ]
    return res.end(JSON.stringify({ result_count: 3, page_count: 2, page_size: 2, page: Number(page), results }))
  }
  if (url.pathname === '/w/api.php') {
    const q = (url.searchParams.get('gsrsearch') ?? '').replace(' filetype:bitmap', '')
    if (q === 'limite') { res.writeHead(429); return res.end('{}') }
    if (q === 'refus') { res.writeHead(403, { 'content-type': 'application/json' }); return res.end('{"detail":"Accès refusé pour test"}') }
    if (q === 'horsligne') return req.socket.destroy()
    if (q === 'toutpanne') { res.writeHead(500); return res.end('Server Error') }
    const page = (id, index, title, lic) => ({ pageid: id, title: `File:${title}.png`, index, imageinfo: [{ url: `${base}/img/a.png`, thumburl: `${base}/thumb/a.png`, width: 800, height: 400, mime: 'image/png', descriptionurl: `${base}/wiki/${id}`, extmetadata: { ObjectName: { value: title }, Artist: { value: '<a href="x">Cléo &amp; Co</a>' }, LicenseShortName: { value: lic } } }] })
    res.writeHead(200, { 'content-type': 'application/json' })
    return res.end(JSON.stringify({ query: { pages: { 11: page(11, 2, 'Deuxième', 'CC BY-SA 4.0'), 10: page(10, 1, 'Premier', 'CC0'), 12: page(12, 3, 'Interdit', 'CC BY-NC 4.0') } } }))
  }
  if (url.pathname === '/v1/fonts') {
    const font = (id, family, license, category = 'serif') => ({ id, family, subsets: ['latin'], weights: [400, 700], styles: ['normal'], category, license, defSubset: 'latin' })
    res.writeHead(200, { 'content-type': 'application/json' })
    return res.end(JSON.stringify([font('zeta-test', 'Zeta Test', 'OFL-1.1'), font('pas-libre', 'Pas Libre', 'proprietary'), font('beta-sans', 'Beta Sans', 'OFL-1.1', 'sans-serif')]))
  }
  const fontFile = /^\/fontsource\/fonts\/([a-z-]+)@latest\/latin-(400|700)-normal\.woff2$/.exec(url.pathname)
  if (fontFile) {
    if (fontFile[1] !== 'zeta-test') { res.writeHead(404); return res.end() } // beta-sans : fichier introuvable
    res.writeHead(200, { 'content-type': 'font/woff2' })
    return res.end(readFileSync(join(root, `node_modules/@fontsource/lora/files/lora-latin-${fontFile[2]}-normal.woff2`)))
  }
  if (url.pathname === '/img/a.png') return png(800, 400)
  if (url.pathname === '/thumb/a.png') return png(80, 40)
  res.writeHead(404); res.end()
})
await new Promise((r) => photoServer.listen(0, '127.0.0.1', r))
const env = { ...process.env, TRAME_TEST_EXPORT_DIR: join(tmp, 'exports'), TRAME_OPENVERSE_URL: `http://127.0.0.1:${photoServer.address().port}`, TRAME_COMMONS_URL: `http://127.0.0.1:${photoServer.address().port}`, TRAME_PHOTO_TIMEOUT_MS: '1500', TRAME_FONTS_API_URL: `http://127.0.0.1:${photoServer.address().port}`, TRAME_FONTS_CDN_URL: `http://127.0.0.1:${photoServer.address().port}` }
delete env.ELECTRON_RUN_AS_NODE // sinon Electron démarre comme un simple Node
const app = spawn(electronPath, [root, `--remote-debugging-port=${port}`, `--user-data-dir=${join(tmp, 'data')}`, ...(process.env.SMOKE_VERBOSE ? ['--enable-logging=stderr'] : [])], {
  env,
  stdio: process.env.SMOKE_VERBOSE ? ['ignore', 'inherit', 'inherit'] : 'ignore'
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

  const cdp = (method, params) =>
    new Promise((resolve) => {
      const i = ++id
      pending.set(i, resolve)
      ws.send(JSON.stringify({ id: i, method, params }))
    })
  // La page se comporte comme si sa fenêtre avait le focus du système, même quand une autre application est au premier plan :
  // sans cela, focus() / blur() ne déclenchent aucun événement et les champs ne se valident plus (test dépendant du bureau).
  await cdp('Emulation.setFocusEmulationEnabled', { enabled: true })
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

  // modèles : masquer / restaurer, renommer, rétablir l'original, remplacer après modification (parcours dans l'interface)
  const count = (sel) => run(`document.querySelectorAll(${JSON.stringify(sel)}).length`)
  const clickSel = (sel) => run(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return false; el.click(); return true })()`)
  const typeInto = (sel, value) =>
    run(`(() => { const i = document.querySelector(${JSON.stringify(sel)}); if (!i) return false; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, ${JSON.stringify(value)}); i.dispatchEvent(new Event('input', { bubbles: true })); return true })()`)
  const pressEnter = (sel) => run(`(() => { const i = document.querySelector(${JSON.stringify(sel)}); if (!i) return false; i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); return true })()`)
  const waitFor = async (fn, ms = 6000) => { for (let t = 0; t < ms; t += 200) { if (await fn()) return true; await sleep(200) } return false }
  const builtinIds = () => run(`[...document.querySelectorAll('.builtin-template')].map(c => c.dataset.templateId).join(',')`)

  await click('.sidebar .tabs button', 'Modèles')
  await sleep(300)
  check('6 modèles intégrés affichés au départ', (await count('.builtin-template')) === 6, await builtinIds())

  // masquer un modèle intégré, puis le restaurer
  await clickSel('.builtin-template[data-template-id="quote"] .card-remove')
  check('masquer un modèle intégré le retire de la liste', await waitFor(async () => (await count('.builtin-template')) === 5 && !(await builtinIds()).includes('quote')))
  check('une confirmation est demandée avant de masquer', (await readFile(join(tmp, 'exports', 'dialog-confirm.txt'), 'utf-8').catch(() => '')).includes('Masquer le modèle'))
  check('le modèle masqué est mémorisé côté système', (await run('window.trame.listHiddenTemplates()')).join() === 'quote')
  check('le lien « Restaurer les modèles masqués (1) » apparaît', (await click('.sidebar button.link', 'Restaurer les modèles masqués (1)')) === true)
  check('restaurer remet les 6 modèles', await waitFor(async () => (await count('.builtin-template')) === 6 && (await run('window.trame.listHiddenTemplates()')).length === 0))

  // renommer un modèle intégré : crée la version personnalisée, l'original disparaît de sa catégorie
  await clickSel('.builtin-template[data-template-id="promo"] .card-rename')
  await sleep(200)
  await typeInto('.builtin-template[data-template-id="promo"] .card-rename-input', 'Promo été')
  await pressEnter('.builtin-template[data-template-id="promo"] .card-rename-input')
  check('renommer un modèle intégré crée « votre version » (basedOn) sous le nouveau nom', await waitFor(async () => (await run('window.trame.listUserTemplates()')).some((t) => t.name === 'Promo été' && t.basedOn === 'promo')))
  check("l'original n'est plus affiché dans sa catégorie", await waitFor(async () => !(await builtinIds()).includes('promo') && (await count('.builtin-template')) === 5))
  check('la version personnalisée porte l’étiquette « personnalisé »', (await run(`document.querySelector('.user-template .badge')?.textContent`)) === 'personnalisé')

  // renommer un modèle personnel
  await clickSel('.user-template .card-rename')
  await sleep(200)
  await typeInto('.user-template .card-rename-input', 'Promo d’été 2')
  await pressEnter('.user-template .card-rename-input')
  check('renommer un modèle personnel met à jour son nom', await waitFor(async () => (await run('window.trame.listUserTemplates()'))[0]?.name === 'Promo d’été 2'))

  // rétablir l'original = supprimer la version personnalisée
  await clickSel('.user-template .card-remove')
  check("rétablir l'original : la version personnalisée disparaît et le modèle d'origine revient", await waitFor(async () => (await count('.user-template')) === 0 && (await builtinIds()).includes('promo') && (await count('.builtin-template')) === 6))
  check("la confirmation parle de rétablir l'original", (await readFile(join(tmp, 'exports', 'dialog-confirm.txt'), 'utf-8').catch(() => '')).includes("Rétablir le modèle d'origine"))

  // modifier le contenu : appliquer, retoucher, enregistrer en REMPLAÇANT
  await clickSel('.builtin-template[data-template-id="event"] .card-open')
  check('appliquer un modèle intégré ouvre son document', await waitFor(async () => (await run('document.title')).startsWith('Événement')))
  const elementsOf = async () => JSON.parse((await run(`window.trame.loadUserTemplate(${JSON.stringify((await run('window.trame.listUserTemplates()'))[0]?.id)})`)) ?? '{}').pages?.[0]?.elements?.length
  await click('header.toolbar button', 'Rectangle')
  await sleep(300)
  await clickSel('.sidebar button.wide:not([disabled])')
  await sleep(300)
  check("le formulaire propose de remplacer le modèle d'origine", (await run(`document.querySelector('.choice')?.innerText ?? ''`)).includes('Remplacer « Événement »'))
  check('« Nouveau modèle » est coché par défaut (choix non destructif)', (await run(`document.querySelector('.choice input[type=radio]')?.checked`)) === true)
  await clickSel('.choice label:nth-of-type(2) input')
  await sleep(200)
  check('choisir « Remplacer » préremplit le nom du modèle', (await run(`document.querySelector('.sidebar form .text-field')?.value`)) === 'Événement')
  await click('.sidebar form button[type=submit]', 'Remplacer')
  await waitFor(async () => (await count('.sidebar form')) === 0)
  check("remplacer crée la version personnalisée de l'événement (basedOn) et masque l'original", await waitFor(async () => (await run('window.trame.listUserTemplates()')).some((t) => t.basedOn === 'event') && !(await builtinIds()).includes('event')))
  const firstCount = await elementsOf()
  // seconde retouche : le document vient maintenant du modèle personnalisé, on le REMPLACE (même identifiant, pas de doublon)
  const idBefore = (await run('window.trame.listUserTemplates()'))[0].id
  await click('header.toolbar button', 'Ellipse')
  await sleep(300)
  await clickSel('.sidebar button.wide:not([disabled])')
  await sleep(300)
  await clickSel('.choice label:nth-of-type(2) input')
  await sleep(200)
  await click('.sidebar form button[type=submit]', 'Remplacer')
  // le formulaire ne se ferme qu'une fois l'enregistrement terminé : sans cette attente on vérifierait l'état d'AVANT
  check('le formulaire se ferme après l\'enregistrement', await waitFor(async () => (await count('.sidebar form')) === 0))
  check('remplacer à nouveau garde le même modèle (aucun doublon, même identifiant)', await run('window.trame.listUserTemplates()').then((l) => l.length === 1 && l[0].id === idBefore))
  check('le contenu du modèle remplacé a bien été mis à jour (un élément de plus)', await waitFor(async () => (await elementsOf()) === firstCount + 1), `${firstCount} → ${await elementsOf()}`)
  await run(`window.trame.deleteUserTemplate(${JSON.stringify(idBefore)})`) // nettoyage : l'original revient
  await run('window.trame.unhideAllTemplates()')

  // position et taille numériques (panneau « Propriétés »)
  const field = (name) => run(`Number(document.querySelector('.panel [data-field="${name}"]')?.value)`)
  const setField = async (name, value) => {
    await run(`(() => { const i = document.querySelector('.panel [data-field="${name}"]'); i.focus(); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, ${JSON.stringify(String(value))}); i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })) })()`)
    await sleep(250)
  }
  await click('header.toolbar button', 'Rectangle') // nouvel élément sélectionné, centré : 300 × 200 dans une page de 1080
  await sleep(400)
  check('X, Y, L, H initiaux d\'un rectangle centré', (await field('x')) === 390 && (await field('y')) === 440 && (await field('width')) === 300 && (await field('height')) === 200,
    JSON.stringify([await field('x'), await field('y'), await field('width'), await field('height')]))
  await setField('x', 100)
  check('saisir X déplace l\'élément', (await field('x')) === 100)
  await clickSel('header.toolbar button[title^="Annuler"]')
  await sleep(300)
  check('annuler restaure la position (un seul cran d\'historique par saisie)', (await field('x')) === 390, String(await field('x')))
  await setField('width', 500)
  check('largeur libre : la hauteur ne change pas', (await field('width')) === 500 && (await field('height')) === 200)
  await clickSel('.panel .lock')
  await setField('width', 600)
  check('proportions verrouillées : la hauteur suit (500×200 → 600×240)', (await field('height')) === 240, String(await field('height')))
  await setField('rotation', 90)
  check('après rotation de 90°, X/Y suivent la boîte visible (X = 390 − hauteur)', (await field('x')) === 150 && (await field('y')) === 440, JSON.stringify([await field('x'), await field('y')]))

  // règles, repères et aimantation : parcours à la souris (événements réels envoyés au navigateur)
  await run('location.reload()') // document vierge de 1 080 × 1 080 : géométrie connue
  for (let i = 0; i < 40 && (await run(`document.querySelector('header.toolbar') ? 1 : 0`)) !== 1; i++) await sleep(250)
  await sleep(500)
  await click('header.toolbar button', 'Rectangle') // 300 × 200 en (390, 440)
  await sleep(500)
  const mouse = (type, x, y, modifiers = 0) => cdp('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, modifiers })
  const wrap = await run(`(() => { const r = document.querySelector('.canvas-wrap').getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height } })()`)
  const fit = Math.max(0.01, Math.min((wrap.w - 96) / 1080, (wrap.h - 96) / 1080))
  const sx = (d) => wrap.l + (wrap.w - 1080 * fit) / 2 + d * fit
  const sy = (d) => wrap.t + (wrap.h - 1080 * fit) / 2 + d * fit
  const drag = async (from, to, modifiers = 0, steps = 10) => {
    // Maj enfoncé au moment du clic basculerait la sélection : l'axe se contraint en pressant Maj PENDANT le glisser
    await mouse('mousePressed', from[0], from[1], modifiers & ~8)
    for (let i = 1; i <= steps; i++) await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: from[0] + ((to[0] - from[0]) * i) / steps, y: from[1] + ((to[1] - from[1]) * i) / steps, button: 'left', buttons: 1, modifiers })
    await mouse('mouseReleased', to[0], to[1], modifiers)
    await sleep(250)
  }
  const guidesAttr = () => run(`[...document.querySelectorAll('.guide')].map(g => g.dataset.guide).sort().join(',')`)
  const elementCount = () => run(`document.querySelectorAll('.page-item.current .thumb div div').length`)

  check('les règles sont affichées par défaut', (await count('.ruler.top')) === 1 && (await count('.ruler.left')) === 1)
  await clickSel('.view-options [data-setting="rulers"]')
  await sleep(200)
  check('le bouton « Règles » les masque', (await count('.ruler.top')) === 0)
  check('le réglage est mémorisé', (await run(`JSON.parse(localStorage.getItem('trame.view')).rulers`)) === false)
  await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'R', code: 'KeyR', modifiers: 8 })
  await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'R', code: 'KeyR', modifiers: 8 })
  await sleep(250)
  check('⇧R les réaffiche', (await count('.ruler.top')) === 1)

  // création de repères en glissant depuis les règles
  await drag([wrap.l + 500, wrap.t + 10], [wrap.l + 500, sy(300)]) // règle du haut → repère horizontal à y = 300
  await drag([wrap.l + 10, wrap.t + 400], [sx(200), wrap.t + 400]) // règle de gauche → repère vertical à x = 200
  check('glisser depuis les règles crée un repère horizontal (y = 300) et un vertical (x = 200)', (await guidesAttr()) === 'h:300,v:200', await guidesAttr())
  await clickSel('header.toolbar button[title^="Annuler"]')
  await sleep(300)
  check('annuler retire le dernier repère créé (un seul cran par geste)', (await run(`document.querySelector('.canvas-wrap').dataset.guideCount`)) === '1', await guidesAttr())
  await clickSel('header.toolbar button[title^="Rétablir"]')
  await sleep(300)
  check('rétablir le remet', (await guidesAttr()) === 'h:300,v:200')

  // aimantation au déplacement : le bord gauche (390) s'approche du repère x = 200 à 3 px, le haut (440) du repère y = 300 à 3 px
  const grab = [sx(540), sy(540)]
  await drag(grab, [grab[0] - 187 * fit, grab[1] - 137 * fit], 0, 14)
  check('le bord gauche et le haut s\'accrochent aux repères (X = 200, Y = 300)', (await field('x')) === 200 && (await field('y')) === 300, JSON.stringify([await field('x'), await field('y')]))

  // ⌘ maintenu : aimantation suspendue. Le geste s'éloigne d'abord (pour dépasser le seuil de démarrage d'un glisser), puis revient
  // à 3 px du repère : sans ⌘ il s'accrocherait à 200, avec ⌘ il reste à ≈ 203.
  const here = [sx(200 + 150), sy(300 + 100)]
  await mouse('mousePressed', here[0], here[1], 4)
  await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: here[0] + 60 * fit, y: here[1], button: 'left', buttons: 1, modifiers: 4 })
  await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: here[0] + 3 * fit, y: here[1], button: 'left', buttons: 1, modifiers: 4 })
  await mouse('mouseReleased', here[0] + 3 * fit, here[1], 4)
  await sleep(250)
  const xFree = await field('x')
  check('⌘ suspend l\'aimantation (X reste libre, ni 200 ni éloigné)', xFree > 200.5 && xFree < 205, String(xFree))
  await clickSel('header.toolbar button[title^="Annuler"]')
  await sleep(250)
  check('l\'annulation ramène l\'élément sur le repère (X = 200)', (await field('x')) === 200, String(await field('x')))

  // Maj : déplacement bloqué sur l'axe dominant
  const y0 = await field('y')
  const here2 = [sx((await field('x')) + 150), sy(y0 + 100)]
  await drag(here2, [here2[0] + 120 * fit, here2[1] + 30 * fit], 8, 10)
  check('Maj bloque le déplacement sur l\'axe dominant (Y inchangé, X a bougé)', (await field('y')) === y0 && (await field('x')) > 250, JSON.stringify([await field('x'), await field('y')]))
  await clickSel('header.toolbar button[title^="Annuler"]')
  await sleep(250)

  // Alt + glisser : une copie reste en place
  const before = await elementCount()
  const here3 = [sx((await field('x')) + 150), sy((await field('y')) + 100)]
  await drag(here3, [here3[0] + 200 * fit, here3[1] + 150 * fit], 1, 8)
  check('Alt + glisser laisse une copie derrière (un élément de plus)', (await elementCount()) === before + 1, `${before} → ${await elementCount()}`)
  await clickSel('header.toolbar button[title^="Annuler"]')
  await sleep(300)
  check('un seul annuler défait la copie et le déplacement', (await elementCount()) === before, String(await elementCount()))

  // aimantation du redimensionnement : poignée de droite vers un repère vertical à x = 800
  await drag([wrap.l + 10, wrap.t + 500], [sx(800), wrap.t + 500]) // nouveau repère x = 800
  const [ex, ey, ew, eh] = [await field('x'), await field('y'), await field('width'), await field('height')]
  await drag([sx(ex + ew), sy(ey + eh / 2)], [sx(803), sy(ey + eh / 2)], 0, 12) // bord droit amené à 803, à 3 px du repère
  check('le bord droit s\'accroche au repère lors du redimensionnement (X + L = 800)', Math.abs((await field('x')) + (await field('width')) - 800) < 0.6, JSON.stringify([await field('x'), await field('width')]))

  // suppression d'un repère : le glisser sur la règle
  const nBefore = (await guidesAttr()).split(',').length
  const gx = sx(800)
  await drag([gx, wrap.t + 600], [wrap.l + 8, wrap.t + 600], 0, 10) // un repère vertical se supprime en le ramenant sur la règle de GAUCHE
  check('glisser un repère sur la règle le supprime', (await guidesAttr()).split(',').length === nBefore - 1, await guidesAttr())
  // double-clic : suppression directe
  await run(`(() => { const g = document.querySelector('.guide'); g.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })) })()`)
  await sleep(250)
  check('double-clic sur un repère le supprime', (await run(`document.querySelector('.canvas-wrap').dataset.guideCount`)) === String(nBefore - 2), await guidesAttr())

  // panneau Calques : liste, verrouillage, masquage (jamais exporté), renommage, réordonnancement
  await run('location.reload()')
  for (let i = 0; i < 40 && (await run(`document.querySelector('header.toolbar') ? 1 : 0`)) !== 1; i++) await sleep(250)
  await sleep(500)
  await click('header.toolbar button', 'Rectangle') // 300 × 200 en (390, 440), violet #7c5cff
  await sleep(250)
  await click('header.toolbar button', 'Ellipse')
  await sleep(250)
  await click('header.toolbar button', 'Texte')
  await sleep(300)
  await click('.sidebar .tabs button', 'Calques')
  await sleep(300)
  const layerNames = () => run(`[...document.querySelectorAll('.layer .layer-name')].map(n => n.textContent.replace(/\s*(groupe|⚠)\s*$/, '').trim()).join('|')`)
  check('3 calques, du premier plan à l\'arrière-plan', (await layerNames()) === 'Votre texte|Ellipse|Rectangle', await layerNames())
  const rowOf = (name) => `.layer:nth-child(${['Votre texte', 'Ellipse', 'Rectangle'].indexOf(name) + 1})`

  // sélectionner depuis le panneau
  await clickSel(`${rowOf('Rectangle')} .layer-glyph`)
  await sleep(300)
  check('cliquer un calque le sélectionne (le panneau de position s\'affiche)', (await field('width')) === 300 && (await field('height')) === 200)

  // verrouiller : le champ X est désactivé, le glisser ne déplace plus, Suppr ne supprime plus
  await clickSel(`${rowOf('Rectangle')} .layer-flag.lock`)
  await sleep(300)
  check('un calque verrouillé désactive les champs de position', (await run(`document.querySelector('.panel [data-field="x"]')?.disabled`)) === true)
  const lw = await run(`(() => { const r = document.querySelector('.canvas-wrap').getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height } })()`)
  const lfit = Math.max(0.01, Math.min((lw.w - 96) / 1080, (lw.h - 96) / 1080))
  const lsx = (d) => lw.l + (lw.w - 1080 * lfit) / 2 + d * lfit
  const lsy = (d) => lw.t + (lw.h - 1080 * lfit) / 2 + d * lfit
  const x0 = await field('x')
  await mouse('mousePressed', lsx(430), lsy(600))
  for (let i = 1; i <= 8; i++) await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: lsx(430) + 20 * i, y: lsy(600) + 10 * i, button: 'left', buttons: 1 })
  await mouse('mouseReleased', lsx(430) + 160, lsy(600) + 80)
  await sleep(300)
  check('glisser un élément verrouillé ne le déplace pas', (await field('x')) === x0, `${x0} → ${await field('x')}`)
  await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Delete', code: 'Delete', windowsVirtualKeyCode: 46 })
  await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Delete', code: 'Delete', windowsVirtualKeyCode: 46 })
  await sleep(300)
  check('Suppr ne supprime pas un élément verrouillé', (await count('.layer')) === 3)
  // ⌘L bascule le verrouillage de la sélection
  await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'l', code: 'KeyL', modifiers: 4 })
  await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'l', code: 'KeyL', modifiers: 4 })
  await sleep(300)
  check('⌘L déverrouille', (await run(`document.querySelector('${rowOf('Rectangle')} .layer-flag.lock')?.getAttribute('aria-pressed')`)) === 'false')

  // masquer : disparaît des miniatures, et n'est exporté ni en PNG ni en PDF
  const exportsDir = join(tmp, 'exports')
  const nThumb = () => run(`document.querySelectorAll('.page-item.current .thumb div div').length`)
  const exportPng = async () => {
    // un document de plusieurs pages exporte « <nom>-page<n>.png »
    const names = ['Sans titre.png', 'Sans titre-page1.png']
    for (const n of names) await rm(join(exportsDir, n), { force: true })
    await click('header.toolbar button', 'Export PNG')
    let found
    for (let i = 0; i < 40 && !found; i++) { await sleep(250); found = names.find((n) => readdirSync(exportsDir).includes(n)) }
    await sleep(200)
    return readFile(join(exportsDir, found ?? names[0]))
  }
  let lastPdfRaw = ''
  const exportPdfText = async () => {
    await rm(join(exportsDir, 'Sans titre.pdf'), { force: true })
    await click('header.toolbar button', 'Export PDF')
    for (let i = 0; i < 40; i++) { await sleep(250); if ((await readdir(exportsDir)).includes('Sans titre.pdf')) break }
    await sleep(200)
    const pdf = await readFile(join(exportsDir, 'Sans titre.pdf'))
    lastPdfRaw = pdf.toString('latin1') // objets non compressés (dictionnaires d'images…)
    let all = ''
    for (let at = 0; ; ) { const a = pdf.indexOf('stream', at); if (a < 0) break; const from = pdf[a + 6] === 0x0d ? a + 8 : a + 7; const e = pdf.indexOf('endstream', from); try { all += inflateSync(pdf.subarray(from, e)).toString('latin1') + '\n' } catch {} ; at = e + 9 }
    return all
  }
  const purple = ([r, g, b]) => r > 100 && r < 150 && g > 70 && g < 110 && b > 230 // #7c5cff
  const VIOLET_OP = `${124 / 255} ${92 / 255} 1 rg` // #7c5cff, écrit comme pdf-lib écrit les nombres
  const visiblePx = pngPixel(await exportPng(), 400, 620) // point couvert par le rectangle seul (390–690 × 440–640) : ni l'ellipse (420–660) ni le texte (y 500–580)
  check('calque visible : exporté en PNG (pixel violet)', purple(visiblePx), JSON.stringify(visiblePx))
  check('calque visible : exporté en PDF', (await exportPdfText()).includes(VIOLET_OP))
  const thumbsBefore = await nThumb()
  await clickSel(`${rowOf('Rectangle')} .layer-flag.eye`)
  await sleep(300)
  check('masquer un calque le retire de l\'aperçu de la page', (await nThumb()) === thumbsBefore - 1, `${thumbsBefore} → ${await nThumb()}`)
  const hiddenPx = pngPixel(await exportPng(), 400, 620)
  check('calque masqué : absent du PNG exporté (pixel blanc)', hiddenPx.every((v) => v > 240), JSON.stringify(hiddenPx))
  check('calque masqué : absent du PDF exporté', !(await exportPdfText()).includes(VIOLET_OP))
  await clickSel(`${rowOf('Rectangle')} .layer-flag.eye`)
  await sleep(300)
  check('afficher à nouveau le calque le remet dans l\'export', purple(pngPixel(await exportPng(), 400, 620)))

  // renommer (double-clic)
  await run(`document.querySelector('${rowOf('Ellipse')} .layer-name').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`)
  await sleep(200)
  await typeInto('.layer-rename', 'Soleil')
  await run(`(() => { const i = document.querySelector('.layer-rename'); i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })) })()`)
  await sleep(300)
  check('double-clic renomme un calque', (await layerNames()) === 'Votre texte|Soleil|Rectangle', await layerNames())

  // réordonner par glisser-déposer : « Rectangle » (en bas) lâché sur la ligne du haut → passe devant
  // les événements sont envoyés l'un après l'autre (comme un vrai glisser) : React enregistre le départ avant le dépôt
  const dnd = (type, row) => run(`(() => { const rows = document.querySelectorAll('.layer'); window.__dt ??= new DataTransfer(); rows[${row}].dispatchEvent(new DragEvent(${JSON.stringify(type)}, { bubbles: true, cancelable: true, dataTransfer: window.__dt })) })()`)
  await dnd('dragstart', 2); await sleep(150)
  await dnd('dragover', 0); await sleep(150)
  await dnd('drop', 0); await sleep(150)
  await dnd('dragend', 2)
  await sleep(300)
  check('glisser-déposer réordonne les calques (Rectangle passe devant)', (await layerNames()) === 'Rectangle|Votre texte|Soleil', await layerNames())
  await clickSel('header.toolbar button[title^="Annuler"]')
  await sleep(300)
  check('annuler remet l\'ordre précédent', (await layerNames()) === 'Votre texte|Soleil|Rectangle', await layerNames())
  await click('.sidebar .tabs button', 'Modèles')

  // typographie : interlettrage, interligne, souligné, barré, majuscules (panneau « Propriétés » → PDF)
  await run('location.reload()')
  for (let i = 0; i < 40 && (await run(`document.querySelector('header.toolbar') ? 1 : 0`)) !== 1; i++) await sleep(250)
  await sleep(500)
  await click('header.toolbar button', 'Texte') // « Votre texte », Inter gras 64
  await sleep(400)
  check('la taille de police est un champ numérique validé à la sortie (64)', (await field('fontSize')) === 64)
  await setField('fontSize', 80)
  check('taille modifiée', (await field('fontSize')) === 80)
  await clickSel('header.toolbar button[title^="Annuler"]')
  await sleep(300)
  check('un seul annuler rétablit la taille (un cran par saisie, pas un par chiffre)', (await field('fontSize')) === 64, String(await field('fontSize')))
  await setField('letterSpacing', 20)
  await setField('lineHeight', 1.25)
  check('interlettrage et interligne saisis', (await field('letterSpacing')) === 20 && (await field('lineHeight')) === 1.25)
  // régression : un interligne à 2 décimales ne doit pas être « arrondi » par un simple passage dans le champ
  await run(`(() => { const i = document.querySelector('.panel [data-field="lineHeight"]'); i.focus(); i.blur() })()`)
  await sleep(250)
  check('1,25 reste 1,25 après un simple passage dans le champ (pas d\'arrondi silencieux)', (await field('lineHeight')) === 1.25, String(await field('lineHeight')))
  for (const flag of ['underline', 'strike', 'uppercase']) await clickSel(`.panel [data-flag="${flag}"]`)
  await sleep(300)
  check('souligné, barré et majuscules sont activés', (await run(`['underline', 'strike', 'uppercase'].map(f => document.querySelector('.panel [data-flag="' + f + '"]').getAttribute('aria-pressed')).join()`)) === 'true,true,true')
  check('l\'aperçu de la page applique les majuscules', (await run(`getComputedStyle(document.querySelector('.page-item.current .thumb div div')).textTransform`)) === 'uppercase')
  const typoPdf = await exportPdfText()
  check('PDF : l\'interlettrage est un vrai espacement de caractères (20 Tc)', /\b20 Tc\b/.test(typoPdf))
  const typoLines = (typoPdf.match(/\] TJ/g) ?? []).length // une opération TJ par ligne de texte
  const typoStrokes = (typoPdf.match(/\nh\nf\n/g) ?? []).length // pdf-lib écrit un rectangle « m l l l h f »
  check('PDF : un souligné et un barré par ligne de texte (+ le fond de page)', typoLines >= 1 && typoStrokes === 1 + 2 * typoLines, `${typoLines} ligne(s), ${typoStrokes} rectangles`)
  check('PDF : le texte reste du vrai texte', typoPdf.includes(' TJ'))
  await clickSel('.panel [data-flag="uppercase"]')
  await sleep(250)
  check('retirer une option la désactive', (await run(`document.querySelector('.panel [data-flag="uppercase"]').getAttribute('aria-pressed')`)) === 'false')

  // contour : épaisseur, couleur, tirets (panneau « Propriétés » → aperçu → PDF)
  await run('location.reload()')
  for (let i = 0; i < 40 && (await run(`document.querySelector('header.toolbar') ? 1 : 0`)) !== 1; i++) await sleep(250)
  await sleep(500)
  await click('header.toolbar button', 'Rectangle')
  await sleep(400)
  const dashedBtn = () => run(`(() => { const b = document.querySelector('.panel [data-flag="strokeDashed"]'); return { disabled: b.disabled, pressed: b.getAttribute('aria-pressed') } })()`)
  check('par défaut : pas de contour, bouton « tirets » désactivé', (await field('strokeWidth')) === 0 && (await dashedBtn()).disabled === true)
  await setField('strokeWidth', 6)
  check('une épaisseur crée le contour (couleur par défaut) et active « tirets »', (await field('strokeWidth')) === 6 && (await dashedBtn()).disabled === false)
  await clickSel('.panel [data-flag="strokeDashed"]')
  await run(`(() => { const i = document.querySelector('.panel input[data-field="stroke"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, '#ff0000'); i.dispatchEvent(new Event('input', { bubbles: true })) })()`)
  await sleep(350)
  check('tirets activés', (await dashedBtn()).pressed === 'true')
  const thumbStyle = await run(`(() => { const d = document.querySelector('.page-item.current .thumb div div'); const s = getComputedStyle(d); return { style: s.outlineStyle, width: s.outlineWidth, color: s.outlineColor } })()`)
  check('l\'aperçu de la page dessine le contour (6 px, tirets, rouge)', thumbStyle.style === 'dashed' && thumbStyle.width === '6px' && thumbStyle.color === 'rgb(255, 0, 0)', JSON.stringify(thumbStyle))
  const strokePdf = await exportPdfText()
  check('PDF : trait de 6 px × 0,75 = 4,5 pt, rouge, en tirets proportionnels (18, 12)', /\b6 w\b/.test(strokePdf) && /\b1 0 0 RG\b/.test(strokePdf) && /\[18 12\] 0 d/.test(strokePdf), 'w:' + /\b6 w\b/.test(strokePdf) + ' RG:' + /\b1 0 0 RG\b/.test(strokePdf) + ' d:' + /\[18 12\] 0 d/.test(strokePdf))
  await setField('strokeWidth', 0)
  check('épaisseur 0 : le contour disparaît et « tirets » se désactive', (await field('strokeWidth')) === 0 && (await dashedBtn()).disabled === true && (await dashedBtn()).pressed === 'false')
  check('PDF : plus de trait une fois le contour retiré', !/\b6 w\b/.test(await exportPdfText()))
  await clickSel('header.toolbar button[title^="Annuler"]')
  await sleep(300)
  check('annuler rétablit le contour (6 px)', (await field('strokeWidth')) === 6, String(await field('strokeWidth')))
  // contour + opacité < 1 : le PDF repasse par une image (compositon d'un bloc, comme à l'écran) au lieu d'un mélange des demi-traits
  await clickSel('header.toolbar button[title^="Annuler"]')
  await sleep(150)

  // dégradé : activation, type, angle, inversion (panneau → aperçu → PDF)
  await run('location.reload()')
  for (let i = 0; i < 40 && (await run(`document.querySelector('header.toolbar') ? 1 : 0`)) !== 1; i++) await sleep(250)
  await sleep(500)
  await click('header.toolbar button', 'Rectangle') // violet uni #7c5cff
  await sleep(400)
  const thumbBg = () => run(`document.querySelector('.page-item.current .thumb div div').style.background`)
  const fillMode = () => run(`document.querySelector('.panel [data-fill="gradient"]').getAttribute('aria-pressed')`)
  check('par défaut : remplissage uni', (await fillMode()) === 'false' && (await count('.panel [data-field="gradAngle"]')) === 0)
  await clickSel('.panel [data-fill="gradient"]')
  await sleep(350)
  check('« Dégradé » active un dégradé linéaire à 135° de la couleur actuelle', (await fillMode()) === 'true' && (await field('gradAngle')) === 135 && (await run(`document.querySelector('.panel [data-field="gradFrom"]').value`)) === '#7c5cff')
  check('l\'aperçu de la page affiche le dégradé (CSS linear-gradient 135deg)', /linear-gradient\(135deg/.test(await thumbBg()), await thumbBg())
  await setField('gradAngle', 90)
  check('angle 90° dans l\'aperçu', /linear-gradient\(90deg/.test(await thumbBg()), await thumbBg())
  await run(`(() => { const sel = document.querySelector('.panel [data-field="gradType"]'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(sel, 'radial'); sel.dispatchEvent(new Event('change', { bubbles: true })) })()`)
  await sleep(350)
  check('type radial : l\'angle disparait et l\'aperçu devient radial', (await count('.panel [data-field="gradAngle"]')) === 0 && /radial-gradient/.test(await thumbBg()), await thumbBg())
  const radialPdf = await exportPdfText()
  check('PDF : un dégradé radial natif (ShadingType 3) peint par l\'opérateur sh', /\/ShadingType 3/.test(radialPdf) && /\/Sh1 sh/.test(radialPdf), 'type3:' + /\/ShadingType 3/.test(radialPdf) + ' sh:' + /\/Sh1 sh/.test(radialPdf))
  await run(`(() => { const sel = document.querySelector('.panel [data-field="gradType"]'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(sel, 'linear'); sel.dispatchEvent(new Event('change', { bubbles: true })) })()`)
  await sleep(300)
  await clickSel('.panel [data-flag="gradSwap"]')
  await sleep(300)
  check('« ⇄ » inverse les deux couleurs', (await run(`document.querySelector('.panel [data-field="gradTo"]').value`)) === '#7c5cff')
  const linearPdf = await exportPdfText()
  check('PDF : un dégradé linéaire natif (ShadingType 2), détouré par la forme (W n)', /\/ShadingType 2/.test(linearPdf) && /\nW\nn\n/.test(linearPdf))
  await clickSel('.panel [data-fill="solid"]')
  await sleep(350)
  check('retour à « Uni » : la couleur redevient celle de départ du dégradé et le PDF n\'a plus de dégradé', (await fillMode()) === 'false' && !/\/ShadingType/.test(await exportPdfText()))
  await clickSel('header.toolbar button[title^="Annuler"]')
  await sleep(300)
  check('annuler rétablit le dégradé', (await fillMode()) === 'true')

  // ombre et lueur : panneau → aperçu → PDF (ombre = image sous un élément resté vectoriel)
  await run('location.reload()')
  for (let i = 0; i < 40 && (await run(`document.querySelector('header.toolbar') ? 1 : 0`)) !== 1; i++) await sleep(250)
  await sleep(500)
  await click('header.toolbar button', 'Rectangle')
  await sleep(400)
  const shadowMode = () => run(`['none', 'drop', 'glow'].find(m => document.querySelector('.panel [data-shadow="' + m + '"]').getAttribute('aria-pressed') === 'true')`)
  check('par défaut : aucune ombre, pas de champs d\'ombre', (await shadowMode()) === 'none' && (await count('.panel [data-field="shadowBlur"]')) === 0)
  const noShadowPdf = await exportPdfText()
  check('PDF sans ombre : aucune image', !lastPdfRaw.includes('/Subtype /Image'))
  await clickSel('.panel [data-shadow="drop"]')
  await sleep(350)
  check('« Ombre » : flou 20, décalage (0, 10), intensité 35 %', (await shadowMode()) === 'drop' && (await field('shadowBlur')) === 20 && (await field('shadowX')) === 0 && (await field('shadowY')) === 10 && (await field('shadowOpacity')) === 35)
  check('l\'aperçu de la page applique l\'ombre (drop-shadow)', /drop-shadow\(/.test(await run(`document.querySelector('.page-item.current .thumb div div').style.filter`)))
  const shadowPdf = await exportPdfText()
  check('PDF avec ombre : une image (l\'ombre) ET le rectangle toujours vectoriel', lastPdfRaw.includes('/Subtype /Image') && (shadowPdf.match(/\nh\nf\n/g) ?? []).length >= 2)
  await setField('shadowBlur', 40)
  await setField('shadowX', 25)
  check('flou et décalage modifiables', (await field('shadowBlur')) === 40 && (await field('shadowX')) === 25 && (await shadowMode()) === 'drop')
  await clickSel('.panel [data-shadow="glow"]')
  await sleep(350)
  check('« Lueur » : sans décalage, flou 30, intensité 90 %', (await shadowMode()) === 'glow' && (await field('shadowX')) === 0 && (await field('shadowY')) === 0 && (await field('shadowBlur')) === 30 && (await field('shadowOpacity')) === 90)
  await clickSel('.panel [data-shadow="none"]')
  await sleep(350)
  check('« Aucune » retire l\'ombre', (await shadowMode()) === 'none' && (await count('.panel [data-field="shadowBlur"]')) === 0)
  await exportPdfText()
  check('PDF : plus d\'image une fois l\'ombre retirée', !lastPdfRaw.includes('/Subtype /Image'))
  await clickSel('header.toolbar button[title^="Annuler"]')
  await sleep(300)
  check('annuler rétablit l\'ombre', (await shadowMode()) === 'glow')
  // texte avec ombre : l'ombre est une image, le texte reste du vrai texte
  await click('header.toolbar button', 'Texte')
  await sleep(400)
  await clickSel('.panel [data-shadow="drop"]')
  await sleep(350)
  const textShadowPdf = await exportPdfText()
  check('texte avec ombre : l\'ombre est une image et le texte reste du vrai texte (TJ)', lastPdfRaw.includes('/Subtype /Image') && textShadowPdf.includes(' TJ'))

  // forme vectorielle (dessin natif) : son ombre doit figurer dans l'export image (aucun autre contrôle ne la voit : la fidélité compare Konva à Konva)
  await run('location.reload()')
  for (let i = 0; i < 40 && (await run(`document.querySelector('header.toolbar') ? 1 : 0`)) !== 1; i++) await sleep(250)
  await sleep(500)
  await click('.sidebar .tabs button', 'Éléments')
  await sleep(300)
  await clickSel('.sidebar .shape[title="Étoile"]') // 240 × 240 en (420, 420)
  await sleep(400)
  await clickSel('.panel [data-shadow="drop"]')
  await sleep(300)
  await setField('shadowBlur', 0) // ombre dure : aucune ambiguïté de pixel
  await setField('shadowY', 30)
  await setField('shadowOpacity', 100)
  const shadowPx = pngPixel(await exportPng(), 450, 545) // sous le bras gauche (bord bas du bras vers y = 527) : seule l'ombre décalée de 30 px couvre ce point
  check('l\'ombre d\'une forme figure dans l\'export image (pixel sombre sous l\'étoile)', shadowPx.every((v) => v < 60), JSON.stringify(shadowPx))
  // fond + contour + ombre : Konva dessine dans un tampon puis applique l'ombre à la copie. L'ombre doit rester UNE seule fois :
  // 50 % de noir sur du blanc donne ≈ 127 ; une ombre appliquée deux fois donnerait ≈ 64
  await setField('strokeWidth', 6)
  await setField('shadowOpacity', 50)
  const onceShadow = pngPixel(await exportPng(), 450, 545)
  check('forme avec fond, contour et ombre : l\'ombre n\'est pas doublée (≈ 127)', onceShadow.every((v) => v > 105 && v < 150), JSON.stringify(onceShadow))
  await clickSel('.panel [data-shadow="none"]')
  await sleep(300)
  check('sans ombre, le même pixel est blanc', pngPixel(await exportPng(), 450, 545).every((v) => v > 240))
  await click('.sidebar .tabs button', 'Modèles')

  // images : recadrage, miroir et filtres (panneau → export image → export PDF)
  await run('location.reload()')
  for (let i = 0; i < 40 && (await run(`document.querySelector('header.toolbar') ? 1 : 0`)) !== 1; i++) await sleep(250)
  await sleep(500)
  await writeFile(join(tmp, 'exports', 'pick-image.png'), testPng(800, 400)) // 800 × 400 → réduit à 648 × 324 au centre de la page (216–864 × 378–702)
  await click('header.toolbar button', 'Image')
  await sleep(700)
  const L = [300, 560], R = [780, 560], CORNER = [240, 400] // gauche (rouge), droite (bleu), coin haut-gauche (carré vert)
  const isRed = (p) => p[0] > 180 && p[1] < 80 && p[2] < 80
  const isBlue = (p) => p[2] > 180 && p[0] < 80 && p[1] < 80
  const isRed2 = (p) => p[0] > 220 && p[1] < 40 && p[2] < 40
  const isGreen = (p) => p[1] > 150 && p[0] < 60 && p[2] < 60
  let png = await exportPng()
  check('image insérée : gauche rouge, droite bleue, coin vert', isRed(pngPixel(png, ...L)) && isBlue(pngPixel(png, ...R)) && isGreen(pngPixel(png, ...CORNER)))
  check('aucun retouche : pas de champ de recadrage rempli', (await field('cropLeft')) === 0 && (await field('cropRight')) === 0)
  await exportPdfText()
  check('PDF sans retouche : l\'image d\'origine (PNG) est embarquée telle quelle', lastPdfRaw.includes('/Subtype /Image'))

  // miroir horizontal
  await clickSel('.panel [data-flip="x"]')
  await sleep(500)
  png = await exportPng()
  check('miroir horizontal : gauche bleue, droite rouge, carré vert en haut à droite', isBlue(pngPixel(png, ...L)) && isRed(pngPixel(png, ...R)) && isGreen(pngPixel(png, 840, 400)) && !isGreen(pngPixel(png, ...CORNER)))
  check('le bouton miroir est enfoncé', (await run(`document.querySelector('.panel [data-flip="x"]').getAttribute('aria-pressed')`)) === 'true')
  await clickSel('.panel [data-flip="x"]')
  await sleep(400)
  await clickSel('.panel [data-flip="y"]')
  await sleep(500)
  png = await exportPng()
  check('miroir vertical : le carré vert passe en bas à gauche', isGreen(pngPixel(png, 240, 680)) && !isGreen(pngPixel(png, ...CORNER)))
  await clickSel('.panel [data-flip="y"]')
  await sleep(400)

  // recadrage : on retire 50 % à gauche → seule la moitié bleue reste, au même endroit
  await setField('cropLeft', 50)
  await sleep(500)
  png = await exportPng()
  check('recadrage de 50 % à gauche : la moitié bleue reste en place, la rouge a disparu', isBlue(pngPixel(png, ...R)) && !isRed(pngPixel(png, ...L)) && pngPixel(png, ...L).every((v) => v > 240))
  check('la boîte a été réduite, pas étirée (largeur 324)', (await field('width')) === 324, String(await field('width')))
  await exportPdfText()
  check('PDF recadré : une image retravaillée est embarquée', lastPdfRaw.includes('/Subtype /Image'))
  await clickSel('.panel [data-action="crop-reset"]')
  await sleep(500)
  png = await exportPng()
  check('« Rétablir l\'image entière » rend la moitié rouge', isRed(pngPixel(png, ...L)) && isBlue(pngPixel(png, ...R)) && (await field('cropLeft')) === 0)

  // filtres : noir et blanc → rouge et bleu deviennent des gris (R = V = B)
  await clickSel('.panel [data-preset="Noir & blanc"]')
  await sleep(500)
  png = await exportPng()
  const gl = pngPixel(png, ...L), gr = pngPixel(png, ...R)
  check('filtre noir et blanc : les deux moitiés sont grises (R = V = B)', Math.abs(gl[0] - gl[1]) < 6 && Math.abs(gl[1] - gl[2]) < 6 && Math.abs(gr[0] - gr[1]) < 6 && Math.abs(gr[1] - gr[2]) < 6, JSON.stringify([gl, gr]))
  check('l\'aperçu de la page affiche aussi l\'image retouchée (canvas)', (await run(`document.querySelectorAll('.page-item.current .thumb canvas').length`)) === 1)
  await exportPdfText()
  check('PDF filtré : image embarquée', lastPdfRaw.includes('/Subtype /Image'))
  await clickSel('.panel [data-action="filters-reset"]')
  await sleep(500)
  png = await exportPng()
  check('« Réinitialiser les réglages » rend les couleurs', isRed(pngPixel(png, ...L)) && isBlue(pngPixel(png, ...R)))
  await clickSel('header.toolbar button[title^="Annuler"]')
  await sleep(400)
  png = await exportPng()
  const undone = pngPixel(png, ...L)
  check('annuler rétablit le filtre', Math.abs(undone[0] - undone[2]) < 6)

  // nom du document : champ de la barre d'outils → nom des exports (caractères interdits remplacés) ; annuler le rétablit
  check('le nom par défaut est « Sans titre »', (await run(`document.querySelector('.doc-name').value`)) === 'Sans titre')
  await run(`document.querySelector('.doc-name').focus(); document.querySelector('.doc-name').select()`)
  await cdp('Input.insertText', { text: 'Affiche / été' })
  await run(`document.querySelector('.doc-name').blur()`)
  await sleep(400)
  check('le titre de la fenêtre reprend le nom', (await run('document.title')).startsWith('Affiche / été'))
  await click('header.toolbar button', 'Export PNG')
  let named = false
  for (let i = 0; i < 40 && !named; i++) { await sleep(250); named = (await readdir(exportsDir)).includes('Affiche - été.png') }
  check('l\'export PNG porte le nom du document (« / » remplacé par « - »)', named, (await readdir(exportsDir)).join(', '))
  await run(`document.querySelector('.doc-name').focus(); document.querySelector('.doc-name').select()`)
  await cdp('Input.insertText', { text: '   ' })
  await run(`document.querySelector('.doc-name').blur()`)
  await sleep(300)
  check('un nom vide redevient « Sans titre »', (await run(`document.querySelector('.doc-name').value`)) === 'Sans titre')
  await clickSel('header.toolbar button[title^="Annuler"]')
  await sleep(300)
  check('annuler rétablit le nom précédent', (await run(`document.querySelector('.doc-name').value`)) === 'Affiche / été')

  const nBrand = (sel) => run(`document.querySelectorAll('${sel}').length`)
  // import d'un PDF : texte reconstruit en éléments modifiables, puis mode « page en image »
  {
    const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
    const src = await PDFDocument.create()
    const helvB = await src.embedFont(StandardFonts.HelveticaBold)
    const times = await src.embedFont(StandardFonts.TimesRoman)
    const p1 = src.addPage([595, 842])
    p1.drawRectangle({ x: 0, y: 742, width: 595, height: 100, color: rgb(1, 0.85, 0.2) })
    p1.drawText('Bonjour Trame', { x: 50, y: 780, size: 36, font: helvB, color: rgb(0.1, 0.1, 0.1) })
    for (const [i, l] of ['Premiere ligne du paragraphe de test', 'Deuxieme ligne du meme paragraphe', 'Troisieme et derniere ligne'].entries()) p1.drawText(l, { x: 50, y: 650 - i * 18, size: 14, font: times, color: rgb(0.8, 0, 0) })
    const p2 = src.addPage([595, 842])
    p2.drawText('Page deux', { x: 50, y: 700, size: 30, font: helvB })
    await writeFile(join(tmp, 'exports', 'pick-import.pdf'), await src.save())
  }
  await run('location.reload()')
  for (let i = 0; i < 40 && (await run(`document.querySelector('header.toolbar') ? 1 : 0`)) !== 1; i++) await sleep(250)
  await sleep(500)
  await click('header.toolbar button', 'Importer PDF')
  for (let i = 0; i < 40 && (await nBrand('.modal')) === 0; i++) await sleep(250)
  check('la fenêtre d\'import s\'ouvre avec les deux modes (texte modifiable par défaut)', (await nBrand('.modal')) === 1 && (await run(`document.querySelector('[data-pdf-mode="editable"]').checked`)) === true && (await nBrand('[data-pdf-mode="image"]')) === 1)
  await rm(join(tmp, 'exports', 'dialog-info.txt'), { force: true })
  await clickSel('[data-action="pdf-import"]')
  let importInfo = ''
  for (let i = 0; i < 120 && !importInfo; i++) { await sleep(250); importInfo = await readFile(join(tmp, 'exports', 'dialog-info.txt'), 'utf-8').catch(() => '') }
  check('un résumé annonce 2 pages et des blocs de texte modifiables', importInfo.includes('PDF importé (2 pages)') && /\d+ blocs? de texte modifiables?/.test(importInfo), importInfo)
  check('la fenêtre se referme', (await nBrand('.modal')) === 0)
  check('le document compte 2 pages', (await nBrand('.page-item')) === 2)
  check('la page importée affiche le titre reconstruit', (await run(`document.querySelector('.page-item.current .thumb').innerText`)).includes('Bonjour Trame'))
  check('le document porte le nom du fichier PDF', (await run(`document.querySelector('.doc-name').value`)) === 'pick-import')
  // les assistants d'export de ce test cherchent « Sans titre » : on rend ce nom au document
  await run(`document.querySelector('.doc-name').focus(); document.querySelector('.doc-name').select()`)
  await cdp('Input.insertText', { text: 'Sans titre' })
  await run(`document.querySelector('.doc-name').blur()`)
  await sleep(300)
  png = await exportPng()
  check('format du document = format du PDF (595 × 842 pt à 96 dpi : 793 × 1123)', png.readUInt32BE(16) === 793 && png.readUInt32BE(20) === 1123, `${png.readUInt32BE(16)}×${png.readUInt32BE(20)}`)
  if (process.env.SMOKE_KEEP) await writeFile(process.env.SMOKE_KEEP, png) // inspection visuelle
  const yellow = pngPixel(png, 100, 40)
  check('le fond de la page (bandeau jaune) est dessiné', yellow[0] > 230 && yellow[1] > 190 && yellow[2] < 120, JSON.stringify(yellow))
  await click('.sidebar .tabs button', 'Calques')
  await sleep(300)
  check('calques de la page 1 : fond verrouillé + titre + paragraphe', (await nBrand('.layer')) === 3, String(await nBrand('.layer')))
  const importedPdf = await exportPdfText()
  check('PDF ré-exporté : texte vectoriel (TJ) par-dessus l\'image de fond', importedPdf.includes(' TJ') && lastPdfRaw.includes('/Subtype /Image'))
  // mode « page en image » : plus aucun texte modifiable
  await run('location.reload()') // document propre : pas de question « enregistrer ? » (dialogue natif)
  for (let i = 0; i < 40 && (await run(`document.querySelector('header.toolbar') ? 1 : 0`)) !== 1; i++) await sleep(250)
  await sleep(500)
  await click('header.toolbar button', 'Importer PDF')
  for (let i = 0; i < 40 && (await nBrand('.modal')) === 0; i++) await sleep(250)
  await click('.sidebar .tabs button', 'Calques')
  await clickSel('[data-pdf-mode="image"]')
  await rm(join(tmp, 'exports', 'dialog-info.txt'), { force: true })
  await rm(join(tmp, 'exports', 'dialog-confirm.txt'), { force: true })
  await clickSel('[data-action="pdf-import"]')
  for (let i = 0; i < 120 && (await nBrand('.modal')) > 0; i++) await sleep(250)
  await sleep(500)
  check('mode image : la page ne contient qu\'un calque (l\'image)', (await nBrand('.layer')) === 1, String(await nBrand('.layer')))
  check('mode image : aucun texte reconstruit', !(await run(`document.querySelector('.page-item.current .thumb').innerText`)).includes('Bonjour'))
  // annotation vectorielle : on ajoute un texte, on exporte → la page d'origine redevient du vrai PDF (aucune image), annotation par-dessus
  await run(`document.querySelector('.doc-name').focus(); document.querySelector('.doc-name').select()`)
  await cdp('Input.insertText', { text: 'Sans titre' })
  await run(`document.querySelector('.doc-name').blur()`)
  await sleep(300)
  await click('header.toolbar button', 'Texte')
  await sleep(400)
  const annotated = await exportPdfText()
  const hexOrLiteral = (s) => s.includes('Bonjour') || s.includes('426f6e6a6f7572') || s.includes('426F6E6A6F7572')
  check('PDF annoté : la page d\'origine est intégrée en vectoriel (aucune image dans le PDF)', !lastPdfRaw.includes('/Subtype /Image'), 'image trouvée')
  check('PDF annoté : le texte d\'origine est toujours là (objet formulaire)', lastPdfRaw.includes('/Subtype /Form') && (hexOrLiteral(annotated) || hexOrLiteral(lastPdfRaw)))
  check('PDF annoté : l\'annotation ajoutée est du vrai texte (TJ)', annotated.includes(' TJ'))

  // export PPTX : objets modifiables (texte, rectangle) + repli en image (dégradé) ; fichier relu en ZIP
  await run('location.reload()')
  for (let i = 0; i < 40 && (await run(`document.querySelector('header.toolbar') ? 1 : 0`)) !== 1; i++) await sleep(250)
  await sleep(500)
  await click('header.toolbar button', 'Rectangle')
  await sleep(300)
  await clickSel('.panel [data-fill="gradient"]')
  await sleep(300)
  await click('header.toolbar button', 'Rectangle')
  await sleep(300)
  await click('header.toolbar button', 'Texte')
  await sleep(300)
  await clickSel('.panel [data-list="bullet"]')
  await sleep(300)
  await rm(join(tmp, 'exports', 'dialog-info.txt'), { force: true })
  await rm(join(exportsDir, 'Sans titre.pptx'), { force: true })
  await click('header.toolbar button', 'Export PPTX')
  for (let i = 0; i < 80 && !(await readdir(exportsDir)).includes('Sans titre.pptx'); i++) await sleep(250)
  const pptxBuf = await readFile(join(exportsDir, 'Sans titre.pptx'))
  if (process.env.SMOKE_KEEP_PPTX) await writeFile(process.env.SMOKE_KEEP_PPTX, pptxBuf) // inspection visuelle
  check('le fichier PPTX est une archive ZIP (signature PK)', pptxBuf.subarray(0, 2).toString('latin1') === 'PK')
  const { default: JSZip } = await import('jszip')
  const zip = await JSZip.loadAsync(pptxBuf)
  const slideXml = await zip.file('ppt/slides/slide1.xml').async('string')
  check('la diapositive contient un rectangle et une zone de texte modifiables', slideXml.includes('prst="rect"') && slideXml.includes('<a:t>'), slideXml.slice(0, 200))
  check('le texte de la liste est une puce PowerPoint (buChar)', slideXml.includes('buChar'))
  check('le dégradé est exporté en image (une image dans la diapositive)', slideXml.includes('<p:pic>'))
  check('la présentation a la taille du document (1080 px = 11,25 pouces)', (await zip.file('ppt/presentation.xml').async('string')).includes('sldSz cx="10287000"'))
  let pptxInfo = ''
  for (let i = 0; i < 40 && !pptxInfo; i++) { await sleep(250); pptxInfo = await readFile(join(tmp, 'exports', 'dialog-info.txt'), 'utf-8').catch(() => '') }
  check('un message prévient qu\'un élément (dégradé) est exporté en image', pptxInfo.includes('1 élément exporté sous forme d\'image') && pptxInfo.includes('dégradé'), pptxInfo)
  await rm(join(tmp, 'exports', 'dialog-info.txt'), { force: true }) // les scénarios suivants testent l'absence d'avertissement

  // import PPTX : (1) un fichier produit par un autre logiciel (pptxgenjs), (2) l'aller-retour avec notre propre export
  {
    const { default: PptxGenJS } = await import('pptxgenjs')
    const deck = new PptxGenJS()
    deck.defineLayout({ name: 'W', width: 10, height: 5.625 })
    deck.layout = 'W'
    const s1 = deck.addSlide()
    s1.background = { color: 'FFF4E8' }
    s1.addShape(deck.ShapeType.rect, { x: 1, y: 1, w: 3, h: 1.5, fill: { color: '7C5CFF' }, line: { type: 'none' } })
    s1.addText('Bonjour PPTX', { x: 1, y: 3, w: 6, h: 0.8, fontFace: 'Montserrat', fontSize: 40, bold: true, color: 'D6336C', margin: 0 })
    s1.addImage({ data: `data:image/png;base64,${testPng(200, 100).toString('base64')}`, x: 6, y: 1, w: 3, h: 1.5 })
    deck.addSlide().addText('Deux', { x: 1, y: 1, w: 3, h: 1, fontSize: 30, color: '000000' })
    await writeFile(join(tmp, 'exports', 'pick-import.pptx'), Buffer.from(await deck.write({ outputType: 'nodebuffer' })))
  }
  await run('location.reload()')
  for (let i = 0; i < 40 && (await run(`document.querySelector('header.toolbar') ? 1 : 0`)) !== 1; i++) await sleep(250)
  await sleep(500)
  await rm(join(tmp, 'exports', 'dialog-info.txt'), { force: true })
  await click('header.toolbar button', 'Importer PPTX')
  for (let i = 0; i < 120 && (await nBrand('.page-item')) !== 2; i++) await sleep(250)
  check('le PPTX importé compte 2 pages', (await nBrand('.page-item')) === 2)
  check('le titre du fichier devient le nom du document', (await run(`document.querySelector('.doc-name').value`)) === 'pick-import')
  check('le texte de la diapositive 1 est repris', (await run(`document.querySelector('.page-item.current .thumb').innerText`)).includes('Bonjour PPTX'))
  await run(`document.querySelector('.doc-name').focus(); document.querySelector('.doc-name').select()`)
  await cdp('Input.insertText', { text: 'Sans titre' })
  await run(`document.querySelector('.doc-name').blur()`)
  await sleep(300)
  png = await exportPng()
  check('format du document = format de la présentation (10 × 5,625 po = 960 × 540)', png.readUInt32BE(16) === 960 && png.readUInt32BE(20) === 540, `${png.readUInt32BE(16)}×${png.readUInt32BE(20)}`)
  const bgPx = pngPixel(png, 10, 10), boxPx = pngPixel(png, 150, 150), imgPx = pngPixel(png, 700, 200)
  check('fond de la diapositive repris (#FFF4E8)', Math.abs(bgPx[0] - 255) < 4 && Math.abs(bgPx[1] - 244) < 4 && Math.abs(bgPx[2] - 232) < 4, JSON.stringify(bgPx))
  check('rectangle violet à sa place (1 po, 1 po)', Math.abs(boxPx[0] - 124) < 6 && Math.abs(boxPx[1] - 92) < 6 && Math.abs(boxPx[2] - 255) < 6, JSON.stringify(boxPx))
  check('image à sa place (moitié gauche rouge)', isRed(imgPx), JSON.stringify(imgPx))
  let importedInfo = await readFile(join(tmp, 'exports', 'dialog-info.txt'), 'utf-8').catch(() => '')
  check('une police absente (Montserrat est embarquée) ne provoque pas d\'avertissement', !importedInfo.includes('Montserrat'), importedInfo)
  // aller-retour : on exporte ce document en PPTX, on le ré-importe
  await rm(join(exportsDir, 'Sans titre.pptx'), { force: true })
  await click('header.toolbar button', 'Export PPTX')
  for (let i = 0; i < 80 && !(await readdir(exportsDir)).includes('Sans titre.pptx'); i++) await sleep(250)
  await writeFile(join(exportsDir, 'pick-import.pptx'), await readFile(join(exportsDir, 'Sans titre.pptx')))
  await run('location.reload()')
  for (let i = 0; i < 40 && (await run(`document.querySelector('header.toolbar') ? 1 : 0`)) !== 1; i++) await sleep(250)
  await sleep(500)
  await click('header.toolbar button', 'Importer PPTX')
  for (let i = 0; i < 120 && (await nBrand('.page-item')) !== 2; i++) await sleep(250)
  check('aller-retour : 2 pages', (await nBrand('.page-item')) === 2)
  check('aller-retour : le texte survit', (await run(`document.querySelector('.page-item.current .thumb').innerText`)).includes('Bonjour PPTX'))
  await run(`document.querySelector('.doc-name').focus(); document.querySelector('.doc-name').select()`)
  await cdp('Input.insertText', { text: 'Sans titre' })
  await run(`document.querySelector('.doc-name').blur()`)
  await sleep(300)
  png = await exportPng()
  const rtBox = pngPixel(png, 150, 150), rtImg = pngPixel(png, 700, 200)
  check('aller-retour : rectangle et image au même endroit', Math.abs(rtBox[0] - 124) < 8 && Math.abs(rtBox[2] - 255) < 8 && isRed(rtImg), JSON.stringify([rtBox, rtImg]))
  await rm(join(tmp, 'exports', 'dialog-info.txt'), { force: true })

  // photos en ligne : recherche (faux serveur Openverse), insertion, repli sur la miniature, pagination, erreurs, crédits
  await run('location.reload()')
  for (let i = 0; i < 40 && (await run(`document.querySelector('header.toolbar') ? 1 : 0`)) !== 1; i++) await sleep(250)
  await sleep(500)
  await click('.sidebar .tabs button', 'Photos')
  await sleep(300)
  const search = async (q) => {
    await run(`document.querySelector('[data-field="photoQuery"]').focus(); document.querySelector('[data-field="photoQuery"]').select()`)
    await cdp('Input.insertText', { text: q })
    await clickSel('[data-action="photo-search"]')
  }
  check('aucune requête réseau avant la première recherche', photoRequests.length === 0)
  await search('montagne')
  for (let i = 0; i < 60 && (await nBrand('[data-photo]')) < 2; i++) await sleep(250)
  check('la recherche affiche 2 photos avec leur licence', (await nBrand('[data-photo]')) === 2 && (await run(`document.querySelector('[data-photo="a1"] .photo-license').innerText`)) === 'CC BY 4.0')
  const searchReq = photoRequests.find((r) => r.path === '/v1/images/')
  check('requête : mot-clé, licences commerciales et modifiables, 20 résultats, User-Agent Trame', searchReq?.query.get('q') === 'montagne' && searchReq.query.get('license_type') === 'commercial,modification' && searchReq.query.get('page_size') === '20' && searchReq.ua.startsWith('Trame/'), JSON.stringify([searchReq?.query.toString(), searchReq?.ua]))
  check('« Plus de résultats » est proposé (2 pages)', (await nBrand('[data-action="photo-more"]')) === 1)
  const photoThumbsBefore = await run(`document.querySelectorAll('.page-item.current .thumb img').length`)
  await clickSel('[data-photo="a1"]')
  for (let i = 0; i < 60 && (await run(`document.querySelectorAll('.page-item.current .thumb img').length`)) === photoThumbsBefore; i++) await sleep(250)
  check('un clic sur une photo l\'insère dans la page', (await run(`document.querySelectorAll('.page-item.current .thumb img').length`)) === photoThumbsBefore + 1)
  await clickSel('[data-photo="b2"]')
  for (let i = 0; i < 60 && (await run(`document.querySelectorAll('.page-item.current .thumb img').length`)) < photoThumbsBefore + 2; i++) await sleep(250)
  check('original indisponible (404) : la miniature de l\'API est insérée à la place', (await run(`document.querySelectorAll('.page-item.current .thumb img').length`)) === photoThumbsBefore + 2)
  check('l\'original a bien été demandé d\'abord, puis la miniature', photoRequests.some((r) => r.path === '/img/absent.png'))
  await sleep(300)
  check('le crédit de la photo insérée est affiché dans ses propriétés', (await run(`document.querySelector('.panel [data-field="credit"]')?.innerText ?? ''`)).includes('« Lac » par Bob (CC BY-SA 3.0)'))
  check('la section Crédits propose de copier les crédits du document', (await nBrand('[data-action="photo-credits"]')) === 1)
  await clickSel('[data-action="photo-more"]')
  for (let i = 0; i < 60 && (await nBrand('[data-photo]')) < 3; i++) await sleep(250)
  check('« Plus de résultats » ajoute la page suivante', (await nBrand('[data-photo]')) === 3 && (await nBrand('[data-action="photo-more"]')) === 0)
  await search('limite')
  for (let i = 0; i < 40 && (await nBrand('[data-photo-error]')) === 0; i++) await sleep(250)
  check('limite de requêtes (429) : message dédié', (await run(`document.querySelector('[data-photo-error]')?.dataset.photoError`)) === 'rate-limit')
  // source de secours : Openverse ne répond pas (délai) → Wikimedia Commons, licences non réutilisables écartées
  await search('lent')
  for (let i = 0; i < 80 && (await nBrand('[data-photo]')) !== 2; i++) await sleep(250)
  check('Openverse muet : la recherche bascule sur Wikimedia Commons et le dit', (await nBrand('[data-photo]')) === 2 && (await run(`document.querySelector('[data-photo-source]')?.innerText ?? ''`)).includes('Wikimedia Commons (Openverse ne répond pas'))
  check('Commons : ordre de pertinence, licences affichées, CC BY-NC écartée', (await run(`[...document.querySelectorAll('[data-photo] .photo-license')].map(e => e.innerText).join()`)) === 'CC0 1.0,CC BY-SA 4.0')
  check('les deux sources ont été interrogées, Commons avec le filtre « bitmap »', photoRequests.some((r) => r.path === '/v1/images/' && r.query.get('q') === 'lent') && photoRequests.some((r) => r.path === '/w/api.php' && r.query.get('gsrsearch') === 'lent filetype:bitmap'))
  await clickSel('[data-photo="commons:10"]')
  let commonsCredit = ''
  for (let i = 0; i < 60 && !commonsCredit; i++) { await sleep(250); commonsCredit = await run(`document.querySelector('.panel [data-field="credit"]')?.innerText ?? ''`) }
  check('photo de Commons insérée avec son crédit (auteur sans HTML, licence)', commonsCredit.includes('« Premier » par Cléo & Co (CC0 1.0)'), commonsCredit)
  await run(`(() => { const s = document.querySelector('[data-field="photoSource"]'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(s, 'commons'); s.dispatchEvent(new Event('change', { bubbles: true })) })()`)
  await search('montagne')
  for (let i = 0; i < 60 && (await run(`document.querySelector('[data-photo-source]')?.innerText ?? ''`)).includes('ne répond pas'); i++) await sleep(250)
  check('source choisie explicitement : pas de bascule annoncée', !(await run(`document.querySelector('[data-photo-source]').innerText`)).includes('ne répond pas'))
  await run(`(() => { const s = document.querySelector('[data-field="photoSource"]'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(s, 'auto'); s.dispatchEvent(new Event('change', { bubbles: true })) })()`)
  await search('toutpanne')
  for (let i = 0; i < 60 && (await nBrand('[data-photo-detail]')) === 0; i++) await sleep(250)
  const bothDown = await run(`document.querySelector('[data-photo-detail]')?.innerText ?? ''`)
  check('les deux sources en panne : le détail nomme les deux', bothDown.includes('Openverse : HTTP 500') && bothDown.includes('Wikimedia Commons : HTTP 500'), bothDown)
  await search('planteur')
  for (let i = 0; i < 40 && (await nBrand('[data-photo="a1"]')) === 0; i++) await sleep(250) // résultats de CETTE recherche (ceux de la précédente ont d'autres identifiants)
  check('filtre de licences refusé (500) : requête minimale en repli, résultats non réutilisables écartés', (await nBrand('[data-photo]')) === 2 && (await nBrand('[data-photo="nc9"]')) === 0 && photoRequests.some((r) => r.query.get('q') === 'planteur' && !r.query.has('license_type')))
  await search('refus')
  for (let i = 0; i < 40 && (await run(`document.querySelector('[data-photo-error]')?.dataset.photoError`)) !== 'unavailable'; i++) await sleep(250)
  const refusDetail = await run(`document.querySelector('[data-photo-detail]')?.innerText ?? ''`)
  check('refus du service (403) : le code HTTP et le début de la réponse sont affichés', refusDetail.includes('HTTP 403') && refusDetail.includes('Accès refusé pour test'), refusDetail)
  await search('horsligne')
  for (let i = 0; i < 40 && (await run(`document.querySelector('[data-photo-error]')?.dataset.photoError`)) !== 'offline'; i++) await sleep(250)
  check('service injoignable : message « hors ligne » (l\'appli reste utilisable)', (await run(`document.querySelector('[data-photo-error]')?.dataset.photoError`)) === 'offline')
  await search('vide')
  for (let i = 0; i < 40 && !(await run(`document.body.innerText`)).includes('Aucun résultat pour « vide »'); i++) await sleep(250)
  check('recherche sans résultat : message dédié', (await run(`document.body.innerText`)).includes('Aucun résultat pour « vide »'))
  await run('location.reload()')
  for (let i = 0; i < 40 && (await run(`document.querySelector('header.toolbar') ? 1 : 0`)) !== 1; i++) await sleep(250)

  // polices en ligne : catalogue, aperçu, installation, utilisation, export PDF, persistance, embarquement dans le document
  await run('location.reload()')
  for (let i = 0; i < 40 && (await run(`document.querySelector('header.toolbar') ? 1 : 0`)) !== 1; i++) await sleep(250)
  await sleep(500)
  await click('header.toolbar button', 'Texte')
  await sleep(500)
  const pickFont = (value) => run(`(() => { const s = document.querySelector('[data-field="fontFamily"]'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(s, ${JSON.stringify(value)}); s.dispatchEvent(new Event('change', { bubbles: true })) })()`)
  const fontReqs = () => photoRequests.filter((r) => r.path.startsWith('/fontsource') || r.path === '/v1/fonts').length
  check('aucune requête de polices avant d\'ouvrir le catalogue', fontReqs() === 0)
  await pickFont('__more-fonts__')
  for (let i = 0; i < 60 && (await nBrand('[data-font]')) === 0; i++) await sleep(250)
  check('le catalogue s\'ouvre : 2 polices libres (la propriétaire est écartée)', (await nBrand('.modal [data-field="fontQuery"]')) === 1 && (await nBrand('[data-font]')) === 2 && (await nBrand('[data-font="pas-libre"]')) === 0)
  await run(`document.querySelector('[data-field="fontQuery"]').focus()`)
  await cdp('Input.insertText', { text: 'zeta' })
  await sleep(300)
  check('la recherche filtre par nom', (await nBrand('[data-font]')) === 1)
  await clickSel('[data-font="zeta-test"]')
  for (let i = 0; i < 60 && !(await run(`[...document.fonts].some(f => f.family.includes('trame-preview-zeta-test'))`)); i++) await sleep(250)
  check('l\'aperçu charge la police temporairement (graisse normale seule)', (await nBrand('[data-font-preview]')) === 1 && photoRequests.some((r) => r.path.includes('zeta-test') && r.path.includes('400')) && !photoRequests.some((r) => r.path.includes('zeta-test') && r.path.includes('700')))
  await clickSel('[data-action="font-install"]')
  for (let i = 0; i < 80 && (await nBrand('[data-action="font-remove"]')) === 0; i++) await sleep(250)
  check('l\'installation réussit (normal et gras téléchargés)', (await nBrand('[data-action="font-remove"]')) === 1 && photoRequests.some((r) => r.path.includes('zeta-test') && r.path.includes('700')))
  await run(`document.querySelector('[data-field="fontQuery"]').select()`)
  await cdp('Input.insertText', { text: 'beta' })
  await sleep(300)
  await clickSel('[data-font="beta-sans"]')
  await sleep(500)
  check('un aperçu impossible (404) affiche une explication au lieu de planter', (await run(`document.querySelector('[data-font-note]')?.innerText ?? ''`)).length > 0)
  await clickSel('[data-action="fonts-close"]')
  await sleep(300)
  check('le catalogue se referme', (await nBrand('.modal')) === 0)
  check('la police installée apparaît dans la liste des polices', (await run(`[...document.querySelectorAll('[data-field="fontFamily"] option')].some(o => o.textContent === 'Zeta Test')`)) === true)
  await pickFont('"Zeta Test", serif')
  await sleep(500)
  check('elle s\'applique au texte sélectionné', (await run(`document.querySelector('[data-field="fontFamily"]').value`)) === '"Zeta Test", serif')
  await rm(join(tmp, 'exports', 'dialog-info.txt'), { force: true })
  const fontPdf = await exportPdfText()
  check('PDF avec une police en ligne : vrai texte (TJ), aucune image, aucun avertissement', fontPdf.includes(' TJ') && !lastPdfRaw.includes('/Subtype /Image') && !(await readFile(join(tmp, 'exports', 'dialog-info.txt'), 'utf-8').catch(() => '')))
  check('le texte du PDF utilise la police ajoutée (famille Lora, d\'où viennent les octets de test)', /Lora/.test(fontPdf) || /Lora/.test(lastPdfRaw), 'pas de police Lora dans le PDF')
  // persistance : au rechargement, la police est relue depuis le dossier de données
  await run('location.reload()')
  for (let i = 0; i < 40 && (await run(`document.querySelector('header.toolbar') ? 1 : 0`)) !== 1; i++) await sleep(250)
  await sleep(600)
  await click('header.toolbar button', 'Texte')
  await sleep(500)
  check('la police installée survit au rechargement (hors ligne : aucune requête de plus)', (await run(`[...document.querySelectorAll('[data-field="fontFamily"] option')].some(o => o.textContent === 'Zeta Test')`)) === true)
  // embarquement : le document enregistré contient la police
  await pickFont('"Zeta Test", serif')
  await sleep(300)
  await rm(join(tmp, 'exports', 'Sans titre.trame'), { force: true })
  await click('header.toolbar button', 'Enregistrer')
  for (let i = 0; i < 40 && !(await readdir(join(tmp, 'exports'))).includes('Sans titre.trame'); i++) await sleep(250)
  const savedFont = JSON.parse(await readFile(join(tmp, 'exports', 'Sans titre.trame'), 'utf-8'))
  check('le document enregistré embarque la police utilisée (normal + gras, WOFF2 base64)', !!savedFont.fonts?.['zeta-test']?.variants?.['400'] && !!savedFont.fonts['zeta-test'].variants['700'] && savedFont.fonts['zeta-test'].family === '"Zeta Test", serif')
  // un poste sans la police : on la retire, on rouvre le document → elle est restituée depuis le fichier
  await click('.sidebar .tabs button', 'Marque')
  await clickSel('[data-action="brand-more-fonts"]')
  for (let i = 0; i < 60 && (await nBrand('[data-font]')) === 0; i++) await sleep(250)
  await clickSel('[data-font="zeta-test"]')
  for (let i = 0; i < 40 && (await nBrand('[data-action="font-remove"]')) === 0; i++) await sleep(250)
  await clickSel('[data-action="font-remove"]')
  await sleep(500)
  await clickSel('[data-action="fonts-close"]')
  await run('location.reload()')
  for (let i = 0; i < 40 && (await run(`document.querySelector('header.toolbar') ? 1 : 0`)) !== 1; i++) await sleep(250)
  await sleep(600)
  check('police retirée : absente de la liste après rechargement', (await run(`window.trame.installedFonts().then(l => l.length)`)) === 0)
  await click('.sidebar .tabs button', 'Récents')
  for (let i = 0; i < 40 && (await nBrand('.recent-open')) === 0; i++) await sleep(250)
  await run(`[...document.querySelectorAll('.recent-open')].find(b => b.innerText.includes('Sans titre'))?.click()`)
  await sleep(1200)
  await click('header.toolbar button', 'Texte')
  await sleep(300)
  check('rouvrir le document restitue la police embarquée, sans l\'avoir installée', (await run(`[...document.fonts].some(f => f.family.includes('Zeta Test'))`)) === true)

  // kit de marque : couleurs, polices, logos, couleurs récentes ; persistance entre deux chargements
  await run('location.reload()')
  for (let i = 0; i < 40 && (await run(`document.querySelector('header.toolbar') ? 1 : 0`)) !== 1; i++) await sleep(250)
  await sleep(500)
  await click('.sidebar .tabs button', 'Marque')
  await sleep(300)
  const setInput = (sel, v) => run(`(() => { const i = document.querySelector('${sel}'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, ${JSON.stringify(v)}); i.dispatchEvent(new Event('input', { bubbles: true })) })()`)
  await run(`window.__keep = 1`)
  const startColors = await nBrand('[data-swatch="brand"]')
  await setInput('[data-field="brandColor"]', '#ff0000')
  await clickSel('[data-action="brand-add-color"]')
  await sleep(400)
  check('une couleur ajoutée apparaît dans le kit', (await nBrand('[data-swatch="brand"]')) === startColors + 1)
  await clickSel('[data-action="brand-add-color"]')
  await sleep(200)
  check('la même couleur n\'est pas ajoutée deux fois', (await nBrand('[data-swatch="brand"]')) === startColors + 1)
  await click('header.toolbar button', 'Rectangle')
  await sleep(400)
  await clickSel('[data-swatch="brand"]')
  await sleep(500)
  png = await exportPng()
  check('un clic sur la couleur de la marque colore la sélection (rectangle rouge)', isRed2(pngPixel(png, 540, 540)))
  check('la couleur appliquée rejoint les couleurs récentes', (await nBrand('[data-swatch="recent"]')) === 1)
  // sans sélection : fond de la page
  const emptyBrand = await run(`(() => { const r = document.querySelector('.canvas-wrap').getBoundingClientRect(); return { l: r.right - 40, t: r.top + 80 } })()`)
  for (const type of ['mousePressed', 'mouseReleased']) await cdp('Input.dispatchMouseEvent', { type, x: emptyBrand.l, y: emptyBrand.t, button: 'left', clickCount: 1 })
  await sleep(300)
  await clickSel('[data-swatch="brand"]')
  await sleep(500)
  png = await exportPng()
  check('sans sélection, la couleur devient le fond de la page', isRed2(pngPixel(png, 20, 20)))
  // polices
  await run(`(() => { const s = document.querySelector('[data-field="brandFontSelect"]'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(s, s.options[1].value); s.dispatchEvent(new Event('change', { bubbles: true })) })()`)
  await clickSel('[data-action="brand-add-font"]')
  await sleep(300)
  check('une police ajoutée apparaît dans le kit', (await nBrand('[data-brand-font]')) === 1)
  await click('header.toolbar button', 'Texte')
  await sleep(400)
  const brandFam = await run(`document.querySelector('[data-brand-font]').dataset.brandFont`)
  await clickSel('[data-brand-font]')
  await sleep(400)
  check('un clic sur la police de la marque l\'applique au texte sélectionné', (await run(`document.querySelector('.panel select[style*="font-family"]')?.value`)) === brandFam)
  // logos
  await writeFile(join(tmp, 'exports', 'pick-image.png'), testPng(200, 100))
  await clickSel('[data-action="brand-add-logo"]')
  await sleep(500)
  check('un logo ajouté apparaît dans le kit', (await nBrand('[data-brand-logo]')) === 1)
  const imgsBefore = await run(`document.querySelectorAll('.page-item.current .thumb img').length`)
  await clickSel('[data-brand-logo]')
  await sleep(600)
  check('un clic sur le logo l\'insère dans la page', (await run(`document.querySelectorAll('.page-item.current .thumb img').length`)) === imgsBefore + 1)
  // persistance : rechargement de la page → le kit est relu depuis le fichier
  await run('location.reload()')
  for (let i = 0; i < 40 && (await run(`document.querySelector('header.toolbar') ? 1 : 0`)) !== 1; i++) await sleep(250)
  await sleep(500)
  await click('.sidebar .tabs button', 'Marque')
  await sleep(600)
  check('le kit (couleur, police, logo) survit au rechargement', (await nBrand('[data-swatch="brand"]')) === startColors + 1 && (await nBrand('[data-brand-font]')) === 1 && (await nBrand('[data-brand-logo]')) === 1)
  check('les couleurs récentes aussi', (await nBrand('[data-swatch="recent"]')) === 1)
  await run(`document.querySelector('[data-swatch-remove]').click()`)
  await run(`document.querySelector('[data-brand-logo]').parentElement.querySelector('.swatch-x').click()`)
  await sleep(400)
  check('retirer une couleur et un logo du kit', (await nBrand('[data-swatch="brand"]')) === startColors && (await nBrand('[data-brand-logo]')) === 0)

  // listes : bouton → miniature (marqueurs) → export image différent → PDF toujours en vrai texte
  await run('location.reload()')
  for (let i = 0; i < 40 && (await run(`document.querySelector('header.toolbar') ? 1 : 0`)) !== 1; i++) await sleep(250)
  await sleep(500)
  await click('header.toolbar button', 'Texte')
  await sleep(400)
  const plainPng = await exportPng()
  check('par défaut : aucun bouton de liste enfoncé', (await run(`document.querySelectorAll('.panel [data-list][aria-pressed="true"]').length`)) === 0)
  await clickSel('.panel [data-list="bullet"]')
  await sleep(500)
  check('le bouton « puces » est enfoncé', (await run(`document.querySelector('.panel [data-list="bullet"]').getAttribute('aria-pressed')`)) === 'true')
  check('la miniature affiche le marqueur « • »', (await run(`document.querySelector('.page-item.current .thumb').innerText`)).includes('•'))
  check("l'export image change (marqueur dessiné, texte en retrait)", !(await exportPng()).equals(plainPng))
  const listPdf = await exportPdfText()
  check('PDF de liste : vrai texte (TJ), aucune image', listPdf.includes(' TJ') && !lastPdfRaw.includes('/Subtype /Image'))
  await clickSel('.panel [data-list="number"]')
  await sleep(400)
  check('« numérotée » remplace « puces »', (await run(`document.querySelector('.page-item.current .thumb').innerText`)).includes('1.') && (await run(`document.querySelector('.panel [data-list="bullet"]').getAttribute('aria-pressed')`)) === 'false')
  await clickSel('.panel [data-list="number"]')
  await sleep(400)
  check('un second clic retire la liste (export identique à l\'original)', (await exportPng()).equals(plainPng))

  // Magic Resize : 1080 × 1080 → Story 1080 × 1920 avec adaptation du contenu, puis sans, puis annulation
  await run('location.reload()')
  for (let i = 0; i < 40 && (await run(`document.querySelector('header.toolbar') ? 1 : 0`)) !== 1; i++) await sleep(250)
  await sleep(500)
  await click('header.toolbar button', 'Rectangle') // 300 × 200 au centre : (390, 440) → centre (540, 540)
  await sleep(400)
  const emptyAt = await run(`(() => { const r = document.querySelector('.canvas-wrap').getBoundingClientRect(); return { l: r.right - 40, t: r.top + 80 } })()`)
  for (const type of ['mousePressed', 'mouseReleased']) await cdp('Input.dispatchMouseEvent', { type, x: emptyAt.l, y: emptyAt.t, button: 'left', clickCount: 1 })
  await sleep(300)
  const pickSize = (v) => run(`(() => { const s = [...document.querySelectorAll('.panel select')].find(x => [...x.options].some(o => o.value === '1080x1920')); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(s, ${JSON.stringify(v)}); s.dispatchEvent(new Event('change', { bubbles: true })) })()`)
  const pngHeight = (buf) => buf.readUInt32BE(20)
  const coloured = (p) => p.some((v) => v < 235)
  check('le panneau Page propose largeur, hauteur et « Adapter le contenu » (coché)', (await field('pageWidth')) === 1080 && (await run(`document.querySelector('.panel [data-field="adaptContent"]').checked`)) === true)
  await pickSize('1080x1920')
  await sleep(500)
  check('format Story appliqué', (await field('pageWidth')) === 1080 && (await field('pageHeight')) === 1920)
  png = await exportPng()
  check("l'export fait 1920 px de haut", pngHeight(png) === 1920)
  check('contenu adapté : le rectangle (taille inchangée) est recentré à y = 960', coloured(pngPixel(png, 540, 960)) && !coloured(pngPixel(png, 540, 540)))
  await clickSel('header.toolbar button[title^="Annuler"]')
  await sleep(500)
  png = await exportPng()
  check('annuler rétablit 1080 × 1080 et la place du rectangle', pngHeight(png) === 1080 && coloured(pngPixel(png, 540, 540)))
  // sans adaptation : seule la page change, le rectangle ne bouge pas
  await run(`document.querySelector('.panel [data-field="adaptContent"]')?.click()`)
  await sleep(200)
  await pickSize('1080x1920')
  await sleep(500)
  png = await exportPng()
  check('sans « Adapter le contenu » : le rectangle reste à y 440–640', pngHeight(png) === 1920 && coloured(pngPixel(png, 540, 540)) && !coloured(pngPixel(png, 540, 960)))

  // export PDF vectoriel : on ajoute du texte dans l'interface (document vierge : les scénarios précédents ont laissé des éléments)
  await run('location.reload()')
  for (let i = 0; i < 40 && (await run(`document.querySelector('header.toolbar') ? 1 : 0`)) !== 1; i++) await sleep(250)
  await sleep(500)
  // puis on exporte et on inspecte le PDF produit
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
    check("un export sans repli n'affiche aucun avertissement", !(await readdir(join(tmp, 'exports'))).includes('dialog-info.txt'))
    check('métadonnées : créateur « Trame »', all.includes('/Creator <FEFF005400720061006D0065>')) // « Trame » en UTF-16
  }

  // association de fichiers : ouverture depuis le Finder alors que l'application tourne
  const finderFile = join(tmp, 'proj', 'ouvert-par-finder.trame')
  const txt = (id, y, text, fontFamily) => ({ id, type: 'text', x: 20, y, width: 300, height: 40, rotation: 0, opacity: 1, fill: '#000000', text, fontSize: 24, fontFamily, fontStyle: 'normal', align: 'left' })
  // un texte en police système et un texte avec un caractère absent de la police : tous deux devront retomber en image et être signalés
  const finderDoc = JSON.stringify({
    version: 2, name: 'Ouvert', width: 400, height: 200,
    pages: [{ id: 'p', background: '#fff', elements: [txt('a', 20, 'Police système', 'Helvetica Neue, Arial, sans-serif'), txt('b', 80, 'Coche ✓ absente', '"Inter", sans-serif')] }]
  })
  await run(`window.trame.saveProject(${JSON.stringify(finderDoc)}, ${JSON.stringify(finderFile)}, 'Ouvert')`)
  await run('location.reload()') // état propre : pas de confirmation native
  for (let i = 0; i < 40 && (await run(`document.querySelector('header.toolbar') ? 1 : 0`)) !== 1; i++) await sleep(250)
  if (process.platform === 'darwin' && !(await otherElectronPids()).length) {
    await openWithApp('-a', bundle, finderFile)
    for (let i = 0; i < 30 && !(await run('document.title')).startsWith('ouvert-par-finder'); i++) await sleep(200)
    check('double-clic dans le Finder (appli ouverte) : le projet s\'ouvre', (await run('document.title')).startsWith('ouvert-par-finder'), await run('document.title'))
    // export PDF de ce document : les 2 textes retombent en image, l'utilisateur doit en être prévenu avec la cause
    await rm(join(tmp, 'exports', 'dialog-info.txt'), { force: true })
    await click('header.toolbar button', 'Export PDF')
    let info = ''
    for (let i = 0; i < 40 && !info; i++) {
      await sleep(250)
      info = await readFile(join(tmp, 'exports', 'dialog-info.txt'), 'utf-8').catch(() => '')
    }
    check('un export avec des replis en image prévient l\'utilisateur', info.includes('2 textes exportés sous forme d\'image'), info.split('\n')[0])
    check('le message nomme la police système et le caractère absent', info.includes('Helvetica Neue') && info.includes('✓'), info)
    check("le message indique la marche à suivre (menu « Police »)", info.includes('menu « Police »'))

    // avertissement en direct dans l'éditeur : compteur sur le bouton, encart du panneau, correction en un clic
    const pdfBtn = () => run(`[...document.querySelectorAll('header.toolbar button')].find(b => b.textContent.includes('Export PDF'))?.textContent.trim()`)
    check('le bouton « Export PDF » signale les 2 textes concernés', (await pdfBtn()) === 'Export PDF ⚠ 2', await pdfBtn())
    // clic sur le premier texte (même calcul d'ajustement que le canvas : marge 48, document 400 × 200)
    const geo = await run(`(() => { const r = document.querySelector('.canvas-wrap').getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height } })()`)
    const fit = Math.min((geo.w - 96) / 400, (geo.h - 96) / 200)
    const px = geo.l + (geo.w - 400 * fit) / 2 + 60 * fit
    const py = geo.t + (geo.h - 200 * fit) / 2 + 32 * fit
    for (const type of ['mousePressed', 'mouseReleased']) await cdp('Input.dispatchMouseEvent', { type, x: px, y: py, button: 'left', clickCount: 1 })
    await sleep(500)
    const warn = await run(`document.querySelector('.panel .warn')?.innerText ?? ''`)
    check("le panneau explique pourquoi (police « Helvetica Neue » non embarquée)", warn.includes('Helvetica Neue') && warn.includes('Exporté en image'), warn)
    check('le panneau propose la correction « Utiliser Inter »', (await click('.panel .warn-fix', 'Utiliser Inter')) === true)
    for (let i = 0; i < 30 && (await pdfBtn()) !== 'Export PDF ⚠ 1'; i++) await sleep(200)
    check("après la correction, il ne reste qu'un texte signalé (le caractère absent)", (await pdfBtn()) === 'Export PDF ⚠ 1', await pdfBtn())
    check("l'encart disparaît du texte corrigé", (await run(`document.querySelector('.panel .warn') ? 1 : 0`)) === 0)
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
  photoServer.close()
  await rm(tmp, { recursive: true, force: true })
}

console.log(failures.length ? `\n${failures.length} échec(s)` : '\nTout est OK')
process.exit(failures.length ? 1 : 0)
