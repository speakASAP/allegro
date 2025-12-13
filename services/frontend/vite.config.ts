import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: parseInt(process.env.ALLEGRO_FRONTEND_SERVICE_PORT || '3410', 10),
    host: true,
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
})

