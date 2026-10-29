// Polices embarquées (@fontsource, sous-ensemble latin) : aucun accès réseau, rendu identique partout.
import '@fontsource/inter/latin-400.css'
import '@fontsource/inter/latin-700.css'
import '@fontsource/inter/latin-400-italic.css'
import '@fontsource/inter/latin-700-italic.css'
import '@fontsource/montserrat/latin-400.css'
import '@fontsource/montserrat/latin-700.css'
import '@fontsource/montserrat/latin-400-italic.css'
import '@fontsource/montserrat/latin-700-italic.css'
import '@fontsource/poppins/latin-400.css'
import '@fontsource/poppins/latin-700.css'
import '@fontsource/poppins/latin-400-italic.css'
import '@fontsource/poppins/latin-700-italic.css'
import '@fontsource/oswald/latin-400.css'
import '@fontsource/oswald/latin-700.css'
import '@fontsource/bebas-neue/latin-400.css'
import '@fontsource/playfair-display/latin-400.css'
import '@fontsource/playfair-display/latin-700.css'
import '@fontsource/playfair-display/latin-400-italic.css'
import '@fontsource/playfair-display/latin-700-italic.css'
import '@fontsource/lora/latin-400.css'
import '@fontsource/lora/latin-700.css'
import '@fontsource/lora/latin-400-italic.css'
import '@fontsource/lora/latin-700-italic.css'
import '@fontsource/caveat/latin-400.css'
import '@fontsource/caveat/latin-700.css'
import '@fontsource/pacifico/latin-400.css'
import '@fontsource/jetbrains-mono/latin-400.css'
import '@fontsource/jetbrains-mono/latin-700.css'
import '@fontsource/jetbrains-mono/latin-400-italic.css'
import '@fontsource/jetbrains-mono/latin-700-italic.css'

export interface FontDef {
  name: string
  /** valeur stockée dans TrameElement.fontFamily */
  family: string
  group: string
  /** nom du paquet @fontsource, et préfixe des fichiers de police */
  slug: string
  /** variantes réellement embarquées : `<graisse>[-italic]` */
  variants: string[]
  /** police ajoutée en ligne (ses octets WOFF2 sont en mémoire, pas dans l'application) */
  installed?: boolean
}

export const SYSTEM_FONT = 'Helvetica Neue, Arial, sans-serif'

export const FONTS: FontDef[] = [
  { name: 'Inter', family: '"Inter", sans-serif', group: 'sans', slug: 'inter', variants: ['400', '700', '400-italic', '700-italic'] },
  { name: 'Montserrat', family: '"Montserrat", sans-serif', group: 'sans', slug: 'montserrat', variants: ['400', '700', '400-italic', '700-italic'] },
  { name: 'Poppins', family: '"Poppins", sans-serif', group: 'sans', slug: 'poppins', variants: ['400', '700', '400-italic', '700-italic'] },
  { name: 'Oswald', family: '"Oswald", sans-serif', group: 'display', slug: 'oswald', variants: ['400', '700'] },
  { name: 'Bebas Neue', family: '"Bebas Neue", sans-serif', group: 'display', slug: 'bebas-neue', variants: ['400'] },
  { name: 'Playfair Display', family: '"Playfair Display", serif', group: 'serif', slug: 'playfair-display', variants: ['400', '700', '400-italic', '700-italic'] },
  { name: 'Lora', family: '"Lora", serif', group: 'serif', slug: 'lora', variants: ['400', '700', '400-italic', '700-italic'] },
  { name: 'Caveat', family: '"Caveat", cursive', group: 'handwriting', slug: 'caveat', variants: ['400', '700'] },
  { name: 'Pacifico', family: '"Pacifico", cursive', group: 'handwriting', slug: 'pacifico', variants: ['400'] },
  { name: 'JetBrains Mono', family: '"JetBrains Mono", monospace', group: 'mono', slug: 'jetbrains-mono', variants: ['400', '700', '400-italic', '700-italic'] },
]

/** Charge toutes les graisses/styles avant le premier rendu : Konva mesure le texte au dessin, la police doit être prête. */
export async function loadFonts(): Promise<void> {
  const sample = 'Aa Éé œ 0123'
  const loads = FONTS.flatMap((f) =>
    ['normal', 'italic'].flatMap((style) =>
      [400, 700].map((w) => document.fonts.load(`${style} ${w} 32px ${f.family}`, sample).catch(() => []))
    )
  )
  // ne bloque jamais le démarrage plus de 4 s
  await Promise.race([Promise.all(loads), new Promise((r) => setTimeout(r, 4000))])
}

// --- Polices ajoutées en ligne (voir `fontCatalog` côté principal) ----------------------------------------------------------------
export interface ExtraFontData {
  id: string
  name: string
  family: string
  category: string
  license: string
  /** fichiers de police en base64, par variante */
  data: Record<string, string>
  /** importée depuis un fichier de l'utilisateur */
  custom?: boolean
}

const extras = new Map<string, { def: FontDef; font: ExtraFontData; faces: FontFace[] }>()
const listeners = new Set<() => void>()
const notify = (): void => listeners.forEach((l) => l())

/** Abonnement aux ajouts et retraits de polices (le sélecteur de police se met à jour). */
export function subscribeFonts(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

const GROUPS: Record<string, string> = { 'sans-serif': 'sans', serif: 'serif', display: 'display', handwriting: 'handwriting', monospace: 'mono' }

/** Toutes les polices utilisables : les 10 embarquées, puis celles ajoutées en ligne. */
export const allFonts = (): FontDef[] => [...FONTS, ...[...extras.values()].map((e) => e.def)]

export const extraFonts = (): ExtraFontData[] => [...extras.values()].map((e) => e.font)

export const bytesOfBase64 = (b64: string): Uint8Array => {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

/** Octets WOFF2 d'une variante d'une police ajoutée (export PDF), ou null. */
export const extraFontBytes = (id: string, variant: string): Uint8Array | null => {
  const b64 = extras.get(id)?.font.data[variant]
  return b64 ? bytesOfBase64(b64) : null
}

/** Rend une police ajoutée disponible : déclarée au navigateur (graisse et style par variante) puis chargée, avant tout affichage. */
export async function registerExtraFont(font: ExtraFontData): Promise<void> {
  if (extras.has(font.id)) return
  const faces: FontFace[] = []
  for (const [variant, b64] of Object.entries(font.data)) {
    const face = new FontFace(font.name, bytesOfBase64(b64).buffer as ArrayBuffer, { weight: variant.startsWith('700') ? '700' : '400', style: variant.endsWith('italic') ? 'italic' : 'normal' })
    try {
      await face.load()
      document.fonts.add(face)
      faces.push(face)
    } catch {
      /* variante illisible : ignorée (la graisse normale suffit à afficher le texte) */
    }
  }
  if (faces.length === 0) return
  const variants = Object.keys(font.data)
  extras.set(font.id, { def: { name: font.name, family: font.family, group: GROUPS[font.category] ?? 'sans', slug: font.id, variants, installed: true }, font, faces })
  notify()
}

/** Rend disponibles les polices embarquées dans un document ouvert (celles que ce poste n'a pas installées, sans les enregistrer). */
export async function registerEmbeddedFonts(fonts: Record<string, { name: string; family: string; category: string; license: string; variants: Record<string, string> }> | undefined): Promise<void> {
  for (const [id, f] of Object.entries(fonts ?? {})) await registerExtraFont({ id, name: f.name, family: f.family, category: f.category, license: f.license, data: f.variants })
}

export function unregisterExtraFont(id: string): void {
  const e = extras.get(id)
  if (!e) return
  for (const f of e.faces) document.fonts.delete(f)
  extras.delete(id)
  notify()
}
