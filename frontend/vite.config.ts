import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import basicSsl from "@vitejs/plugin-basic-ssl";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const useHttps = process.env.VITE_DEV_HTTPS === "true" || process.env.npm_lifecycle_event === "start:https";

  return {
    server: {
      host: "::",
      // Keep the dev origin aligned with the API's local CORS allowlist.
      port: 3000,
      allowedHosts: true,
      https: useHttps,
      hmr: {
        overlay: false,
      },
      // The live Takamol backend (Railway) sends no CORS headers, so the
      // browser must not call it directly. In dev we proxy same-origin
      // /takamol-api/* -> https://playwright-mcp-vnc-production.up.railway.app/api/*
      // (Vercel does the same in production via vercel.json rewrites).
      proxy: {
        "/takamol-api": {
          target: "https://playwright-mcp-vnc-production.up.railway.app",
          changeOrigin: true,
          secure: true,
          rewrite: (p) => p.replace(/^\/takamol-api/, ""),
        },
      },
    },
    plugins: [react(), useHttps && basicSsl(), mode === "development" && componentTagger()].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
