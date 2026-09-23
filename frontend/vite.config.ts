import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

declare const process: { env: Record<string, string | undefined> }

const backendPort = process.env.BACKEND_PORT || '8000'
const proxy = { '/api': `http://127.0.0.1:${backendPort}` }

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5173, strictPort: false, proxy },
  preview: { port: 4173, strictPort: false, proxy },
  build: {
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/maplibre-gl')) {
            return 'vendor-maplibre'
          }
          if (id.includes('node_modules/recharts')) {
            return 'vendor-recharts'
          }
          if (id.includes('node_modules/lucide-react')) {
            return 'vendor-icons'
          }
        },
      },
    },
  },
})

