import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { copyFileSync, mkdirSync, readdirSync, existsSync } from 'fs'

const __dirname = dirname(fileURLToPath(import.meta.url))

function copyDllPlugin() {
  return {
    name: 'copy-dll-to-out',
    buildStart() {
      const src = resolve(__dirname, 'dll')
      const dest = resolve(__dirname, 'out/dll')
      if (!existsSync(src)) return
      mkdirSync(dest, { recursive: true })
      for (const f of readdirSync(src)) {
        if (f.toLowerCase().endsWith('.dll')) {
          copyFileSync(resolve(src, f), resolve(dest, f))
        }
      }
    },
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin(), copyDllPlugin()],
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    plugins: [vue()],
    // Puerto fijo y distinto al del dashboard web (5173): evita el conflicto
    // de puerto con frontend/ cuando ambos dev servers arrancan en la misma máquina.
    server: {
      port: 5180,
      strictPort: true,
    },
  },
})
