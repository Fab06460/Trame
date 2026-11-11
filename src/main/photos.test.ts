import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { sourcesFor, PHOTO_SOURCE_NAMES } from '../shared/photoSources'
import { PAGE_SIZE, clevelandUrl, commonsLicense, nasaUrl, parseCleveland, parseNasa, commonsUrl, creditOf, parseCommons, stripHtml, imageMime, isAllowedUrl, isReusable, licenseLabel, needsCredit, parseSearch, searchUrl } from './photos'

describe('photos', () => {
  it('adresse de recherche : usage commercial + modification, page et taille bornées', () => {
    const u = new URL(searchUrl('https://api.openverse.org/', '  chat noir ', 2))
    expect(u.pathname).toBe('/v1/images/')
    expect(u.searchParams.get('q')).toBe('chat noir')
    expect(u.searchParams.get('page')).toBe('2')
    expect(u.searchParams.get('page_size')).toBe(String(PAGE_SIZE))
    expect(u.searchParams.get('license_type')).toBe('commercial,modification')
    expect(u.searchParams.has('mature')).toBe(false)
    expect(new URL(searchUrl('https://x.test', 'a', 1, false)).searchParams.has('license_type')).toBe(false) // requête minimale
    expect(new URL(searchUrl('https://x.test', 'a', -4)).searchParams.get('page')).toBe('1')
    expect(new URL(searchUrl('https://x.test', 'a'.repeat(500), 1)).searchParams.get('q')).toHaveLength(100)
  })

  it('licences réutilisables : ni NC ni ND', () => {
    for (const l of ['cc0', 'pdm', 'by', 'by-sa', 'BY']) expect(isReusable(l)).toBe(true)
    for (const l of ['by-nc', 'by-nd', 'by-nc-sa', 'by-nc-nd', '', undefined, 4]) expect(isReusable(l)).toBe(false)
  })

  it('les résultats non réutilisables sont écartés (la requête minimale n\'a pas filtré)', () => {
    const r = parseSearch({ results: [{ id: 'a', url: 'https://i.test/a.jpg', license: 'by-nc' }, { id: 'b', url: 'https://i.test/b.jpg', license: 'by' }, { id: 'c', url: 'https://i.test/c.jpg', license: 'by-nd' }] })
    expect(r.photos.map((p) => p.id)).toEqual(['b'])
  })

  it('libellés de licence', () => {
    expect(licenseLabel('by', '4.0')).toBe('CC BY 4.0')
    expect(licenseLabel('by-sa', '3.0')).toBe('CC BY-SA 3.0')
    expect(licenseLabel('cc0', '1.0')).toBe('CC0 1.0')
    expect(licenseLabel('pdm', '1.0')).toBe('Domaine public')
    expect(licenseLabel(undefined, undefined)).toBe('Licence inconnue')
    expect(needsCredit('CC BY 4.0')).toBe(true)
    expect(needsCredit('CC0 1.0')).toBe(false)
    expect(needsCredit('Domaine public')).toBe(false)
  })

  it('adresses autorisées : https ; http local seulement en test', () => {
    expect(isAllowedUrl('https://a.test/x.jpg')).toBe(true)
    expect(isAllowedUrl('http://a.test/x.jpg')).toBe(false)
    expect(isAllowedUrl('file:///etc/passwd')).toBe(false)
    expect(isAllowedUrl('javascript:alert(1)')).toBe(false)
    expect(isAllowedUrl('http://127.0.0.1:8000/x')).toBe(false)
    expect(isAllowedUrl('http://127.0.0.1:8000/x', true)).toBe(true)
    expect(isAllowedUrl('http://evil.test/x', true)).toBe(false)
    expect(isAllowedUrl('pas une adresse')).toBe(false)
  })

  it('lecture tolérante d\'une réponse', () => {
    const r = parseSearch({
      page: 3, page_count: 9,
      results: [
        { id: 'a1', title: 'Un chat', creator: 'Ada', license: 'by', license_version: '4.0', url: 'https://img.test/a.jpg', thumbnail: 'https://api.test/t/a', foreign_landing_url: 'https://flickr.test/a', license_url: 'https://creativecommons.org/licenses/by/4.0/', width: 4000, height: 3000 },
        { id: 'b2', url: 'http://pas-https.test/b.jpg' }, // refusée
        { title: 'sans id', url: 'https://img.test/c.jpg' }, // refusée
        null,
        { id: 'd4', url: 'https://img.test/d.png', license: 'cc0', license_url: 'javascript:x' }
      ]
    })
    expect(r.page).toBe(3)
    expect(r.pageCount).toBe(9)
    expect(r.photos.map((p) => p.id)).toEqual(['a1', 'd4'])
    expect(r.photos[0]).toMatchObject({ license: 'CC BY 4.0', width: 4000, thumbnailUrl: 'https://api.test/t/a' })
    expect(r.photos[0].credit).toBe('« Un chat » par Ada (CC BY 4.0) — https://flickr.test/a')
    expect(r.photos[1].thumbnailUrl).toBe('https://img.test/d.png') // repli sur l'original
    expect(r.photos[1].licenseUrl).toBe('')
  })

  it('réponse invalide : aucune photo, jamais d\'erreur', () => {
    expect(parseSearch(null).photos).toEqual([])
    expect(parseSearch('x').photos).toEqual([])
    expect(parseSearch({ results: 'oops' }).photos).toEqual([])
  })

  it('crédit sans auteur', () => expect(creditOf({ title: '', creator: '', license: 'CC0 1.0', landingUrl: '' })).toBe('« Sans titre » (CC0 1.0)'))

  it('types d\'image acceptés', () => {
    expect(imageMime('image/jpeg; charset=binary')).toBe('image/jpeg')
    expect(imageMime('IMAGE/PNG')).toBe('image/png')
    expect(imageMime('image/svg+xml')).toBeNull()
    expect(imageMime('text/html')).toBeNull()
    expect(imageMime(null)).toBeNull()
  })
})

describe('Wikimedia Commons', () => {
  // réponse réelle de l'API (3 résultats), enregistrée le 26/10/2026
  const sample = JSON.parse(readFileSync(new URL('./commons-sample.json', import.meta.url), 'utf-8'))

  it('adresse de recherche : fichiers bitmap, 20 par page, décalage pour la suite', () => {
    const u = new URL(commonsUrl('https://commons.wikimedia.org/', ' mountain ', 3))
    expect(u.pathname).toBe('/w/api.php')
    expect(u.searchParams.get('generator')).toBe('search')
    expect(u.searchParams.get('gsrsearch')).toBe('mountain filetype:bitmap')
    expect(u.searchParams.get('gsrnamespace')).toBe('6')
    expect(u.searchParams.get('gsroffset')).toBe('40')
    expect(u.searchParams.get('gsrlimit')).toBe('20')
  })

  it('lit une vraie réponse : ordre de pertinence, licence, auteur sans HTML, miniature', () => {
    const r = parseCommons(sample, 1)
    expect(r.photos).toHaveLength(3)
    expect(r.photos[0].id).toBe('commons:' + sample.query.pages[Object.keys(sample.query.pages).find((k) => sample.query.pages[k].index === 1)!].pageid)
    const p = r.photos[0]
    expect(p).toMatchObject({ source: 'commons', license: 'CC BY 4.0', title: 'Himalayas, Ama Dablam, Nepal' })
    expect(p.creator).not.toContain('<')
    expect(p.thumbnailUrl).toContain('thumb.wikimedia.org')
    expect(p.url).toContain('upload.wikimedia.org')
    expect(p.credit).toContain('« Himalayas, Ama Dablam, Nepal »')
    expect(p.credit).toContain('(CC BY 4.0)')
    expect(r.pageCount).toBe(2) // la réponse propose une suite
  })

  it('licences : seules celles qui autorisent usage commercial et modification', () => {
    expect(commonsLicense('CC BY-SA 4.0')).toBe('CC BY-SA 4.0')
    expect(commonsLicense('CC BY 2.0')).toBe('CC BY 2.0')
    expect(commonsLicense('CC0')).toBe('CC0 1.0')
    expect(commonsLicense('Public domain')).toBe('Domaine public')
    expect(commonsLicense('PD-old-70')).toBe('Domaine public')
    for (const l of ['CC BY-NC 4.0', 'CC BY-ND 4.0', 'GFDL', 'Fair use', '', undefined]) expect(commonsLicense(l)).toBeNull()
  })

  it('écarte les entrées inutilisables', () => {
    const page = (over: object) => ({ pageid: 1, title: 'File:x.jpg', index: 1, imageinfo: [{ url: 'https://u.test/x.jpg', thumburl: 'https://t.test/x.jpg', mime: 'image/jpeg', width: 10, height: 10, extmetadata: { LicenseShortName: { value: 'CC BY 4.0' } }, ...over }] })
    const wrap = (p: object) => ({ query: { pages: { a: p } } })
    expect(parseCommons(wrap(page({})), 1).photos).toHaveLength(1)
    expect(parseCommons(wrap(page({ mime: 'image/svg+xml' })), 1).photos).toHaveLength(0)
    expect(parseCommons(wrap(page({ extmetadata: { LicenseShortName: { value: 'CC BY-NC 4.0' } } })), 1).photos).toHaveLength(0)
    expect(parseCommons(wrap(page({ url: 'http://pas-https.test/x.jpg' })), 1).photos).toHaveLength(0)
    expect(parseCommons(null, 1).photos).toEqual([])
    expect(parseCommons({ query: { pages: 4 } }, 1).photos).toEqual([])
    expect(parseCommons({}, 1).pageCount).toBe(1)
  })

  it('texte brut des métadonnées', () => {
    expect(stripHtml('<a href="x">Vya &amp; Co</a> &quot;ok&quot;')).toBe('Vya & Co "ok"')
    expect(stripHtml(undefined)).toBe('')
  })
})

describe('sources de photos', () => {
  it('« auto » : Commons puis Openverse ; un service choisi est seul interrogé', () => {
    expect(sourcesFor('auto')).toEqual(['commons', 'openverse'])
    expect(sourcesFor(undefined)).toEqual(['commons', 'openverse'])
    expect(sourcesFor('nope')).toEqual(['commons', 'openverse'])
    for (const s of ['commons', 'openverse', 'nasa', 'cleveland'] as const) expect(sourcesFor(s)).toEqual([s])
    expect(PHOTO_SOURCE_NAMES.nasa).toBe('NASA Images')
  })
})

describe('NASA Images', () => {
  const item = (id: string, over: Record<string, unknown> = {}, links?: unknown[]) => ({
    data: [{ nasa_id: id, title: 'Nearside of the Moon', media_type: 'image', secondary_creator: 'ISRO/NASA/JPL-Caltech', ...over }],
    links: links ?? [
      { href: `https://images-assets.nasa.gov/image/${id}/${id}~small.jpg`, rel: 'alternate', render: 'image', width: 640, height: 448 },
      { href: `https://images-assets.nasa.gov/image/${id}/${id}~thumb.jpg`, rel: 'preview', render: 'image', width: 640, height: 448 },
      { href: `https://images-assets.nasa.gov/image/${id}/${id}~orig.jpg`, rel: 'canonical', render: 'image', width: 2000, height: 1400 }
    ]
  })

  it('adresse : images seulement, 20 par page, page bornée', () => {
    const u = new URL(nasaUrl('https://images-api.nasa.gov/', ' lune ', 3))
    expect(u.pathname).toBe('/search')
    expect(u.searchParams.get('q')).toBe('lune')
    expect(u.searchParams.get('media_type')).toBe('image')
    expect(u.searchParams.get('page')).toBe('3')
    expect(u.searchParams.get('page_size')).toBe(String(PAGE_SIZE))
    expect(new URL(nasaUrl('https://x.test', 'a', -2)).searchParams.get('page')).toBe('1')
  })

  it('lit une réponse : original pour l\'insertion, aperçu pour la liste, crédit à l\'auteur, domaine public', () => {
    const r = parseNasa({ collection: { items: [item('PIA12235')], metadata: { total_hits: 20286 } } }, 1)
    expect(r.photos).toHaveLength(1)
    const p = r.photos[0]
    expect(p.id).toBe('nasa:PIA12235')
    expect(p.url).toBe('https://images-assets.nasa.gov/image/PIA12235/PIA12235~orig.jpg')
    expect(p.thumbnailUrl).toBe('https://images-assets.nasa.gov/image/PIA12235/PIA12235~thumb.jpg')
    expect(p.license).toBe('Domaine public')
    expect(p.creator).toBe('ISRO/NASA/JPL-Caltech')
    expect(p.landingUrl).toBe('https://images.nasa.gov/details/PIA12235')
    expect(p.width).toBe(2000)
    expect(p.credit).toContain('ISRO/NASA/JPL-Caltech')
    expect(r.pageCount).toBe(50) // plafonné
  })

  it('sans auteur : crédité à la NASA ; un original qui n\'est pas une image (tif) retombe sur l\'aperçu', () => {
    const links = [
      { href: 'https://images-assets.nasa.gov/image/X/X~thumb.jpg', rel: 'preview', render: 'image' },
      { href: 'https://images-assets.nasa.gov/image/X/X~orig.tif', rel: 'canonical', render: 'image' }
    ]
    const p = parseNasa({ collection: { items: [item('X', { secondary_creator: undefined }, links)], metadata: { total_hits: 1 } } }, 1).photos[0]
    expect(p.creator).toBe('NASA')
    expect(p.url).toBe('https://images-assets.nasa.gov/image/X/X~thumb.jpg')
  })

  it('écarte vidéos, entrées sans identifiant ou sans adresse https ; jamais d\'erreur', () => {
    const bad = { collection: { items: [item('V', { media_type: 'video' }), item('', {}), item('H', {}, [{ href: 'http://x.test/a.jpg', rel: 'preview', render: 'image' }]), { data: [] }, null, 4] } }
    expect(parseNasa(bad, 1).photos).toEqual([])
    for (const v of [null, 4, 'x', {}, { collection: 3 }]) expect(parseNasa(v, 1)).toEqual({ photos: [], page: 1, pageCount: 1 })
    expect(parseNasa({ collection: { items: [item('L')] } }, 1, true).photos).toHaveLength(1)
  })

  it('pagination d\'après le nombre total', () => {
    expect(parseNasa({ collection: { items: [], metadata: { total_hits: 45 } } }, 1).pageCount).toBe(3)
    expect(parseNasa({ collection: { items: [], metadata: { total_hits: 0 } } }, 1).pageCount).toBe(1)
  })
})

describe('Cleveland Museum of Art', () => {
  const art = (id: number, over: Record<string, unknown> = {}) => ({
    id, title: 'Water Lilies (Agapanthus)', share_license_status: 'CC0', url: `https://clevelandart.org/art/1960.${id}`,
    creators: [{ description: 'Claude Monet (French, 1840–1926)' }],
    images: { web: { url: `https://openaccess-cdn.clevelandart.org/${id}/web.jpg`, width: '1263', height: '871' }, print: { url: `https://openaccess-cdn.clevelandart.org/${id}/print.jpg`, width: '3400', height: '2344' }, full: { url: 'https://x.test/full.tif' } },
    ...over
  })

  it('adresse : CC0 avec image, décalage pour la suite', () => {
    const u = new URL(clevelandUrl('https://openaccess-api.clevelandart.org', ' monet ', 3))
    expect(u.pathname).toBe('/api/artworks/')
    expect(u.searchParams.get('q')).toBe('monet')
    expect(u.searchParams.get('cc0')).toBe('1')
    expect(u.searchParams.get('has_image')).toBe('1')
    expect(u.searchParams.get('limit')).toBe(String(PAGE_SIZE))
    expect(u.searchParams.get('skip')).toBe(String(2 * PAGE_SIZE))
  })

  it('lit une réponse : image « print » à l\'insertion, « web » dans la liste, auteur sans nationalité ni dates, CC0', () => {
    const r = parseCleveland({ info: { total: 18 }, data: [art(135382)] }, 1)
    const p = r.photos[0]
    expect(p.id).toBe('cleveland:135382')
    expect(p.url).toBe('https://openaccess-cdn.clevelandart.org/135382/print.jpg')
    expect(p.thumbnailUrl).toBe('https://openaccess-cdn.clevelandart.org/135382/web.jpg')
    expect(p.creator).toBe('Claude Monet')
    expect(p.license).toBe('CC0 1.0')
    expect(p.landingUrl).toBe('https://clevelandart.org/art/1960.135382')
    expect(p.width).toBe(3400)
    expect(p.credit).toBe('« Water Lilies (Agapanthus) » par Claude Monet (CC0 1.0) — https://clevelandart.org/art/1960.135382')
    expect(r.pageCount).toBe(1)
    expect(parseCleveland({ info: { total: 41 }, data: [] }, 1).pageCount).toBe(3)
  })

  it('écarte les œuvres non CC0, sans image ou sans identifiant ; jamais d\'erreur', () => {
    const bad = { data: [art(1, { share_license_status: 'Copyrighted' }), art(2, { images: null }), art(3, { images: { web: { url: 'http://x.test/a.jpg' } } }), art(0), null, 4] }
    expect(parseCleveland(bad, 1).photos).toEqual([])
    for (const v of [null, 4, 'x', {}, { data: 3 }]) expect(parseCleveland(v, 1)).toEqual({ photos: [], page: 1, pageCount: 1 })
  })

  it('sans « print », la version web sert aussi à l\'insertion', () => {
    const p = parseCleveland({ data: [art(7, { images: { web: { url: 'https://c.test/w.jpg', width: '10', height: '5' } } })] }, 1).photos[0]
    expect(p.url).toBe('https://c.test/w.jpg')
    expect(p.thumbnailUrl).toBe('https://c.test/w.jpg')
  })
})

describe('réponses réelles enregistrées (novembre 2026)', () => {
  it('NASA : la réponse du vrai service donne des photos exploitables', () => {
    const r = parseNasa(JSON.parse(readFileSync(new URL('./nasa-sample.json', import.meta.url), 'utf-8')), 1)
    expect(r.photos.length).toBeGreaterThanOrEqual(3)
    for (const p of r.photos) {
      expect(p.url).toMatch(/^https:\/\/images-assets\.nasa\.gov\/.+\.(jpg|png)$/)
      expect(p.thumbnailUrl).toMatch(/~(thumb|small)\.jpg$/)
      expect(p.title).not.toBe('')
    }
    expect(r.pageCount).toBe(50)
  })

  it('Cleveland : la réponse du vrai service donne des œuvres CC0 avec image', () => {
    const r = parseCleveland(JSON.parse(readFileSync(new URL('./cleveland-sample.json', import.meta.url), 'utf-8')), 1)
    expect(r.photos.length).toBeGreaterThanOrEqual(3)
    for (const p of r.photos) {
      expect(p.license).toBe('CC0 1.0')
      expect(p.url).toMatch(/^https:\/\/openaccess-cdn\.clevelandart\.org\/.+\.jpg$/)
      expect(p.landingUrl).toMatch(/^https:\/\/clevelandart\.org\/art\//)
    }
  })
})
