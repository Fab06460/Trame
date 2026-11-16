import { DOMParser } from '@xmldom/xmldom'
import JSZip from 'jszip'
import { beforeAll, describe, expect, it } from 'vitest'
import { setXmlParser } from '@/pptxImport/xml'
import { parseOdt } from './odt'

beforeAll(() => setXmlParser((t) => new DOMParser().parseFromString(t, 'application/xml') as unknown as Document))

const NS = 'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0" xmlns:xlink="http://www.w3.org/1999/xlink"'
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

const p = (text: string, style = 'Standard'): string => `<text:p text:style-name="${style}">${text}</text:p>`
const h = (text: string, level: number): string => `<text:h text:style-name="Heading_20_${level}" text:outline-level="${level}">${text}</text:h>`
const frame = (href: string, w = '10cm', hgt = '5cm', desc = ''): string =>
  `<text:p><draw:frame draw:name="i" svg:width="${w}" svg:height="${hgt}"><draw:image xlink:href="${href}"/>${desc ? `<svg:desc>${desc}</svg:desc>` : ''}</draw:frame></text:p>`

const STYLES = `<office:document-styles ${NS}><office:styles>
  <style:style style:name="Title" style:display-name="Title" style:family="paragraph"/>
  <style:style style:name="Titre_20_perso" style:display-name="Titre perso" style:family="paragraph" style:parent-style-name="Title"/>
  <style:style style:name="Heading_20_1" style:display-name="Heading 1" style:family="paragraph" style:default-outline-level="1"/>
  <style:style style:name="Chapitre" style:family="paragraph" style:default-outline-level="2"/>
  <style:style style:name="Chapitre_20_enfant" style:family="paragraph" style:parent-style-name="Chapitre"/>
  <text:list-style style:name="Puces"><text:list-level-style-bullet text:level="1"/><text:list-level-style-bullet text:level="2"/></text:list-style>
  <text:list-style style:name="Numeros"><text:list-level-style-number text:level="1"/><text:list-level-style-number text:level="2"/></text:list-style>
</office:styles></office:document-styles>`

async function odt(body: string, auto = ''): Promise<Uint8Array> {
  const zip = new JSZip()
  zip.file('mimetype', 'application/vnd.oasis.opendocument.text')
  zip.file('content.xml', `<office:document-content ${NS}><office:automatic-styles>${auto}</office:automatic-styles><office:body><office:text>${body}</office:text></office:body></office:document-content>`)
  zip.file('styles.xml', STYLES)
  zip.file('Pictures/image1.png', PNG, { base64: true })
  zip.file('Pictures/image2.emf', 'EMF')
  return zip.generateAsync({ type: 'uint8array' })
}

describe('LibreOffice (.odt) vers un plan', () => {
  it('lit les titres (niveau de l\'élément ou du style), le titre du document et les paragraphes', async () => {
    const o = await parseOdt(await odt(p('Mon cours', 'Title') + h('Chapitre', 1) + h('Section', 2) + p('Texte courant.') + p('Titre par style', 'Chapitre_20_enfant')))
    expect(o.title).toBe('Mon cours')
    expect(o.blocks).toEqual([
      { kind: 'heading', level: 1, text: 'Chapitre' },
      { kind: 'heading', level: 2, text: 'Section' },
      { kind: 'para', text: 'Texte courant.' },
      { kind: 'heading', level: 2, text: 'Titre par style' }
    ])
  })

  it('un style qui hérite du style « Titre » donne aussi le titre du document', async () => {
    const o = await parseOdt(await odt(p('Sous-style', 'Titre_20_perso') + p('Corps')))
    expect(o.title).toBe('Sous-style')
    expect(o.blocks).toEqual([{ kind: 'para', text: 'Corps' }])
  })

  it('joint les passages (spans, liens), les espaces et les tabulations, ignore les notes de bas de page', async () => {
    const para = '<text:p>Bonjour <text:span text:style-name="T1">le</text:span> <text:a xlink:href="https://exemple.fr">monde</text:a><text:s text:c="2"/>!<text:tab/>fin<text:line-break/>suite<text:note><text:note-body><text:p>note</text:p></text:note-body></text:note></text:p>'
    expect((await parseOdt(await odt(para))).blocks).toEqual([{ kind: 'para', text: 'Bonjour le monde ! fin suite' }])
  })

  it('lit les listes à puces et numérotées, imbriquées, avec leur niveau', async () => {
    const li = (t: string, inner = ''): string => `<text:list-item>${p(t)}${inner}</text:list-item>`
    const bullets = `<text:list text:style-name="Puces">${li('puce', `<text:list>${li('sous-puce')}</text:list>`)}</text:list>`
    const numbers = `<text:list text:style-name="Numeros">${li('premier', `<text:list>${li('sous-numéro')}</text:list>`)}</text:list>`
    const o = await parseOdt(await odt(bullets + numbers))
    expect(o.blocks).toEqual([
      { kind: 'item', level: 0, ordered: false, text: 'puce' },
      { kind: 'item', level: 1, ordered: false, text: 'sous-puce' },
      { kind: 'item', level: 0, ordered: true, text: 'premier' },
      { kind: 'item', level: 1, ordered: true, text: 'sous-numéro' }
    ])
  })

  it('convertit un tableau en une ligne par rangée et le compte', async () => {
    const cell = (t: string): string => `<table:table-cell>${p(t)}</table:table-cell>`
    const tbl = `<table:table><table:table-row>${cell('Nom')}${cell('Note')}</table:table-row><table:table-row>${cell('Léa')}${cell('18')}</table:table-row></table:table>`
    const o = await parseOdt(await odt(tbl + p('Après')))
    expect(o.blocks).toEqual([{ kind: 'para', text: 'Nom | Note' }, { kind: 'para', text: 'Léa | 18' }, { kind: 'para', text: 'Après' }])
    expect(o.notes.tables).toBe(1)
  })

  it('reprend une image (proportions, texte alternatif) et signale celles qu\'il ne sait pas lire', async () => {
    const o = await parseOdt(await odt(p('Avant') + frame('Pictures/image1.png', '10cm', '5cm', 'Un pixel') + frame('Pictures/image2.emf') + frame('Pictures/absente.png') + frame('../secret.png') + frame('https://exemple.fr/x.png')))
    expect(o.blocks[0]).toEqual({ kind: 'para', text: 'Avant' })
    expect(o.blocks[1]).toMatchObject({ kind: 'image', alt: 'Un pixel' })
    expect((o.blocks[1] as { ratio: number }).ratio).toBeCloseTo(2, 5)
    expect((o.blocks[1] as { src: string }).src.startsWith('data:image/png;base64,')).toBe(true)
    expect(o.blocks).toHaveLength(2)
    expect(o.notes.skippedImages).toBe(4)
  })

  it('un saut de page voulu devient un saut dans le plan, mais pas celui du premier paragraphe', async () => {
    const auto = '<style:style style:name="P1" style:family="paragraph"><style:paragraph-properties fo:break-before="page"/></style:style><style:style style:name="P2" style:family="paragraph" style:master-page-name="Standard"/>'
    const o = await parseOdt(await odt(p('Début', 'P2') + p('Avant') + p('Après', 'P1') + p('Fin'), auto))
    expect(o.blocks.map((b) => b.kind)).toEqual(['para', 'para', 'break', 'para', 'para'])
  })

  it('traverse une section et saute la table des matières ; ignore les paragraphes vides', async () => {
    const o = await parseOdt(await odt(p('') + `<text:section>${p('Dans la section')}</text:section><text:table-of-content><text:index-body>${p('Sommaire')}</text:index-body></text:table-of-content>` + p('   ')))
    expect(o.blocks).toEqual([{ kind: 'para', text: 'Dans la section' }])
  })

  it('refuse un fichier qui n\'est pas un document OpenDocument', async () => {
    const zip = new JSZip()
    zip.file('autre.txt', 'x')
    await expect(parseOdt(await zip.generateAsync({ type: 'uint8array' }))).rejects.toThrow()
  })
})
