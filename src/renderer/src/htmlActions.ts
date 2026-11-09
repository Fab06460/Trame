import { fileSafeName } from '@/docName'
import { clipPayloads, documentToHtml, type HtmlLabels } from '@/htmlExport'
import { useLocale, t } from '@/i18n'
import type { TrameDocument } from '@/types'

/** Textes de la présentation web, dans la langue de l'éditeur. */
export function htmlLabels(): HtmlLabels {
  return {
    lang: useLocale.getState().locale,
    page: t('html.page', { page: '{page}', total: '{total}' }),
    previous: t('html.previous'),
    next: t('html.next'),
    fullscreen: t('html.fullscreen'),
    help: t('html.help'),
    noScript: t('html.noscript'),
    goPage: t('pres.link.page', { n: '{n}' })
  }
}

/** Le document porte-t-il des clips vidéo à jouer dans la présentation web ? */
export const hasHtmlClips = (doc: TrameDocument): boolean => Object.keys(clipPayloads(doc)).length > 0

/** Fabrique la présentation web et la fait enregistrer (octets directs : avec des clips le fichier peut peser des dizaines de Mo). */
export async function exportHtml(doc: TrameDocument, clips: boolean): Promise<boolean> {
  const html = await documentToHtml(doc, htmlLabels(), { clips })
  return !!(await window.trame.saveExportBytes(new TextEncoder().encode(html), `${fileSafeName(doc.name)}.html`))
}
