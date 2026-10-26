import { allFonts, extraFontBytes, type FontDef } from '@/fonts'

export interface FontChoice {
  def: FontDef
  /** `400`, `700`, `400-italic` ou `700-italic` */
  variant: string
  /** nom du fichier woff embarqué */
  file: string
}

export type FontDiagnosis =
  | { ok: true; choice: FontChoice }
  | {
      ok: false
      /** `unknown-font` : police système ou absente du catalogue ; `missing-variant` : la famille n'a pas cette graisse/ce style */
      reason: 'unknown-font' | 'missing-variant'
      /** nom de la famille demandée */
      family: string
      /** pour `missing-variant` : « gras », « italique » ou « gras italique » */
      variantLabel?: string
    }

/**
 * Police embarquée correspondant au texte d'un élément, avec la raison précise quand il n'y en a pas : police système ou
 * inconnue, ou graisse/style que la famille ne possède pas (le navigateur le simulerait, pas le PDF).
 */
export function diagnoseFont(fontFamily: string | undefined, fontStyle: string | undefined): FontDiagnosis {
  const name = /^\s*["']?([^"',]+?)["']?\s*(?:,|$)/.exec(fontFamily ?? '')?.[1]
  const def = allFonts().find((f) => f.name === name)
  if (!def) return { ok: false, reason: 'unknown-font', family: name ?? 'inconnue' }
  const style = fontStyle ?? ''
  const bold = style.includes('bold')
  const italic = style.includes('italic')
  const variant = `${bold ? '700' : '400'}${italic ? '-italic' : ''}`
  if (!def.variants.includes(variant)) {
    return { ok: false, reason: 'missing-variant', family: def.name, variantLabel: [bold && 'gras', italic && 'italique'].filter(Boolean).join(' ') }
  }
  return { ok: true, choice: { def, variant, file: `${def.slug}-latin-${variant.replace('-italic', '')}-${italic ? 'italic' : 'normal'}.woff` } }
}

/** Police embarquée correspondant au texte d'un élément, ou null s'il n'y en a pas (voir `diagnoseFont`). */
export function resolveFont(fontFamily: string | undefined, fontStyle: string | undefined): FontChoice | null {
  const d = diagnoseFont(fontFamily, fontStyle)
  return d.ok ? d.choice : null
}

// Chargement à la demande : chaque police est un petit module JS (data URL) qui n'est téléchargé qu'au premier export PDF.
// On ne passe pas par fetch() : une page chargée depuis file:// ne peut pas lire d'autres file://, et la CSP interdit data: en connexion.
const loaders = import.meta.glob('../../../node_modules/@fontsource/*/files/*-latin-{400,700}-{normal,italic}.woff', {
  query: '?inline',
  import: 'default'
}) as Record<string, () => Promise<string>>

export async function loadFontBytes(choice: FontChoice): Promise<Uint8Array | null> {
  // police ajoutée en ligne : fichier WOFF2 gardé en mémoire (fontkit lit le WOFF2)
  if (choice.def.installed) return extraFontBytes(choice.def.slug, choice.variant)
  const key = Object.keys(loaders).find((k) => k.endsWith(`/${choice.def.slug}/files/${choice.file}`))
  if (!key) return null
  const dataUrl = await loaders[key]()
  const bin = atob(dataUrl.slice(dataUrl.indexOf(',') + 1))
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}
