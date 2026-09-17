import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { quasar, transformAssetUrls } from '@quasar/vite-plugin'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue({
      template: { transformAssetUrls },
    }),
    quasar(),
  ],
  server: {
    host: true, // Permite conexiones desde la red local y túneles de VS Code
    port: 5173,
  },
})
