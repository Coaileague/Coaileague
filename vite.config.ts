import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path, { dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "client", "src"),
      "@shared": path.resolve(__dirname, "shared"),
    },
    moduleDirectories: ["node_modules", path.resolve(__dirname, "node_modules")],
  },
  root: path.resolve(__dirname, "client"),
  build: {
    outDir: path.resolve(__dirname, "dist/public"),
    emptyOutDir: true,
    rollupOptions: {
      external: ["@capacitor/haptics"],
    },
  },
  optimizeDeps: {
    exclude: ["@capacitor/haptics"],
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: false,
    // HMR WebSocket — resolves the Vite client URL from the current page.
    hmr: {
      protocol: 'ws',
    },
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
