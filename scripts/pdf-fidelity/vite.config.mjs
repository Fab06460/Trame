import { resolve } from 'node:path'

// Construit la page de test (harness.ts) avec les mêmes alias et le même traitement des polices que l'application.
const root = resolve(import.meta.dirname, '../..')
export default {
  root: import.meta.dirname,
  base: './',
  resolve: { alias: { '@': resolve(root, 'src/renderer/src') } },
  server: { fs: { strict: false } },
  build: { outDir: resolve(import.meta.dirname, '.build'), emptyOutDir: true, target: 'esnext', chunkSizeWarningLimit: 4000 }
}
