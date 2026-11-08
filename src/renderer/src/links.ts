import { isOpenableLink } from '@shared/links'
import { boundsOf } from '@/geometry'
import type { ElementLink, TrameDocument, TrameElement, TramePage } from '@/types'

export { normalizeLink } from '@shared/links'

/** Ce vers quoi un lien mène, une fois vérifié : une adresse, ou une page du document (par son rang). */
export type LinkTarget = { kind: 'url'; url: string } | { kind: 'page'; index: number }

/** La cible d'un élément, ou null s'il n'a pas de lien, si l'adresse n'est pas utilisable ou si la page visée n'existe plus. */
export function linkTarget(doc: Pick<TrameDocument, 'pages'>, el: Pick<TrameElement, 'link'>): LinkTarget | null {
  const link = el.link
  if (!link) return null
  if ('url' in link) return isOpenableLink(link.url) ? { kind: 'url', url: link.url } : null
  const index = doc.pages.findIndex((p) => p.id === link.page)
  return index >= 0 ? { kind: 'page', index } : null
}

/** L'option `hyperlink` de pptxgenjs pour un élément (adresse, ou numéro de diapositive à partir de 1), ou rien. */
export function pptxLink(doc: Pick<TrameDocument, 'pages'>, el: Pick<TrameElement, 'link' | 'video'>): { hyperlink?: { url: string } | { slide: number } } {
  const target = canLink(el) ? linkTarget(doc, el) : null
  if (!target) return {}
  return { hyperlink: target.kind === 'url' ? { url: target.url } : { slide: target.index + 1 } }
}

/** Un lien se pose sur les éléments ordinaires : pas sur un clip vidéo, dont le clic lance ou arrête la lecture. */
export const canLink = (el: Pick<TrameElement, 'video'>): boolean => !el.video

/** Les éléments visibles d'une page qui portent un lien valide, avec leur cible et leur boîte englobante (pixels de design). */
export function pageLinks(doc: Pick<TrameDocument, 'pages'>, page: Pick<TramePage, 'elements'>): Array<{ el: TrameElement; target: LinkTarget; box: ReturnType<typeof boundsOf> }> {
  const out: Array<{ el: TrameElement; target: LinkTarget; box: ReturnType<typeof boundsOf> }> = []
  for (const el of page.elements) {
    if (el.hidden || !canLink(el)) continue
    const target = linkTarget(doc, el)
    if (target) out.push({ el, target, box: boundsOf(el) })
  }
  return out
}

/**
 * Nettoyage à la lecture d'un fichier : une adresse web ou de courrier déjà normalisée, ou une page qui existe ; sinon le lien disparaît.
 * Modifie en place.
 */
export function sanitizeLink(element: object, pageIds: ReadonlySet<string>): void {
  const e = element as Record<string, unknown>
  const link = e.link as Record<string, unknown> | null | undefined
  const valid =
    !!link && typeof link === 'object' && !Array.isArray(link) && !e.video &&
    (typeof link.url === 'string' ? isOpenableLink(link.url) : typeof link.page === 'string' && pageIds.has(link.page))
  if (!valid) delete e.link
  else e.link = typeof link!.url === 'string' ? ({ url: link!.url } as ElementLink) : ({ page: link!.page } as ElementLink)
}

/** Retire des éléments les liens vers une page qui vient d'être supprimée. */
export function withoutLinksToPage(pages: TramePage[], pageId: string): TramePage[] {
  if (!pages.some((p) => p.elements.some((e) => e.link && 'page' in e.link && e.link.page === pageId))) return pages
  return pages.map((p) => ({
    ...p,
    elements: p.elements.map((e) => {
      if (!e.link || !('page' in e.link) || e.link.page !== pageId) return e
      const { link: _drop, ...rest } = e
      void _drop
      return rest
    })
  }))
}
