import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  // Relative base so the built output also works when wrapped by Capacitor
  // (loaded from a file:// / capacitor:// origin rather than a normal https URL).
  base: "./",
  build: {
    outDir: "dist",
    assetsDir: "assets",
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        session: resolve(__dirname, "session.html"),
        settings: resolve(__dirname, "settings.html"),
        about: resolve(__dirname, "about.html"),
      },
    },
  },
  server: {
    port: 5173,
  },
});
