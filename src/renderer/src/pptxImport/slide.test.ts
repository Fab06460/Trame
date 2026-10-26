import { DOMParser } from '@xmldom/xmldom'
import { beforeAll, describe, expect, it } from 'vitest'
import { DEFAULT_COLOR_MAP, type Theme } from '@/pptxImport/colors'
import { EMU_PER_PX, custGeomPath, finalizeText, parseSlideTree, type SlideContext } from '@/pptxImport/slide'
import { kid, parseXml, setXmlParser } from '@/pptxImport/xml'

const theme: Theme = { colors: { dk1: '000000', lt1: 'ffffff', accent1: 'ff0000' }, major: 'Montserrat', minor: 'Inter' }
const ctx = (over: Partial<SlideContext> = {}): SlideContext => ({
  theme, colorMap: DEFAULT_COLOR_MAP, background: '#ffffff', image: (id) => (id === 'rId2' ? 'data:image/png;base64,AAAA' : null),
  placeholder: () => null, txStyle: () => null, ...over
})
const E = EMU_PER_PX
const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'
const tree = (inner: string, c = ctx()) => parseSlideTree(parseXml(`<p:spTree ${NS}>${inner}</p:spTree>`).documentElement, c)
const xfrm = (x: number, y: number, w: number, h: number, extra = '') => `<a:xfrm ${extra}><a:off x="${x * E}" y="${y * E}"/><a:ext cx="${w * E}" cy="${h * E}"/></a:xfrm>`

beforeAll(() => setXmlParser((t) => new DOMParser().parseFromString(t, 'application/xml') as unknown as Document))

describe('formes', () => {
  it('un rectangle plein avec contour et ombre', () => {
    const r = tree(`<p:sp><p:nvSpPr><p:cNvPr id="2" name="r"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm(100, 50, 200, 100)}<a:prstGeom prst="rect"/><a:solidFill><a:srgbClr val="7C5CFF"/></a:solidFill><a:ln w="${6 * E}"><a:solidFill><a:srgbClr val="000000"/></a:solidFill><a:prstDash val="dash"/></a:ln><a:effectLst><a:outerShdw blurRad="${10 * E}" dist="${8 * E}" dir="5400000"><a:srgbClr val="000000"><a:alpha val="40000"/></a:srgbClr></a:outerShdw></a:effectLst></p:spPr></p:sp>`)
    expect(r.drafts).toHaveLength(1)
    expect(r.drafts[0].el).toMatchObject({ type: 'rect', x: 100, y: 50, width: 200, height: 100, fill: '#7c5cff', stroke: '#000000', strokeWidth: 6, strokeDashed: true })
    expect(r.drafts[0].el.shadow).toMatchObject({ blur: 10, offsetX: 0, offsetY: 8, opacity: 0.4 })
  })
  it('rectangle arrondi : rayon = fraction du plus petit côté', () => {
    const r = tree(`<p:sp><p:nvSpPr><p:cNvPr id="2" name="r"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm(0, 0, 200, 100)}<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val 50000"/></a:avLst></a:prstGeom><a:solidFill><a:srgbClr val="FF0000"/></a:solidFill></p:spPr></p:sp>`)
    expect(r.drafts[0].el.cornerRadius).toBe(50)
  })
  it('ellipse avec dégradé linéaire (angle OOXML → CSS)', () => {
    const r = tree(`<p:sp><p:nvSpPr><p:cNvPr id="2" name="e"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm(0, 0, 100, 100)}<a:prstGeom prst="ellipse"/><a:gradFill><a:gsLst><a:gs pos="0"><a:srgbClr val="FF0000"/></a:gs><a:gs pos="100000"><a:srgbClr val="0000FF"/></a:gs></a:gsLst><a:lin ang="0"/></a:gradFill></p:spPr></p:sp>`)
    expect(r.drafts[0].el).toMatchObject({ type: 'ellipse', gradient: { type: 'linear', from: '#ff0000', to: '#0000ff', angle: 90 } })
  })
  it('forme prédéfinie connue → forme Trame ; inconnue → rectangle signalé', () => {
    const mk = (prst: string) => `<p:sp><p:nvSpPr><p:cNvPr id="2" name="s"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm(0, 0, 50, 50)}<a:prstGeom prst="${prst}"/><a:solidFill><a:srgbClr val="000000"/></a:solidFill></p:spPr></p:sp>`
    const star = tree(mk('star5'))
    expect(star.drafts[0].el.type).toBe('path')
    const odd = tree(mk('mathDivide'))
    expect(odd.drafts[0].el.type).toBe('rect')
    expect(odd.unsupported.join()).toContain('mathDivide')
  })
  it('rotation : le coin haut-gauche est recalé (PowerPoint pivote autour du centre)', () => {
    const r = tree(`<p:sp><p:nvSpPr><p:cNvPr id="2" name="r"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm(100, 100, 200, 100, `rot="${90 * 60000}"`)}<a:prstGeom prst="rect"/><a:solidFill><a:srgbClr val="000000"/></a:solidFill></p:spPr></p:sp>`)
    const el = r.drafts[0].el
    expect(el.rotation).toBe(90)
    // centre (200, 150) ; haut-gauche tourné de 90° autour du centre : (200 + 50, 150 - 100)
    expect(el.x).toBeCloseTo(250)
    expect(el.y).toBeCloseTo(50)
  })
  it('un trait horizontal devient un rectangle de l\'épaisseur du trait', () => {
    const r = tree(`<p:cxnSp><p:nvCxnSpPr><p:cNvPr id="2" name="l"/><p:cNvCxnSpPr/><p:nvPr/></p:nvCxnSpPr><p:spPr>${xfrm(10, 20, 300, 0)}<a:prstGeom prst="line"/><a:ln w="${4 * E}"><a:solidFill><a:srgbClr val="FF0000"/></a:solidFill></a:ln></p:spPr></p:cxnSp>`)
    expect(r.drafts[0].el).toMatchObject({ type: 'rect', width: 300, height: 4, fill: '#ff0000' })
  })
  it('forme libre (custGeom) → chemin 100 × 100', () => {
    const g = parseXml(`<a:custGeom ${NS}><a:pathLst><a:path w="200" h="100"><a:moveTo><a:pt x="0" y="0"/></a:moveTo><a:lnTo><a:pt x="200" y="0"/></a:lnTo><a:lnTo><a:pt x="100" y="100"/></a:lnTo><a:close/></a:path></a:pathLst></a:custGeom>`).documentElement
    expect(custGeomPath(g)).toBe('M0 0 L100 0 L50 100 Z')
    const arc = parseXml(`<a:custGeom ${NS}><a:pathLst><a:path w="10" h="10"><a:arcTo wR="1" hR="1" stAng="0" swAng="10"/></a:path></a:pathLst></a:custGeom>`).documentElement
    expect(custGeomPath(arc)).toBeNull()
  })
})

describe('images et groupes', () => {
  it('une image avec recadrage, miroir et transparence', () => {
    const r = tree(`<p:pic><p:nvPicPr><p:cNvPr id="3" name="i"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rId2"><a:alphaModFix amt="50000"/></a:blip><a:srcRect l="25000" r="25000"/></p:blipFill><p:spPr><a:xfrm flipH="1"><a:off x="${10 * E}" y="${10 * E}"/><a:ext cx="${100 * E}" cy="${50 * E}"/></a:xfrm></p:spPr></p:pic>`)
    expect(r.drafts[0].el).toMatchObject({ type: 'image', src: 'data:image/png;base64,AAAA', opacity: 0.5, flipX: true, crop: { x: 0.25, y: 0, width: 0.5, height: 1 } })
  })
  it('image introuvable ou format non pris en charge : signalée', () => {
    const r = tree(`<p:pic><p:nvPicPr><p:cNvPr id="3" name="i"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rId9"/></p:blipFill><p:spPr>${xfrm(0, 0, 10, 10)}</p:spPr></p:pic>`)
    expect(r.drafts).toHaveLength(0)
    expect(r.unsupported.join()).toContain('format non pris en charge')
  })
  it('un groupe applique sa transformation à ses membres et les réunit', () => {
    const member = (x: number) => `<p:sp><p:nvSpPr><p:cNvPr id="2" name="m"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm(x, 0, 10, 10)}<a:prstGeom prst="rect"/><a:solidFill><a:srgbClr val="000000"/></a:solidFill></p:spPr></p:sp>`
    const r = tree(`<p:grpSp><p:nvGrpSpPr><p:cNvPr id="9" name="g"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="${100 * E}" y="${100 * E}"/><a:ext cx="${200 * E}" cy="${20 * E}"/><a:chOff x="0" y="0"/><a:chExt cx="${100 * E}" cy="${10 * E}"/></a:xfrm></p:grpSpPr>${member(0)}${member(50)}</p:grpSp>`)
    const [a, b] = r.drafts.map((d) => d.el)
    expect(a).toMatchObject({ x: 100, y: 100, width: 20, height: 20 }) // échelle 2
    expect(b.x).toBe(200)
    expect(a.groupId).toBeTruthy()
    expect(a.groupId).toBe(b.groupId)
  })
  it('un tableau est signalé', () => {
    const r = tree(`<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="4" name="t"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"/></a:graphic></p:graphicFrame>`)
    expect(r.unsupported).toEqual(['tableau'])
  })
})

describe('texte', () => {
  const textShape = (body: string, extra = '', fill = '') => `<p:sp><p:nvSpPr><p:cNvPr id="2" name="t"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm(100, 100, 400, 100)}<a:prstGeom prst="rect"/>${fill || '<a:noFill/>'}</p:spPr><p:txBody><a:bodyPr ${extra}/><a:lstStyle/>${body}</p:txBody></p:sp>`
  it('un texte mis en forme', () => {
    const r = tree(textShape(`<a:p><a:pPr algn="ctr"/><a:r><a:rPr lang="fr-FR" sz="3600" b="1" u="sng" spc="300"><a:solidFill><a:srgbClr val="D6336C"/></a:solidFill><a:latin typeface="Montserrat"/></a:rPr><a:t>Bonjour</a:t></a:r></a:p><a:p><a:r><a:rPr sz="3600"/><a:t>Deux</a:t></a:r></a:p>`))
    expect(r.drafts).toHaveLength(1) // pas de forme visible (sans remplissage ni contour) : seulement le texte
    const el = r.drafts[0].el
    expect(el).toMatchObject({ type: 'text', text: 'Bonjour\nDeux', fill: '#d6336c', align: 'center', underline: true, fontFamily: '"Montserrat", sans-serif', fontStyle: 'bold' })
    expect(el.fontSize).toBe(48) // 36 pt
    expect(el.letterSpacing).toBe(4) // 3 pt
    expect(el.width).toBeCloseTo(400 - 2 * 9.6) // marges par défaut de 0,1 po
    expect(r.substitutedFonts).toEqual([])
  })
  it('police absente : remplacée et signalée ; police du thème (+mn-lt)', () => {
    const r = tree(textShape(`<a:p><a:r><a:rPr sz="2000"><a:latin typeface="Comic Neue"/></a:rPr><a:t>x</a:t></a:r></a:p>`))
    expect(r.substitutedFonts).toEqual(['Comic Neue'])
    const t = tree(textShape(`<a:p><a:r><a:rPr sz="2000"><a:latin typeface="+mj-lt"/></a:rPr><a:t>x</a:t></a:r></a:p>`))
    expect(t.drafts[0].el.fontFamily).toContain('Montserrat')
  })
  it('liste à puces, interligne, majuscules, taille réduite par ajustement automatique', () => {
    const r = tree(textShape(`<a:p><a:pPr><a:lnSpc><a:spcPct val="150000"/></a:lnSpc><a:buChar char="•"/></a:pPr><a:r><a:rPr sz="2000" cap="all"/><a:t>un</a:t></a:r></a:p>`, '', '').replace('<a:bodyPr />', '<a:bodyPr><a:normAutofit fontScale="50000"/></a:bodyPr>'))
    const el = r.drafts[0].el
    expect(el).toMatchObject({ list: 'bullet', uppercase: true, lineHeight: 1.8 })
    expect(el.fontSize).toBeCloseTo(13.3, 1) // 20 pt × 50 %
  })
  it('texte dans une forme pleine : la forme ET le texte, le texte au-dessus', () => {
    const r = tree(textShape(`<a:p><a:r><a:rPr sz="2000"/><a:t>OK</a:t></a:r></a:p>`, '', '<a:solidFill><a:srgbClr val="222222"/></a:solidFill>'))
    expect(r.drafts.map((d) => d.el.type)).toEqual(['rect', 'text'])
  })
  it('couleur par défaut : texte du thème (tx1) ; couleur de style (fontRef) sur forme', () => {
    const r = tree(textShape(`<a:p><a:r><a:rPr sz="2000"/><a:t>x</a:t></a:r></a:p>`))
    expect(r.drafts[0].el.fill).toBe('#000000')
  })
  it('positionnement final : ancrage haut, centre et bas', () => {
    const base = (anchor: string) => tree(textShape(`<a:p><a:r><a:rPr sz="2000"/><a:t>x</a:t></a:r></a:p>`, `anchor="${anchor}"`)).drafts[0]
    const top = finalizeText(base('t'), 30)
    expect(top.y).toBeCloseTo(100 + 4.8)
    expect(top.x).toBeCloseTo(100 + 9.6)
    expect(finalizeText(base('ctr'), 30).y).toBeCloseTo(100 + 35)
    expect(finalizeText(base('b'), 30).y).toBeCloseTo(100 + 100 - 4.8 - 30)
  })
  it('un texte vide n\'est pas créé', () => expect(tree(textShape(`<a:p><a:endParaRPr/></a:p>`)).drafts).toHaveLength(0))
  it('espace réservé : taille et couleur héritées du masque', () => {
    const style = parseXml(`<p:titleStyle ${NS}><a:lvl1pPr><a:defRPr sz="4400"><a:solidFill><a:srgbClr val="112233"/></a:solidFill></a:defRPr></a:lvl1pPr></p:titleStyle>`).documentElement
    const c = ctx({ txStyle: (k) => (k === 'title' ? style : null), placeholder: () => ({ xfrm: kid(parseXml(`<p:spPr ${NS}>${xfrm(10, 10, 300, 80)}</p:spPr>`).documentElement, 'xfrm') }) })
    const r = tree(`<p:sp><p:nvSpPr><p:cNvPr id="2" name="t"/><p:cNvSpPr/><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:p><a:r><a:t>Titre</a:t></a:r></a:p></p:txBody></p:sp>`, c)
    expect(r.drafts[0].el).toMatchObject({ fill: '#112233', x: 10 }) // position héritée (x provisoire avant finalizeText)
    expect(r.drafts[0].el.fontSize).toBeCloseTo(58.7, 1) // 44 pt
  })
})
