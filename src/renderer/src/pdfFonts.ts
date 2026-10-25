import { FONTS, type FontDef } from '@/fonts'

export interface FontChoice {
  def: FontDef
  /** `400`, `700`, `400-italic` ou `700-italic` */
  variant: string
  /** nom du fichier woff embarqué */
  file: string
}

/**
 * Police embarquée correspondant au texte d'un élément, ou null s'il n'y en a pas (police système, famille inconnue,
 * ou graisse/style que la famille ne possède pas : le navigateur le simulerait, pas le PDF).
 */
export function resolveFont(fontFamily: string | undefined, fontStyle: string | undefined): FontChoice | null {
  const name = /^\s*["']?([^"',]+?)["']?\s*(?:,|$)/.exec(fontFamily ?? '')?.[1]
  const def = FONTS.find((f) => f.name === name)
  if (!def) return null
  const style = fontStyle ?? ''
  const italic = style.includes('italic')
  const variant = `${style.includes('bold') ? '700' : '400'}${italic ? '-italic' : ''}`
  if (!def.variants.includes(variant)) return null
  return { def, variant, file: `${def.slug}-latin-${variant.replace('-italic', '')}-${italic ? 'italic' : 'normal'}.woff` }
}

// Chargement à la demande : chaque police est un petit module JS (data URL) qui n'est téléchargé qu'au premier export PDF.
// On ne passe pas par fetch() : une page chargée depuis file:// ne peut pas lire d'autres file://, et la CSP interdit data: en connexion.
const loaders = import.meta.glob('../../../node_modules/@fontsource/*/files/*-latin-{400,700}-{normal,italic}.woff', {
  query: '?inline',
  import: 'default'
}) as Record<string, () => Promise<string>>

export async function loadFontBytes(choice: FontChoice): Promise<Uint8Array | null> {
  const key = Object.keys(loaders).find((k) => k.endsWith(`/${choice.def.slug}/files/${choice.file}`))
  if (!key) return null
  const dataUrl = await loaders[key]()
  const bin = atob(dataUrl.slice(dataUrl.indexOf(',') + 1))
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}
