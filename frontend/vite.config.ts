import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const proxy = { '/api': 'http://127.0.0.1:8000' }

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5173, strictPort: false, proxy },
  preview: { port: 4173, strictPort: false, proxy },
  build: { chunkSizeWarningLimit: 750 },
})
