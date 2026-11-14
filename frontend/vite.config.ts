import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // ngrok tunnel so teammates can try the dev server
    allowedHosts: ['rested-actually-firefly.ngrok-free.app'],
  },
})
