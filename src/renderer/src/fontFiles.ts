/**
 * Import de fichiers de police personnels (TTF, OTF, WOFF, WOFF2) : lecture des métadonnées avec fontkit, contrôle de la licence
 * d'intégration, regroupement des fichiers en familles (normal, gras, italique, gras italique). Pur : pas d'accès aux fichiers.
 */
import { fontkit } from '@/fontkit'

export type FontFormat = 'ttf' | 'otf' | 'woff' | 'woff2'
/** Un fichier de police est embarqué tel quel dans les documents (≤ 2 M caractères en base64) : on refuse au-delà. */
export const MAX_FONT_FILE_BYTES = 1_500_000
export type Variant = '400' | '700' | '400-italic' | '700-italic'

export interface FontFileInfo {
  file: string
  family: string
  weight: number
  italic: boolean
  variable: boolean
  mono: boolean
  format: FontFormat
  warnings: string[]
}

export type FontFileResult = { ok: true; info: FontFileInfo } | { ok: false; reason: string }

/** Format d'après la signature du fichier (jamais d'après son extension) ; `collection` pour un .ttc, null si inconnu. */
export function sniffFormat(b: Uint8Array): FontFormat | 'collection' | null {
  if (b.length < 12) return null
  const tag = String.fromCharCode(b[0], b[1], b[2], b[3])
  if (tag === 'wOF2') return 'woff2'
  if (tag === 'wOFF') return 'woff'
  if (tag === 'OTTO') return 'otf'
  if (tag === 'ttcf') return 'collection'
  if (tag === 'true' || (b[0] === 0 && b[1] === 1 && b[2] === 0 && b[3] === 0)) return 'ttf'
  return null
}

interface FkFont {
  familyName?: string
  subfamilyName?: string
  italicAngle?: number
  variationAxes?: Record<string, unknown>
  post?: { isFixedPitch?: number }
  'OS/2'?: { usWeightClass?: number; fsSelection?: { italic?: boolean; oblique?: boolean }; fsType?: { noEmbedding?: boolean; viewOnly?: boolean; noSubsetting?: boolean } }
}

const NAME = /^[^"\\<>\u0000-\u001f]{1,60}$/

export function parseFontFile(file: string, bytes: Uint8Array): FontFileResult {
  if (bytes.length > MAX_FONT_FILE_BYTES) return { ok: false, reason: `trop volumineux (${(bytes.length / 1e6).toFixed(1)} Mo ; 1,5 Mo au plus — un sous-ensemble ou un fichier WOFF2 est plus léger)` }
  const format = sniffFormat(bytes)
  if (format === null) return { ok: false, reason: "ce n'est pas un fichier de police reconnu (TTF, OTF, WOFF ou WOFF2)" }
  if (format === 'collection') return { ok: false, reason: 'collection de polices (.ttc) non prise en charge : exportez chaque police séparément' }
  let f: FkFont
  try {
    f = fontkit.create(bytes as never) as unknown as FkFont
  } catch {
    return { ok: false, reason: 'fichier de police illisible ou endommagé' }
  }
  const family = (f.familyName ?? '').replace(/\s+/g, ' ').trim()
  if (!NAME.test(family)) return { ok: false, reason: 'nom de famille absent ou invalide' }
  const os2 = f['OS/2']
  // le champ fsType est la volonté de l'auteur : « intégration interdite » doit être respectée (document et PDF embarquent la police)
  if (os2?.fsType?.noEmbedding) return { ok: false, reason: "l'auteur de la police interdit son intégration dans des documents (licence)" }
  const warnings: string[] = []
  if (os2?.fsType?.viewOnly) warnings.push(`${file} : licence « aperçu et impression » seulement — vérifiez que vous avez le droit de l'utiliser dans vos documents`)
  const variable = !!f.variationAxes && Object.keys(f.variationAxes).length > 0
  if (variable) warnings.push(`${file} : police variable, seule sa graisse par défaut est utilisée`)
  const style = f.subfamilyName ?? ''
  const italic = !!os2?.fsSelection?.italic || !!os2?.fsSelection?.oblique || (f.italicAngle ?? 0) !== 0 || /italic|oblique/i.test(style)
  return { ok: true, info: { file, family, weight: os2?.usWeightClass ?? (/bold|black|heavy/i.test(style) ? 700 : 400), italic, variable, mono: (f.post?.isFixedPitch ?? 0) !== 0, format, warnings } }
}

export interface FontFamilyGroup {
  family: string
  mono: boolean
  /** fichier retenu pour chaque variante */
  variants: Partial<Record<Variant, { file: string; bytes: Uint8Array }>>
  /** messages (licence, police variable) et fichiers ignorés avec la raison */
  notes: string[]
}

const key = (italic: boolean, bold: boolean): Variant => `${bold ? '700' : '400'}${italic ? '-italic' : ''}` as Variant

/**
 * Regroupe les fichiers par famille. Pour chaque style (droit, italique), le fichier de graisse la plus proche de 400 devient « normal »
 * et le plus proche de 700 (graisse ≥ 600) « gras » ; les autres graisses (fine, noire…) sont ignorées et signalées. Une famille sans
 * graisse normale utilise sa graisse la plus légère comme « normal ».
 */
export function groupFamilies(items: Array<{ bytes: Uint8Array; info: FontFileInfo }>): FontFamilyGroup[] {
  const byFamily = new Map<string, Array<{ bytes: Uint8Array; info: FontFileInfo }>>()
  for (const it of items) byFamily.set(it.info.family, [...(byFamily.get(it.info.family) ?? []), it])
  const out: FontFamilyGroup[] = []
  for (const [family, files] of byFamily) {
    const g: FontFamilyGroup = { family, mono: files.some((f) => f.info.mono), variants: {}, notes: files.flatMap((f) => f.info.warnings) }
    for (const italic of [false, true]) {
      const styled = files.filter((f) => f.info.italic === italic)
      const heavy = styled.filter((f) => f.info.weight >= 600)
      const light = styled.filter((f) => f.info.weight < 600)
      const pick = (list: typeof styled, target: number): (typeof styled)[number] | undefined => [...list].sort((a, b) => Math.abs(a.info.weight - target) - Math.abs(b.info.weight - target))[0]
      const normal = pick(light, 400) ?? (heavy.length > 1 ? pick(heavy, 600) : light.length === 0 && heavy.length === 1 && !italic ? heavy[0] : undefined)
      const bold = pick(heavy.filter((h) => h !== normal), 700)
      if (normal) g.variants[key(italic, false)] = { file: normal.info.file, bytes: normal.bytes }
      if (bold) g.variants[key(italic, true)] = { file: bold.info.file, bytes: bold.bytes }
      const kept = new Set([normal, bold])
      for (const f of styled) if (!kept.has(f)) g.notes.push(`${f.info.file} : graisse ${f.info.weight} ignorée (Trame gère « normal » et « gras »)`)
    }
    // un style italique seul (sans droit) : on ne peut pas bâtir la famille sur lui
    if (!g.variants['400'] && g.variants['400-italic']) {
      g.variants['400'] = g.variants['400-italic']
      delete g.variants['400-italic']
      g.notes.push('aucun fichier « normal » : le fichier italique sert de graisse normale')
    }
    out.push(g)
  }
  return out
}

/** Nom de police unique : celui du fichier, suivi de « (perso) » s'il existe déjà (une police embarquée ou ajoutée ne doit jamais être masquée). */
export function uniqueName(family: string, taken: Set<string>): string {
  if (!taken.has(family)) return family
  let n = `${family} (perso)`
  for (let i = 2; taken.has(n); i++) n = `${family} (perso ${i})`
  return n.slice(0, 60)
}

/** Identifiant de dossier d'une police personnelle. */
export function customId(name: string): string {
  const slug = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)
  return `perso-${slug || 'police'}`
}
