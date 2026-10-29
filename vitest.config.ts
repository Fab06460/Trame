import { resolve } from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { alias: { '@': resolve('src/renderer/src'), '@shared': resolve('src/shared') } },
  test: { environment: 'node', include: ['src/**/*.test.ts'], setupFiles: ['src/renderer/src/test-setup.ts'] }
})
