import { describe, expect, it } from 'vitest'
import { buildPresentationHtml, clipPayloads, clipsHtmlSize, clipVideos, inlineSvg, linkZones, prefixIds, voicePayloads, voicesHtmlSize, type HtmlLabels } from './htmlExport'

const labels: HtmlLabels = { lang: 'fr', page: 'Page {page} sur {total}', previous: 'Précédente', next: 'Suivante', fullscreen: 'Plein écran', help: 'Aide', noScript: 'JS requis', goPage: 'Aller à la page {n}', mute: 'Couper', unmute: 'Rétablir', replay: 'Réécouter', play: 'Lancer', pause: 'Pause' }
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

describe('clips vidéo dans la présentation web', () => {
  const clip = (id: string, extra: object = {}) => ({ id: 'el' + id, type: 'image', x: 192, y: 108, width: 960, height: 540, rotation: 0, opacity: 1, src: 'data:image/jpeg;base64,AA==', video: { id, duration: 10, ...extra } })
  const page = (elements: object[]) => ({ id: 'a', background: '#fff', elements }) as never
  const doc = (clips: Record<string, string>) => ({ width: 1920, height: 1080, clips, pages: [] as never[] })
  const mp4 = 'data:video/mp4;base64,AAAAIGZ0eXA='

  it('pose un lecteur à la place du clip, en pourcentages, avec ses réglages en attributs', () => {
    const html = clipVideos(doc({ k1: mp4 }), page([clip('k1', { loop: true, manual: true, muted: true, volume: 0.5, start: 2, end: 8, speed: 2 })]))
    expect(html).toContain('left:10%;top:10%;width:50%;height:50%')
    expect(html).toContain('data-clip="k1" data-start="2" data-end="8" data-speed="2" data-vol="0.5" data-loop data-manual data-muted')
    expect(html).toContain('preload="none"')
  })
  it('sans montage : tout le clip, vitesse et volume normaux, lecture automatique sans boucle', () => {
    const html = clipVideos(doc({ k1: mp4 }), page([clip('k1')]))
    expect(html).toContain('data-start="0" data-end="10" data-speed="1" data-vol="1"')
    expect(html).not.toMatch(/data-(loop|manual|muted)/)
  })
  it('garde la rotation, l\'opacité et la description', () => {
    const html = clipVideos(doc({ k1: mp4 }), page([{ ...clip('k1'), rotation: 15, opacity: 0.5, alt: 'Une "démo" <1>' }]))
    expect(html).toContain('--o:0.5;transform:rotate(15deg)')
    expect(html).toContain('aria-label="Une &quot;démo&quot; &lt;1&gt;"')
  })
  it('ignore un clip masqué, sans octets, ou une simple image', () => {
    expect(clipVideos(doc({ k1: mp4 }), page([{ ...clip('k1'), hidden: true }, clip('absent'), { ...clip('k1'), video: undefined }]))).toBe('')
  })
  it('les octets ne sont écrits qu\'une fois par clip, avec leur type', () => {
    const d = { ...doc({ k1: mp4, k2: 'data:video/webm;base64,GkXf', k3: mp4 }), pages: [page([clip('k1'), clip('k2')]), page([clip('k1')])] }
    expect(clipPayloads(d as never)).toEqual({ k1: { mime: 'video/mp4', data: 'AAAAIGZ0eXA=' }, k2: { mime: 'video/webm', data: 'GkXf' } })
    expect(clipsHtmlSize(d as never)).toBe('AAAAIGZ0eXA='.length + 'GkXf'.length)
  })
  it('refuse un clip dont le type n\'est pas une vidéo', () => {
    const d = { ...doc({ k1: 'data:text/html;base64,PHNjcmlwdD4=' }), pages: [page([clip('k1')])] }
    expect(clipPayloads(d as never)).toEqual({})
  })
  const withClips = buildPresentationHtml({ title: 't', width: 1920, height: 1080, slides: ['<svg/>'], transitions: ['none'], fonts: '', labels, clips: { k1: { mime: 'video/mp4', data: 'AAAAIGZ0eXA=' } } })
  it('le fichier porte les octets, lisibles sans réseau : seule la source locale est ajoutée à la politique de sécurité', () => {
    expect(withClips).toContain('<script type="text/plain" data-clip-data="k1" data-mime="video/mp4">AAAAIGZ0eXA=</script>')
    expect(withClips).toContain("default-src 'none'; img-src data:; media-src blob:;")
    expect(withClips).not.toMatch(/<script[^>]+src=/)
  })
  it('sans clip, le fichier est inchangé : pas de source vidéo autorisée', () => {
    const plain = buildPresentationHtml({ title: 't', width: 1, height: 1, slides: ['<svg/>'], transitions: ['none'], fonts: '', labels })
    expect(plain).not.toContain('media-src')
    expect(plain).not.toContain('type="text/plain"')
  })
  it('le lecteur reste du JavaScript valide, et le texte des clips ne referme aucun script', () => {
    const code = /<script>([\s\S]*)<\/script>\s*<\/body>/.exec(withClips)![1]
    expect(() => new Function(code)).not.toThrow()
    expect(withClips.match(/<\/script>/g)).toHaveLength(3) // clip + données + lecteur
  })
})

describe('voix off dans la présentation web', () => {
  const page = (id: string, voice?: { id: string; duration: number }) => ({ id, background: '#fff', elements: [], ...(voice ? { voice } : {}) })
  const doc = { voices: { v1: 'data:audio/webm;base64,GkXfowE=', v2: 'data:audio/ogg;base64,T2dnUw==', orphan: 'data:audio/webm;base64,AAAA' }, pages: [page('a', { id: 'v1', duration: 3 }), page('b'), page('c', { id: 'v2', duration: 2 }), page('d', { id: 'v1', duration: 3 })] }
  it('les octets de chaque voix utilisée, une seule fois, avec leur type', () => {
    expect(voicePayloads(doc as never)).toEqual({ v1: { mime: 'audio/webm', data: 'GkXfowE=' }, v2: { mime: 'audio/ogg', data: 'T2dnUw==' } })
    expect(voicesHtmlSize(doc as never)).toBe('GkXfowE='.length + 'T2dnUw=='.length)
  })
  it('refuse un son dont le type n\'est pas audio, ou une voix dont les octets manquent', () => {
    expect(voicePayloads({ voices: { v1: 'data:text/html;base64,PHNjcmlwdD4=' }, pages: [page('a', { id: 'v1', duration: 1 })] } as never)).toEqual({})
    expect(voicePayloads({ voices: {}, pages: [page('a', { id: 'v1', duration: 1 })] } as never)).toEqual({})
  })
  const html = buildPresentationHtml({ title: 't', width: 1920, height: 1080, slides: ['<svg/>', '<svg/>'], transitions: ['none', 'none'], fonts: '', labels, voices: { v1: { mime: 'audio/webm', data: 'GkXfowE=' } }, voiceIds: ['v1', null] })
  it('le fichier porte les octets, l\'identifiant de la voix de chaque page et le délai de départ', () => {
    expect(html).toContain('<script type="text/plain" data-voice-data="v1" data-mime="audio/webm">GkXfowE=</script>')
    const data = JSON.parse(/<script type="application\/json" id="data">(.*?)<\/script>/.exec(html)![1])
    expect(data.vo).toEqual(['v1', null])
    expect(data.vd).toBe(0.3)
  })
  it('la barre a le bouton de son et celui de la réécoute ; la politique de sécurité n\'ouvre que les sources locales', () => {
    expect(html).toContain('id="mute"')
    expect(html).toContain('id="replay"')
    expect(html).toContain("default-src 'none'; img-src data:; media-src blob:;")
    expect(html).not.toMatch(/<script[^>]+src=/)
  })
  it('sans voix, rien de tout cela : pas de bouton, pas de données, pas de source de média', () => {
    const plain = buildPresentationHtml({ title: 't', width: 1, height: 1, slides: ['<svg/>'], transitions: ['none'], fonts: '', labels })
    expect(plain).not.toContain('id="mute"')
    expect(plain).not.toContain('media-src')
    expect(plain).not.toContain('"vo"')
  })
  it('le lecteur reste du JavaScript valide', () => {
    expect(() => new Function(/<script>([\s\S]*)<\/script>\s*<\/body>/.exec(html)![1])).not.toThrow()
  })
})

describe('lecture automatique dans la présentation web', () => {
  const base = { title: 't', width: 1920, height: 1080, transitions: ['none', 'none'] as never, fonts: '', labels }
  const html = buildPresentationHtml({ ...base, slides: ['<svg/>', '<svg/>'], seconds: [4, 7.5] })
  it('le fichier porte la durée de chaque page et un bouton de lecture, arrêté au départ', () => {
    const data = JSON.parse(/<script type="application\/json" id="data">(.*?)<\/script>/.exec(html)![1])
    expect(data.au).toEqual([4, 7.5])
    expect(html).toContain('id="auto" aria-pressed="false"')
  })
  it('pas de bouton pour une page seule ni sans durées', () => {
    expect(buildPresentationHtml({ ...base, slides: ['<svg/>'], transitions: ['none'], seconds: [4] })).not.toContain('id="auto"')
    expect(buildPresentationHtml({ ...base, slides: ['<svg/>', '<svg/>'] })).not.toContain('id="auto"')
  })
  it('le lecteur reste du JavaScript valide', () => {
    expect(() => new Function(/<script>([\s\S]*)<\/script>\s*<\/body>/.exec(html)![1])).not.toThrow()
  })
})
