import { describe, expect, it } from 'vitest'
import { buildPresentationHtml, inlineSvg, linkZones, prefixIds, type HtmlLabels } from './htmlExport'

const labels: HtmlLabels = { lang: 'fr', page: 'Page {page} sur {total}', previous: 'Précédente', next: 'Suivante', fullscreen: 'Plein écran', help: 'Aide', noScript: 'JS requis', goPage: 'Aller à la page {n}' }
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

describe('linkZones', () => {
  const el = (id: string, extra: object) => ({ id, type: 'rect', x: 80, y: 60, width: 160, height: 120, rotation: 0, opacity: 1, fill: '#000', ...extra })
  const doc = { width: 800, height: 600, pages: [{ id: 'a', background: '#fff', elements: [] }, { id: 'b', background: '#fff', elements: [] }] }
  const page = (elements: object[]) => ({ id: 'a', background: '#fff', elements }) as never
  it('pose un lien web qui s\'ouvre ailleurs, en pourcentages de la page', () => {
    const html = linkZones(doc as never, page([el('1', { link: { url: 'https://exemple.fr/?a=1&b=2' } })]), 'Aller à la page {n}')
    expect(html).toContain('href="https://exemple.fr/?a=1&amp;b=2"')
    expect(html).toContain('target="_blank" rel="noopener noreferrer"')
    expect(html).toContain('left:10%;top:10%;width:20%;height:20%')
  })
  it('pose un lien de page avec son rang', () => {
    const html = linkZones(doc as never, page([el('1', { link: { page: 'b' } })]), 'Aller à la page {n}')
    expect(html).toContain('data-go="1"')
    expect(html).toContain('href="#2"')
    expect(html).toContain('aria-label="Aller à la page 2"')
  })
  it('n\'écrit rien pour un élément masqué, un lien cassé ou sans lien', () => {
    expect(linkZones(doc as never, page([el('1', { link: { url: 'https://exemple.fr/' }, hidden: true }), el('2', { link: { page: 'x' } }), el('3', {})]), 'x')).toBe('')
  })
  it('le lecteur gère le clic sur une zone', () => {
    const html = buildPresentationHtml({ title: 't', width: 1, height: 1, slides: ['<svg/>'], transitions: ['none'], fonts: '', labels })
    expect(html).toContain("closest('a.lk')")
  })
})
