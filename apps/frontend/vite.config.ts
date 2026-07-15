import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 3001,
    // host: true permite acessar por subdomínio (ex.: http://demo.localhost:3001),
    // que é como o backend identifica o tenant.
    host: true,
    proxy: {
      // changeOrigin fica false de propósito: preserva o Host original para o
      // backend extrair o subdomínio do tenant.
      '/auth': { target: 'http://localhost:3000', changeOrigin: false },
      '/entitlements': { target: 'http://localhost:3000', changeOrigin: false },
      '/modules': { target: 'http://localhost:3000', changeOrigin: false },
      '/tenant': { target: 'http://localhost:3000', changeOrigin: false },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'istanbul',
      include: ['src/**/*.{ts,tsx}'],
      // App/api são cola de I/O (fetch, localStorage); a lógica testada é nav + ModuleNav.
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/main.tsx',
        'src/test/**',
        'src/vite-env.d.ts',
        'src/App.tsx',
        'src/lib/api.ts',
      ],
    },
  },
});
