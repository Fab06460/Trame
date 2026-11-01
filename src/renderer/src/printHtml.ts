import { sheetGeometry } from '@shared/printSheet'

export interface PrintHtmlInput {
  title: string
  width: number
  height: number
  /** SVG déjà préparés (`inlineSvg`) : un par feuille */
  pages: string[]
  /** `@font-face` des polices utilisées */
  fonts: string
}

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * Page HTML qui n'a d'autre but que d'être imprimée : une section par feuille, à la taille exacte de la feuille (`@page`), sans marge, sans
 * script. La politique de sécurité n'autorise que les images et polices en données intégrées.
 */
export function buildPrintHtml(input: PrintHtmlInput): string {
  const g = sheetGeometry(input.width, input.height)
  if (!g) throw new Error('invalid sheet size')
  const size = `${g.widthMm}mm ${g.heightMm}mm`
  return `<!doctype html>
<html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:">
<title>${esc(input.title)}</title>
<style>${input.fonts}
@page{size:${size};margin:0}
*{box-sizing:border-box}
html,body{margin:0;padding:0;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.sheet{width:${g.widthMm}mm;height:${g.heightMm}mm;overflow:hidden;break-after:page;page-break-after:always}
.sheet:last-child{break-after:auto;page-break-after:auto}
.sheet svg{display:block;width:100%;height:100%}
</style></head><body>
${input.pages.map((svg) => `<section class="sheet">${svg}</section>`).join('\n')}
</body></html>`
}
