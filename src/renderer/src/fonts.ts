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
}

export const SYSTEM_FONT = 'Helvetica Neue, Arial, sans-serif'

export const FONTS: FontDef[] = [
  { name: 'Inter', family: '"Inter", sans-serif', group: 'Sans', slug: 'inter', variants: ['400', '700', '400-italic', '700-italic'] },
  { name: 'Montserrat', family: '"Montserrat", sans-serif', group: 'Sans', slug: 'montserrat', variants: ['400', '700', '400-italic', '700-italic'] },
  { name: 'Poppins', family: '"Poppins", sans-serif', group: 'Sans', slug: 'poppins', variants: ['400', '700', '400-italic', '700-italic'] },
  { name: 'Oswald', family: '"Oswald", sans-serif', group: 'Titre', slug: 'oswald', variants: ['400', '700'] },
  { name: 'Bebas Neue', family: '"Bebas Neue", sans-serif', group: 'Titre', slug: 'bebas-neue', variants: ['400'] },
  { name: 'Playfair Display', family: '"Playfair Display", serif', group: 'Serif', slug: 'playfair-display', variants: ['400', '700', '400-italic', '700-italic'] },
  { name: 'Lora', family: '"Lora", serif', group: 'Serif', slug: 'lora', variants: ['400', '700', '400-italic', '700-italic'] },
  { name: 'Caveat', family: '"Caveat", cursive', group: 'Manuscrit', slug: 'caveat', variants: ['400', '700'] },
  { name: 'Pacifico', family: '"Pacifico", cursive', group: 'Manuscrit', slug: 'pacifico', variants: ['400'] },
  { name: 'JetBrains Mono', family: '"JetBrains Mono", monospace', group: 'Mono', slug: 'jetbrains-mono', variants: ['400', '700', '400-italic', '700-italic'] },
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
