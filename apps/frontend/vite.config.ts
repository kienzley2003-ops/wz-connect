import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'

const ENV_DIR = resolve(__dirname, '../..')

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ENV_DIR, '')
  const API_TARGET = env.VITE_API_TARGET ?? process.env.VITE_API_TARGET ?? 'http://localhost:3000'

  return {
    plugins: [react(), tailwindcss()],
    resolve: { alias: { '@': resolve(__dirname, 'src') } },
    server: {
      port: 3002,
      host: true,
      proxy: {
        '/api': { target: API_TARGET, changeOrigin: false },
      },
    },
  }
})
