import { renderPage } from '@/exportPages'
import { loadFonts } from '@/fonts'
import { adaptDocument } from '@/magicResize'
import { TEMPLATES, instantiate } from '@/templates'
import type { TrameDocument } from '@/types'

// Planche-contact de Magic Resize (inspection à l'œil) : chaque modèle dans son format d'origine puis adapté à d'autres formats.
const nodeRequire = (window as unknown as { require: NodeRequire }).require
const fs = nodeRequire('fs') as typeof import('fs')
const OUT = (window as unknown as { process: { env: Record<string, string> } }).process.env.FIDELITY_OUT

const TARGETS: Array<[string, number, number]> = [['Story', 1080, 1920], ['16:9', 1920, 1080], ['Facebook', 1200, 630], ['A4', 794, 1123], ['Carré', 1080, 1080]]
const H = 360

const load = (src: string): Promise<HTMLImageElement> => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src })

async function main(): Promise<void> {
  await loadFonts()
  for (const t of TEMPLATES) {
    const doc: TrameDocument = instantiate(t)
    const tiles: Array<{ label: string; img: HTMLImageElement }> = []
    tiles.push({ label: `${t.name} ${doc.width}×${doc.height}`, img: await load(await renderPage(doc, doc.pages[0])) })
    for (const [name, w, h] of TARGETS) {
      if (w === doc.width && h === doc.height) continue
      const out = adaptDocument(doc, w, h)
      tiles.push({ label: `${name} ${w}×${h}`, img: await load(await renderPage(out, out.pages[0])) })
    }
    const widths = tiles.map((x) => Math.round((x.img.width * H) / x.img.height))
    const canvas = document.createElement('canvas')
    canvas.width = widths.reduce((a, b) => a + b + 12, 12)
    canvas.height = H + 40
    const g = canvas.getContext('2d')!
    g.fillStyle = '#888'
    g.fillRect(0, 0, canvas.width, canvas.height)
    let x = 12
    tiles.forEach((tile, i) => {
      g.drawImage(tile.img, x, 28, widths[i], H)
      g.fillStyle = '#fff'
      g.font = '14px sans-serif'
      g.fillText(tile.label, x, 18)
      x += widths[i] + 12
    })
    fs.writeFileSync(`${OUT}/gallery-${t.id}.png`, Buffer.from(canvas.toDataURL('image/png').split(',')[1], 'base64'))
  }
  document.title = 'DONE'
}

main().catch((e) => {
  fs.writeFileSync(`${OUT}/error.txt`, String(e?.stack ?? e))
  document.title = 'ERROR'
})
