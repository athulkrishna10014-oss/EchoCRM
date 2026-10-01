import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    watch: {
      ignored: ['**/test/**', '**/dist/**', '**/.git/**', '**/ai/**/__pycache__/**', '**/temp/**']
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
