
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import themePlugin from "@replit/vite-plugin-shadcn-theme-json";
import path, { dirname } from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  plugins: [react(), runtimeErrorOverlay(), themePlugin()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "client", "src"),
      "@shared": path.resolve(__dirname, "shared"),
    },
  },
  root: path.resolve(__dirname, "client"),
  build: {
    outDir: path.resolve(__dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    // Fix for Replit environment - use proper host and port detection
    host: '0.0.0.0',
    port: 5173,
    strictPort: false,
    // Fix HMR WebSocket connection
    hmr: {
      protocol: 'ws',
      host: process.env.REPL_SLUG 
        ? `${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`
        : 'localhost',
      port: 443, // Replit forwards this properly
      clientPort: 443,
    },
    // Ensure proper proxy configuration
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:5000',
        ws: true,
      },
    },
  },
});
