import { describe, expect, it } from 'vitest'
import { buildPresentationHtml, inlineSvg, prefixIds, type HtmlLabels } from './htmlExport'

const labels: HtmlLabels = { lang: 'fr', page: 'Page {page} sur {total}', previous: 'Précédente', next: 'Suivante', fullscreen: 'Plein écran', help: 'Aide', noScript: 'JS requis' }
const svg = (id: string): string => `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><title>Doc</title><defs><linearGradient id="${id}"/></defs><rect fill="url(#${id})"/></svg>\n`

describe('présentation web', () => {
  it('préfixe les identifiants et leurs références', () => {
    expect(prefixIds('<g id="g1"/><rect fill="url(#g1)" filter="url(#s2)"/>', 'p2-')).toBe('<g id="p2-g1"/><rect fill="url(#p2-g1)" filter="url(#p2-s2)"/>')
  })
  it('SVG en ligne : sans prologue ni titre, identifiants propres à la page', () => {
    const out = inlineSvg(svg('g1'), 2)
    expect(out.startsWith('<svg focusable="false" xmlns')).toBe(true)
    expect(out).not.toContain('<?xml')
    expect(out).not.toContain('<title>')
    expect(out).toContain('id="p3-g1"')
    expect(out).toContain('url(#p3-g1)')
  })
  it('deux pages au même identifiant ne se confondent pas', () => {
    const a = inlineSvg(svg('g1'), 0)
    const b = inlineSvg(svg('g1'), 1)
    expect(a).toContain('id="p1-g1"')
    expect(b).toContain('id="p2-g1"')
  })
  const html = buildPresentationHtml({ title: 'Mon <cours> & "co"', width: 1920, height: 1080, slides: [inlineSvg(svg('g1'), 0), inlineSvg(svg('g1'), 1)], transitions: ['fade', 'slide'], fonts: '', labels })
  it('une section par page, étiquetée, et le titre est échappé', () => {
    expect(html.match(/<section class="slide"/g)).toHaveLength(2)
    expect(html).toContain('aria-label="Page 2 sur 2"')
    expect(html).toContain('<title>Mon &lt;cours&gt; &amp; &quot;co&quot;</title>')
    expect(html).toContain('<html lang="fr">')
    expect(html).toContain('--w:1920;--h:1080')
  })
  it('aucune connexion possible : politique de sécurité stricte, aucune adresse externe', () => {
    expect(html).toContain("default-src 'none'")
    expect(html.replace(/xmlns="http:\/\/www\.w3\.org\/2000\/svg"/g, '')).not.toMatch(/https?:\/\//) // l'espace de noms SVG n'est pas une adresse qu'on charge
    expect(html).not.toMatch(/<script[^>]+src=/)
    expect(html).not.toMatch(/<link /)
  })
  it('les données du lecteur ne peuvent pas fermer le script', () => {
    const evil = buildPresentationHtml({ title: 't', width: 1, height: 1, slides: ['<svg/>'], transitions: ['none'], fonts: '', labels: { ...labels, page: '</script><b>{page}' } })
    expect(evil.match(/<\/script>/g)).toHaveLength(2) // données + lecteur, rien de plus
    expect(evil).toContain('\\u003c/script>')
  })
  it('transitions résolues par page dans les données', () => {
    const m = /<script type="application\/json" id="data">(.*?)<\/script>/.exec(html)!
    expect(JSON.parse(m[1])).toEqual({ tr: ['fade', 'slide'], page: 'Page {page} sur {total}' })
  })
  it('le lecteur est du JavaScript valide', () => {
    const code = /<script>([\s\S]*)<\/script>\s*<\/body>/.exec(html)![1]
    expect(() => new Function(code)).not.toThrow()
  })
})
