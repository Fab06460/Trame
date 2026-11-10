import { DOMParser } from '@xmldom/xmldom'
import JSZip from 'jszip'
import { beforeAll, describe, expect, it } from 'vitest'
import { setXmlParser } from '@/pptxImport/xml'
import { parseDocx } from './docx'

beforeAll(() => setXmlParser((t) => new DOMParser().parseFromString(t, 'application/xml') as unknown as Document))

const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"'
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

const para = (text: string, style?: string, extra = ''): string => `<w:p><w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ''}${extra}</w:pPr><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`
const item = (text: string, numId: string, ilvl = 0): string => para(text, 'Paragraphedeliste', `<w:numPr><w:ilvl w:val="${ilvl}"/><w:numId w:val="${numId}"/></w:numPr>`)
const drawing = (rid: string, cx = 1905000, cy = 952500, descr = ''): string =>
  `<w:p><w:r><w:drawing><wp:inline><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="1" name="Image 1" descr="${descr}"/><a:graphic><a:graphicData><a:blip r:embed="${rid}"/></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`

const STYLES = `<w:styles ${NS}>
  <w:style w:type="paragraph" w:styleId="Titre1"><w:name w:val="heading 1"/></w:style>
  <w:style w:type="paragraph" w:styleId="Titre2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/></w:style>
  <w:style w:type="paragraph" w:styleId="Sous-titre3"><w:name w:val="heading 3"/><w:basedOn w:val="Titre2"/></w:style>
  <w:style w:type="paragraph" w:styleId="Titre"><w:name w:val="Title"/></w:style>
  <w:style w:type="paragraph" w:styleId="Paragraphedeliste"><w:name w:val="List Paragraph"/></w:style>
  <w:style w:type="paragraph" w:styleId="Listepuces"><w:name w:val="List Bullet"/></w:style>
  <w:style w:type="paragraph" w:styleId="Perso"><w:name w:val="Mon titre"/><w:pPr><w:outlineLvl w:val="1"/></w:pPr></w:style>
  <w:style w:type="paragraph" w:styleId="PersoEnfant"><w:name w:val="Enfant"/><w:basedOn w:val="Perso"/></w:style>
</w:styles>`
const NUMBERING = `<w:numbering ${NS}>
  <w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/></w:lvl><w:lvl w:ilvl="1"><w:numFmt w:val="bullet"/></w:lvl></w:abstractNum>
  <w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/></w:lvl><w:lvl w:ilvl="1"><w:numFmt w:val="lowerLetter"/></w:lvl></w:abstractNum>
  <w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
  <w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>
</w:numbering>`
const RELS = `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/>
  <Relationship Id="rId6" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image2.emf"/>
  <Relationship Id="rId7" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://exemple.fr" TargetMode="External"/>
</Relationships>`

async function docx(body: string, parts: { styles?: string; numbering?: string; rels?: string } = {}): Promise<Uint8Array> {
  const zip = new JSZip()
  zip.file('word/document.xml', `<w:document ${NS}><w:body>${body}</w:body></w:document>`)
  zip.file('word/styles.xml', parts.styles ?? STYLES)
  zip.file('word/numbering.xml', parts.numbering ?? NUMBERING)
  zip.file('word/_rels/document.xml.rels', parts.rels ?? RELS)
  zip.file('word/media/image1.png', PNG, { base64: true })
  zip.file('word/media/image2.emf', 'EMF')
  return zip.generateAsync({ type: 'uint8array' })
}

describe('Word (.docx) vers un plan', () => {
  it('reconnaît les titres par leur style (noms français ou anglais, héritage compris) et le titre du document', async () => {
    const o = await parseDocx(await docx(para('Mon cours', 'Titre') + para('Chapitre', 'Titre1') + para('Section', 'Titre2') + para('Détail', 'Sous-titre3') + para('Texte courant.')))
    expect(o.title).toBe('Mon cours')
    expect(o.blocks).toEqual([
      { kind: 'heading', level: 1, text: 'Chapitre' },
      { kind: 'heading', level: 2, text: 'Section' },
      { kind: 'heading', level: 3, text: 'Détail' },
      { kind: 'para', text: 'Texte courant.' }
    ])
  })

  it('un niveau hiérarchique (direct ou hérité d’un style personnalisé) fait un titre', async () => {
    const o = await parseDocx(await docx(para('Direct', undefined, '<w:outlineLvl w:val="0"/>') + para('Perso', 'Perso') + para('Enfant', 'PersoEnfant') + para('Corps', undefined, '<w:outlineLvl w:val="9"/>')))
    expect(o.blocks).toEqual([
      { kind: 'heading', level: 1, text: 'Direct' },
      { kind: 'heading', level: 2, text: 'Perso' },
      { kind: 'heading', level: 2, text: 'Enfant' },
      { kind: 'para', text: 'Corps' }
    ])
  })

  it('joint les passages d’un paragraphe, y compris dans un lien, et ignore le texte supprimé', async () => {
    const p = '<w:p><w:r><w:t xml:space="preserve">Bonjour </w:t></w:r><w:hyperlink r:id="rId7"><w:r><w:t>le monde</w:t></w:r></w:hyperlink><w:r><w:tab/><w:t>!</w:t></w:r><w:del><w:r><w:delText>supprimé</w:delText></w:r></w:del></w:p>'
    expect((await parseDocx(await docx(p))).blocks).toEqual([{ kind: 'para', text: 'Bonjour le monde !' }])
  })

  it('lit les listes à puces et numérotées avec leur niveau, d’après la numérotation du fichier', async () => {
    const o = await parseDocx(await docx(item('puce', '1') + item('sous-puce', '1', 1) + item('premier', '2') + item('sous-lettre', '2', 1) + para('liste par style', 'Listepuces')))
    expect(o.blocks).toEqual([
      { kind: 'item', level: 0, ordered: false, text: 'puce' },
      { kind: 'item', level: 1, ordered: false, text: 'sous-puce' },
      { kind: 'item', level: 0, ordered: true, text: 'premier' },
      { kind: 'item', level: 1, ordered: true, text: 'sous-lettre' },
      { kind: 'item', level: 0, ordered: false, text: 'liste par style' }
    ])
  })

  it('un titre numéroté reste un titre, un numId 0 n’est pas une liste', async () => {
    const o = await parseDocx(await docx(para('Titre numéroté', 'Titre1', '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="2"/></w:numPr>') + item('pas une liste', '0')))
    expect(o.blocks).toEqual([{ kind: 'heading', level: 1, text: 'Titre numéroté' }, { kind: 'para', text: 'pas une liste' }])
  })

  it('convertit un tableau en une ligne par rangée et le compte', async () => {
    const cell = (t: string): string => `<w:tc>${para(t)}</w:tc>`
    const tbl = `<w:tbl><w:tr>${cell('Nom')}${cell('Note')}</w:tr><w:tr>${cell('Léa')}${cell('18')}</w:tr></w:tbl>`
    const o = await parseDocx(await docx(tbl + para('Après')))
    expect(o.blocks).toEqual([{ kind: 'para', text: 'Nom | Note' }, { kind: 'para', text: 'Léa | 18' }, { kind: 'para', text: 'Après' }])
    expect(o.notes.tables).toBe(1)
  })

  it('reprend une image (data URL, proportions, texte alternatif) et signale celle qu’il ne sait pas lire', async () => {
    const o = await parseDocx(await docx(para('Avant') + drawing('rId5', 2000000, 1000000, 'Un pixel') + drawing('rId6') + drawing('rIdInconnu')))
    expect(o.blocks[0]).toEqual({ kind: 'para', text: 'Avant' })
    expect(o.blocks[1]).toMatchObject({ kind: 'image', alt: 'Un pixel', ratio: 2 })
    expect(o.blocks[1].kind === 'image' && o.blocks[1].src.startsWith('data:image/png;base64,')).toBe(true)
    expect(o.blocks).toHaveLength(2)
    expect(o.notes.skippedImages).toBe(2)
  })

  it('un saut de page voulu devient un saut dans le plan', async () => {
    const withBreak = '<w:p><w:r><w:t>avant</w:t></w:r><w:r><w:br w:type="page"/></w:r></w:p>'
    const o = await parseDocx(await docx(withBreak + para('après', undefined, '<w:pageBreakBefore/>')))
    expect(o.blocks.map((b) => b.kind)).toEqual(['para', 'break', 'break', 'para'])
  })

  it('traverse un contrôle de contenu et ignore les paragraphes vides', async () => {
    const sdt = `<w:sdt><w:sdtPr><w:alias w:val="x"/></w:sdtPr><w:sdtContent>${para('Dans le contrôle')}</w:sdtContent></w:sdt>`
    const o = await parseDocx(await docx(para('') + sdt + para('   ')))
    expect(o.blocks).toEqual([{ kind: 'para', text: 'Dans le contrôle' }])
  })

  it('fonctionne sans styles ni numérotation, et refuse un fichier qui n’est pas un document Word', async () => {
    const zip = new JSZip()
    zip.file('word/document.xml', `<w:document ${NS}><w:body>${para('Seul')}</w:body></w:document>`)
    expect((await parseDocx(await zip.generateAsync({ type: 'uint8array' }))).blocks).toEqual([{ kind: 'para', text: 'Seul' }])
    const other = new JSZip()
    other.file('ppt/presentation.xml', '<x/>')
    await expect(parseDocx(await other.generateAsync({ type: 'uint8array' }))).rejects.toThrow()
    await expect(parseDocx(new Uint8Array([1, 2, 3, 4]))).rejects.toThrow()
  })
})
