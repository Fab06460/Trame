/**
 * Plan d'un document texte (Word, Markdown, texte brut) : une suite de blocs, indépendante du format d'origine. Les lecteurs
 * (`markdown.ts`, `docx.ts`) le produisent, `layout.ts` en fait des pages.
 */
export type OutlineBlock =
  /** titre ; `level` de 1 (le plus haut) à 6 */
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'para'; text: string }
  /** élément de liste ; `level` de 0 (premier niveau) à 3 */
  | { kind: 'item'; level: number; ordered: boolean; text: string }
  /** image : `src` est une data URL, ou (Markdown) un chemin relatif à résoudre ; `ratio` = largeur / hauteur si on la connaît */
  | { kind: 'image'; src: string; alt?: string; ratio?: number }
  /** saut de page voulu par l'auteur (`---` en Markdown) */
  | { kind: 'break' }

/** Ce que le lecteur n'a pas pu reprendre tel quel : sert au résumé affiché après l'import. */
export interface OutlineNotes {
  /** tableaux convertis en lignes de texte (cellules séparées par « | ») */
  tables: number
  /** images ignorées : format non pris en charge, adresse distante (Trame ne télécharge rien), fichier introuvable ou trop gros */
  skippedImages: number
}

export interface Outline {
  /** titre du document s'il en annonce un (en-tête YAML d'un fichier Markdown, style « Titre » de Word) */
  title?: string
  blocks: OutlineBlock[]
  notes: OutlineNotes
}

/** Ce que contient un plan (affiché dans la fenêtre d'import). */
export function outlineStats(o: Outline): { headings: number; items: number; images: number } {
  let headings = 0
  let items = 0
  let images = 0
  for (const b of o.blocks) {
    if (b.kind === 'heading') headings++
    else if (b.kind === 'item') items++
    else if (b.kind === 'image') images++
  }
  return { headings: headings + (o.title ? 1 : 0), items, images }
}

export const emptyOutline = (): Outline => ({ blocks: [], notes: { tables: 0, skippedImages: 0 } })

/** Niveau maximal d'un élément de liste (au-delà, il reste au dernier niveau). */
export const MAX_ITEM_LEVEL = 3
/** Longueur maximale d'un bloc de texte : un bloc plus long est coupé (un fichier sans retour à la ligne ne doit rien bloquer). */
export const MAX_BLOCK_CHARS = 5000
