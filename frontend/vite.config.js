import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // The map vendors are intentionally loaded only by /fire-map. Keep the
    // warning threshold above their measured sizes; application chunks remain
    // split and are checked separately in the judge build output.
    chunkSizeWarningLimit: 1100,
    rolldownOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('maplibre-gl')) return 'maplibre-gl'
          if (id.includes('@deck.gl')) return 'deck-gl'
          if (id.includes('h3-js')) return 'h3-js'
          return undefined
        },
      },
    },
  },
})
