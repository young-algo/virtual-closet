import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Honor an assigned port (e.g. from a preview harness); default otherwise.
  server: process.env.PORT ? { port: Number(process.env.PORT), strictPort: true } : undefined,
})
