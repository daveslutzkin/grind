import { defineConfig } from "vite"
import preact from "@preact/preset-vite"

export default defineConfig({
  plugins: [preact()],
  root: "src/web/client",
  server: {
    port: 3000,
    proxy: {
      "/ws": {
        target: "ws://localhost:5173",
        ws: true,
      },
    },
  },
  build: {
    outDir: "../../../dist/web/client",
    emptyOutDir: true,
  },
})
