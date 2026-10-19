import { defineConfig } from "vite";
import basicSsl from "@vitejs/plugin-basic-ssl";

// base "./" mantém os caminhos relativos (necessário para GitHub Pages em subpasta).
// `npm run dev:https` liga HTTPS com certificado autoassinado: o WebXR exige contexto seguro
// para abrir pelo IP da rede no headset (em http só funciona via localhost).
export default defineConfig(({ mode }) => ({
  base: "./",
  plugins: mode === "https" ? [basicSsl()] : [],
  build: {
    outDir: "dist",
    chunkSizeWarningLimit: 7000, // o núcleo do Babylon.js sozinho tem ~6 MB (1,3 MB com gzip)
  },
  server: {
    host: true,
  },
}));
