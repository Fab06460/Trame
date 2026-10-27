#!/usr/bin/env node
/**
 * Planche-contact de Magic Resize : chaque modèle intégré dans son format d'origine puis adapté à plusieurs autres formats.
 * Pour juger la composition à l'œil (aucune mesure automatique) : `npm run resize-gallery`.
 */
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const here = import.meta.dirname
const root = resolve(here, '../..')
const electron = createRequire(import.meta.url)(join(root, 'node_modules/electron'))
const sh = (cmd, args, opts = {}) => new Promise((res) => spawn(cmd, args, { stdio: 'inherit', ...opts }).on('exit', res))

const out = await mkdtemp(join(tmpdir(), 'trame-resize-'))
const config = join(here, 'vite.config.mjs')
if ((await sh('npx', ['vite', 'build', '--config', config, '--mode', 'gallery'], { cwd: root, env: { ...process.env, FIDELITY_GALLERY: '1' } })) !== 0) throw new Error('vite build a échoué')
const env = { ...process.env, FIDELITY_OUT: out, FIDELITY_PAGE: 'gallery.html' }
delete env.ELECTRON_RUN_AS_NODE
if ((await sh(electron, [join(here, 'main.cjs')], { env })) !== 0) throw new Error("la génération a échoué (voir error.txt dans " + out + ")")
console.log(`Planches : ${out}`)
