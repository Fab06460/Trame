import { describe, expect, it } from 'vitest'
import { PAGE_SIZE, creditOf, imageMime, isAllowedUrl, licenseLabel, needsCredit, parseSearch, searchUrl } from './photos'

describe('photos', () => {
  it('adresse de recherche : usage commercial + modification, page et taille bornées', () => {
    const u = new URL(searchUrl('https://api.openverse.org/', '  chat noir ', 2))
    expect(u.pathname).toBe('/v1/images/')
    expect(u.searchParams.get('q')).toBe('chat noir')
    expect(u.searchParams.get('page')).toBe('2')
    expect(u.searchParams.get('page_size')).toBe(String(PAGE_SIZE))
    expect(u.searchParams.get('license_type')).toBe('commercial,modification')
    expect(new URL(searchUrl('https://x.test', 'a', -4)).searchParams.get('page')).toBe('1')
    expect(new URL(searchUrl('https://x.test', 'a'.repeat(500), 1)).searchParams.get('q')).toHaveLength(100)
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
