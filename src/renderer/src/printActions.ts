import { fileSafeName } from '@/docName'
import { exportPdf } from '@/pdfExport'
import { describeFallbacks } from '@/pdfFallbacks'
import { t } from '@/i18n'
import { useEditor } from '@/store/editor'
import type { ImposedDocument } from '@/imposition'
import { inlineSvg } from '@/htmlExport'
import { buildPrintHtml } from '@/printHtml'
import { fontFaces, pageToSvg } from '@/svgExport'

/** Écrit le PDF d'une imposition (livret ou plusieurs pages par feuille) ; les textes qui n'ont pas pu rester du texte sont signalés après l'enregistrement. */
export async function exportImposed(imposed: ImposedDocument, fileStem: string): Promise<string | null> {
  const { doc } = useEditor.getState()
  const { dataUrl, fallbacks } = await exportPdf(imposed.doc)
  const saved = await window.trame.saveExport(dataUrl, `${fileSafeName(fileStem || doc.name)}.pdf`)
  const warning = saved ? describeFallbacks(fallbacks, imposed.doc.pages.length) : null
  if (warning) await window.trame.showInfo(warning.message, warning.detail)
  return saved
}

/** Les feuilles d'une imposition, prêtes à imprimer : une page HTML où chaque feuille est un SVG à la taille exacte du papier. */
async function printableHtml(imposed: ImposedDocument): Promise<string> {
  const { doc } = imposed
  const pages: string[] = []
  for (let i = 0; i < doc.pages.length; i++) pages.push(inlineSvg(await pageToSvg(doc, doc.pages[i], { embedFonts: false }), i))
  return buildPrintHtml({ title: doc.name, width: doc.width, height: doc.height, pages, fonts: await fontFaces(doc.pages) })
}

/** Imprime directement (boîte d'impression du système), sans enregistrer de PDF. `duplex` : recto-verso proposé d'avance (livret : bord court). */
export async function printImposed(imposed: ImposedDocument, duplex: 'simplex' | 'shortEdge'): Promise<Awaited<ReturnType<typeof window.trame.printHtml>>> {
  const html = await printableHtml(imposed)
  return window.trame.printHtml(html, imposed.doc.width, imposed.doc.height, duplex)
}
