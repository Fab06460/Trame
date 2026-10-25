import * as ns from '@pdf-lib/fontkit'

/**
 * fontkit est un module CommonJS : selon l'outil de build (Vite, Rolldown, Vitest) ses fonctions sont sur l'espace de
 * noms ou sur `default`. On accepte les deux plutôt que de dépendre du comportement d'un bundler.
 */
export const fontkit = ((ns as unknown as { default?: typeof ns }).default ?? ns) as typeof ns
export type FontkitFont = ns.Font
