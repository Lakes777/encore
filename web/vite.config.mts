/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// No `npm run dev` o Vite repassa /api para o backend (python -m karaoke, porta 8000).
// A API recusa POST/PUT/DELETE quando a origem do pedido não é ela mesma, então o
// cabeçalho Origin é trocado para o endereço do backend.
const BACKEND = process.env.KARAOKE_API || 'http://127.0.0.1:8000'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: BACKEND,
        changeOrigin: true,
        configure(proxy) {
          proxy.on('proxyReq', (pedido) => {
            if (pedido.getHeader('origin')) pedido.setHeader('origin', BACKEND)
          })
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    // Só a pasta tests/: os worktrees dos subagentes (.claude/worktrees) têm cópias dos testes.
    include: ['tests/**/*.test.{ts,tsx}'],
  },
})
