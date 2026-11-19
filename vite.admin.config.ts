import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Independent build for the WordPress admin app (ADR-0044). Reuses the
// project's React/Tailwind dependencies and the brand tokens from
// src/styles/tailwind.css, but compiles a self-contained admin.js/admin.css
// into wordpress-theme/assets/admin/ (committed to the repo; the theme
// enqueues it only on its top-level menu page).
const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root,
  // The repo's public/ is the Astro frontend's static dir; never copy it.
  publicDir: false,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(root, "src"),
    },
  },
  build: {
    outDir: "wordpress-theme/assets/admin",
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(root, "admin/main.tsx"),
      output: {
        entryFileNames: "admin.js",
        assetFileNames: (assetInfo) =>
          assetInfo.names?.some((name) => name.endsWith(".css"))
            ? "admin.css"
            : "assets/[name]-[hash][extname]",
      },
    },
  },
});
