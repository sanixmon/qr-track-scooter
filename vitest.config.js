import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.{js,jsx}', 'server/**/*.test.{js,jsx}'],
    environment: 'happy-dom',
    setupFiles: ['./src/test-setup.js'],
  },
})
