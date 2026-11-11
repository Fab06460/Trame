import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    resolve: { alias: { '@': resolve('src/renderer/src'), '@shared': resolve('src/shared') } },
    plugins: [react()],
    build: {
      rollupOptions: {
        output: {
          // les données de langue de la reconnaissance de texte gardent leur nom (`fra.traineddata.gz`) : le moteur les cherche par ce nom
          assetFileNames: (asset) => (/\.traineddata\.gz$/.test(asset.names?.[0] ?? asset.name ?? '') ? 'ocr/[name][extname]' : 'assets/[name]-[hash][extname]')
        }
      }
    }
  }
})
