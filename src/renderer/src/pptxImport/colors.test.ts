import { DOMParser } from '@xmldom/xmldom'
import { beforeAll, describe, expect, it } from 'vitest'
import { parseTheme, resolveColor, type Theme } from '@/pptxImport/colors'
import { setXmlParser, parseXml } from '@/pptxImport/xml'

const theme: Theme = { colors: { dk1: '000000', lt1: 'ffffff', accent1: '4472c4', dk2: '44546a' }, major: 'Calibri Light', minor: 'Calibri' }
const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"'
const color = (xml: string) => resolveColor(parseXml(`<a:solidFill ${NS}>${xml}</a:solidFill>`).documentElement.firstChild as Element, theme)

beforeAll(() => setXmlParser((t) => new DOMParser().parseFromString(t, 'application/xml') as unknown as Document))

describe('resolveColor', () => {
  it('couleur RVB directe', () => expect(color('<a:srgbClr val="FF8800"/>')).toEqual({ hex: '#ff8800', alpha: 1 }))
  it('couleur de thème via la correspondance bg1/tx1', () => {
    expect(color('<a:schemeClr val="tx1"/>')?.hex).toBe('#000000')
    expect(color('<a:schemeClr val="bg1"/>')?.hex).toBe('#ffffff')
    expect(color('<a:schemeClr val="accent1"/>')?.hex).toBe('#4472c4')
  })
  it('transparence', () => expect(color('<a:srgbClr val="000000"><a:alpha val="40000"/></a:srgbClr>')?.alpha).toBeCloseTo(0.4))
  it('lumMod / lumOff éclaircissent (accent1 + 40 % de clarté)', () => {
    const c = color('<a:schemeClr val="accent1"><a:lumMod val="60000"/><a:lumOff val="40000"/></a:schemeClr>')!
    expect(c.hex).toBe('#8faadc')
  })
  it('shade assombrit, tint éclaircit', () => {
    expect(color('<a:srgbClr val="ffffff"><a:shade val="50000"/></a:srgbClr>')?.hex).toBe('#808080')
    expect(color('<a:srgbClr val="000000"><a:tint val="50000"/></a:srgbClr>')?.hex).toBe('#808080')
  })
  it('couleur inconnue : null', () => {
    expect(color('<a:schemeClr val="nope"/>')).toBeNull()
    expect(color('<a:srgbClr val="zz"/>')).toBeNull()
  })
})

describe('parseTheme', () => {
  it('lit couleurs et polices', () => {
    const doc = parseXml(`<a:theme ${NS}><a:themeElements><a:clrScheme name="x"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:accent1><a:srgbClr val="FF0000"/></a:accent1></a:clrScheme><a:fontScheme><a:majorFont><a:latin typeface="Montserrat"/></a:majorFont><a:minorFont><a:latin typeface="Inter"/></a:minorFont></a:fontScheme></a:themeElements></a:theme>`)
    expect(parseTheme(doc)).toEqual({ colors: { dk1: '000000', lt1: 'FFFFFF', accent1: 'FF0000' }, major: 'Montserrat', minor: 'Inter' })
  })
})
