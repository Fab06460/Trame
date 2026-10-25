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
}

export const SYSTEM_FONT = 'Helvetica Neue, Arial, sans-serif'

export const FONTS: FontDef[] = [
  { name: 'Inter', family: '"Inter", sans-serif', group: 'Sans' },
  { name: 'Montserrat', family: '"Montserrat", sans-serif', group: 'Sans' },
  { name: 'Poppins', family: '"Poppins", sans-serif', group: 'Sans' },
  { name: 'Oswald', family: '"Oswald", sans-serif', group: 'Titre' },
  { name: 'Bebas Neue', family: '"Bebas Neue", sans-serif', group: 'Titre' },
  { name: 'Playfair Display', family: '"Playfair Display", serif', group: 'Serif' },
  { name: 'Lora', family: '"Lora", serif', group: 'Serif' },
  { name: 'Caveat', family: '"Caveat", cursive', group: 'Manuscrit' },
  { name: 'Pacifico', family: '"Pacifico", cursive', group: 'Manuscrit' },
  { name: 'JetBrains Mono', family: '"JetBrains Mono", monospace', group: 'Mono' },
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
