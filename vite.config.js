import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  // Guard rails for production builds.
  // Empty VITE_API_URL is valid (same-origin: nginx serves dist/ and proxies
  // /api). But pointing at a localhost URL in a production build is almost
  // certainly a mistake (browser would hit the user's own machine).
  if (mode === 'production' && env.VITE_API_URL) {
    const url = env.VITE_API_URL.trim()
    if (/^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:|\/)/i.test(url)) {
      throw new Error(
        `VITE_API_URL=${url} menunjuk ke localhost — build produksi tidak akan bisa ` +
        'diakses pengguna. Biarkan kosong (same-origin via nginx) atau gunakan URL publik.'
      )
    }
  }

  return {
    plugins: [
      tailwindcss(),
      react(),
    ],
    server: {
      proxy: {
        '/api': {
          target: 'http://localhost:3005',
          changeOrigin: true,
        },
      },
    },
    test: {
      include: ['src/**/*.test.{js,jsx}', 'server/**/*.test.{js,jsx}'],
    },
    build: {
      rollupOptions: {
        output: {
          // Vite 8 (rolldown) requires manualChunks as a function
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('html5-qrcode') || id.includes('/qrcode/')) return 'vendor-qr'
              if (id.includes('date-fns'))     return 'vendor-date'
              if (id.includes('lucide-react')) return 'vendor-icons'
              if (
                id.includes('/react/') ||
                id.includes('/react-dom/') ||
                id.includes('/react-router')
              ) return 'vendor-react'
            }
          },
        },
      },
    },
  }
})
