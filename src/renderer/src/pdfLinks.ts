import { PDFDocument, PDFString } from 'pdf-lib'
import { PT_PER_PX } from '@/pdfMath'
import { pageLinks } from '@/links'
import type { TrameDocument } from '@/types'

/**
 * Zones cliquables du PDF : une annotation « Link » par élément lié, sur son rectangle englobant. Une adresse ouvre le navigateur, une
 * page du document est visée par un saut (`GoTo`, page entière). À appeler une fois toutes les pages créées (une page visée peut venir
 * après celle du lien). `margin` est le décalage du contenu dans la page (fond perdu et traits de coupe). Rend le nombre de liens posés.
 */
export function addPdfLinks(pdf: PDFDocument, doc: Pick<TrameDocument, 'pages' | 'height'>, margin: number): number {
  const pages = pdf.getPages()
  const context = pdf.context
  const height = doc.height * PT_PER_PX
  let count = 0
  for (const [index, page] of doc.pages.entries()) {
    const pdfPage = pages[index]
    if (!pdfPage) continue
    for (const { target, box } of pageLinks(doc, page)) {
      if (target.kind === 'page' && !pages[target.index]) continue
      const action =
        target.kind === 'url'
          ? { Type: 'Action', S: 'URI', URI: PDFString.of(target.url) }
          : { Type: 'Action', S: 'GoTo', D: [pages[target.index].ref, 'Fit'] }
      const annot = context.obj({
        Type: 'Annot',
        Subtype: 'Link',
        Rect: [margin + box.x * PT_PER_PX, margin + height - (box.y + box.height) * PT_PER_PX, margin + (box.x + box.width) * PT_PER_PX, margin + height - box.y * PT_PER_PX],
        Border: [0, 0, 0],
        F: 4,
        A: action
      })
      pdfPage.node.addAnnot(context.register(annot))
      count += 1
    }
  }
  return count
}
