import { defineConfig } from "vite";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

// __dirname doesn't exist in native ES modules (this project is "type": "module") —
// this is the standard ESM-safe replacement.
const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // Relative base so the built output also works when wrapped by Capacitor
  // (loaded from a file:// / capacitor:// origin rather than a normal https URL).
  base: "./",
  plugins: [],
  build: {
    outDir: "dist",
    assetsDir: "assets",
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        session: resolve(__dirname, "session.html"),
        luminous: resolve(__dirname, "luminous.html"),
        settings: resolve(__dirname, "settings.html"),
        about: resolve(__dirname, "about.html"),
        guide: resolve(__dirname, "guide.html"),
      },
    },
  },
  server: {
    port: 5173,
  },
});
