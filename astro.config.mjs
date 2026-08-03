import { defineConfig } from "astro/config";

// https://astro.build/config
import node from "@astrojs/node";
import path from "path";
import { fileURLToPath } from "url";
import vue from "@astrojs/vue";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
const filename = fileURLToPath(import.meta.url); // 这里不能声明__filename,因为已经有内部的__filename了，重复声明会报错
const dirname = path.dirname(filename);
import viteCommonjs from "vite-plugin-commonjs";
import Icons from "unplugin-icons/vite";

// https://astro.build/config
export default defineConfig({
  output: "server",

  adapter: node({
    mode: "standalone",
  }),

  vite: {
    plugins: [
      viteCommonjs(),
      tailwindcss(),
      Icons({ compiler: "jsx", jsx: "react", autoInstall: true }),
      Icons({ compiler: "astro", autoInstall: true }),
    ],
    server: {
      fs: {
        allow: [path.resolve(dirname)],
        deny: [path.resolve(dirname, "../blogFriends")],
      },
    },
    resolve: {
      alias: {
        "@": path.resolve(dirname, "src"),
        "@api": path.resolve(dirname, "src/api"),
        "@components": path.resolve(dirname, "src/components"),
        "@lib": path.resolve(dirname, "src/lib"),
      },
    },
    ssr: {
      noExternal: [],
    },
    optimizeDeps: {
      include: ["@apollo/client"],
      exclude: [],
    },
  },

  integrations: [vue(), react()],
});

