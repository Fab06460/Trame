import { exportPdf } from '@/pdfExport'
import { exportPptx } from '@/pptxExport'
import { importPptx } from '@/pptxImport/importPptx'
import { renderPage } from '@/exportPages'
import { loadFonts } from '@/fonts'
import { cases } from './documents'

// Exécuté dans une fenêtre Electron avec accès à Node (voir main.cjs) : écrit les fichiers à comparer
const nodeRequire = (window as unknown as { require: NodeRequire }).require
const fs = nodeRequire('fs') as typeof import('fs')
const OUT = (window as unknown as { process: { env: Record<string, string> } }).process.env.FIDELITY_OUT

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
    report[c.name] = { width: c.doc.width, pages: c.doc.pages.length, exportMs: ms, expectText: c.expectText, expectFallbacks: c.expectFallbacks, maxBigPct: c.maxBigPct, fallbacks }
  }
  fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 1))
  document.title = 'DONE'
}

main().catch((e) => {
  fs.writeFileSync(`${OUT}/error.txt`, String(e?.stack ?? e))
  document.title = 'ERROR'
})
