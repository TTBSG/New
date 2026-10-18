import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // Chemins relatifs : le jeu fonctionne aussi bien sur GitHub Pages (/New/) qu'en local ou dans une app mobile.
  base: './',
  plugins: [react()],
})
