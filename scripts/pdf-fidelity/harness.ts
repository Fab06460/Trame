import { exportPdf } from '@/pdfExport'
import { exportPptx } from '@/pptxExport'
import { importPptx } from '@/pptxImport/importPptx'
import { renderPage } from '@/exportPages'
import { pageToSvg } from '@/svgExport'
import { loadFonts } from '@/fonts'
import { cases } from './documents'

// Exécuté dans une fenêtre Electron avec accès à Node (voir main.cjs) : écrit les fichiers à comparer
const nodeRequire = (window as unknown as { require: NodeRequire }).require
const fs = nodeRequire('fs') as typeof import('fs')
const OUT = (window as unknown as { process: { env: Record<string, string> } }).process.env.FIDELITY_OUT

const decode = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('image illisible'))
    img.src = url
  })

function pixelsOf(img: HTMLImageElement, w: number, h: number): Uint8ClampedArray {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')!
  g.fillStyle = '#fff'
  g.fillRect(0, 0, w, h)
  g.drawImage(img, 0, 0, w, h)
  return g.getImageData(0, 0, w, h).data
}

async function main(): Promise<void> {
  await loadFonts()
  const report: Record<string, unknown> = {}
  for (const c of cases()) {
    const t0 = performance.now()
    const { dataUrl: pdf, fallbacks } = await exportPdf(c.doc)
    const ms = Math.round(performance.now() - t0)
    fs.writeFileSync(`${OUT}/${c.name}.pdf`, Buffer.from(pdf.split(',')[1], 'base64'))
    // PPTX : produit pour inspection (Keynote, Quick Look) ; sa fidélité ne se mesure pas pixel à pixel
    const { dataUrl: pptx } = await exportPptx(c.doc)
    fs.writeFileSync(`${OUT}/${c.name}.pptx`, Buffer.from(pptx.split(',')[1], 'base64'))
    // aller-retour PPTX : on ré-importe le fichier exporté et on rend chaque page (inspection à l'œil)
    const back = await importPptx(new Uint8Array(Buffer.from(pptx.split(',')[1], 'base64')), c.name)
    for (const [i, page] of back.doc.pages.entries()) {
      const png = await renderPage(back.doc, page, 'image/png')
      fs.writeFileSync(`${OUT}/${c.name}-pptx-roundtrip-${i + 1}.png`, Buffer.from(png.split(',')[1], 'base64'))
    }
    for (const [i, page] of c.doc.pages.entries()) {
      const png = await renderPage(c.doc, page, 'image/png')
      fs.writeFileSync(`${OUT}/${c.name}-konva-${i + 1}.png`, Buffer.from(png.split(',')[1], 'base64'))
    }
    // SVG : rastérisé comme une image (sans accès aux polices du système : seules les polices incorporées comptent), puis comparé à Konva
    const svgPages: Array<{ page: number; meanDiff: number; bigPct: number; bytes: number; textElements: number }> = []
    for (const [i, page] of c.doc.pages.entries()) {
      const svg = await pageToSvg(c.doc, page)
      fs.writeFileSync(`${OUT}/${c.name}-${i + 1}.svg`, svg)
      const w = c.doc.width
      const h = c.doc.height
      const svgImg = await decode(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`)
      const konvaImg = await decode(await renderPage(c.doc, page, 'image/png'))
      const a = pixelsOf(svgImg, w, h)
      const b = pixelsOf(konvaImg, w, h)
      let sum = 0
      let big = 0
      for (let p = 0; p < w * h; p++) {
        const d = Math.max(Math.abs(a[p * 4] - b[p * 4]), Math.abs(a[p * 4 + 1] - b[p * 4 + 1]), Math.abs(a[p * 4 + 2] - b[p * 4 + 2]))
        sum += d
        if (d > 64) big++
      }
      const out = document.createElement('canvas')
      out.width = w
      out.height = h
      out.getContext('2d')!.drawImage(svgImg, 0, 0, w, h)
      fs.writeFileSync(`${OUT}/${c.name}-svg-${i + 1}.png`, Buffer.from(out.toDataURL('image/png').split(',')[1], 'base64'))
      svgPages.push({ page: i + 1, meanDiff: sum / (w * h), bigPct: (big * 100) / (w * h), bytes: svg.length, textElements: (svg.match(/<text /g) ?? []).length })
    }
    report[c.name] = { svg: svgPages, width: c.doc.width, pages: c.doc.pages.length, exportMs: ms, expectText: c.expectText, expectFallbacks: c.expectFallbacks, maxBigPct: c.maxBigPct, maxSvgBigPct: c.maxSvgBigPct, fallbacks }
  }
  fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 1))
  document.title = 'DONE'
}

main().catch((e) => {
  fs.writeFileSync(`${OUT}/error.txt`, String(e?.stack ?? e))
  document.title = 'ERROR'
})
