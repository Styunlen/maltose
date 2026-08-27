import { defineConfig } from "astro/config";
import { loadEnv } from "vite";
import { execSync } from "node:child_process";

// ── Build metadata (injected into the client console) ─────────────────────
// Read the current commit + a build timestamp at config-evaluation time so
// the running bundle can report "which build is this" in the browser console.
// Falls back to "unknown" when git is unavailable (e.g. non-git deploy copy).
function gitCommit() {
  try {
    return execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}
const BUILD_COMMIT = gitCommit();
const BUILD_TIME = new Date().toISOString();

// Astro injects `.env` into `import.meta.env`, but NOT into `process.env`.
// Our server-side code reads business secrets via `process.env.X` (ADR-0034),
// so for local dev we explicitly load `.env` into the process before the
// config is evaluated. Production is unaffected: pm2 already injects the
// deploy-dir `.env` via `node_args: --env-file=.env`.
const env = loadEnv(process.env.NODE_ENV || "development", process.cwd(), "");
for (const [k, v] of Object.entries(env)) {
  if (process.env[k] === undefined) process.env[k] = v;
}

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

// Trust the reverse proxy's forwarded headers (X-Forwarded-For/Host) for
// these hosts so Astro's clientAddress resolves the real visitor IP (used by
// comment geo + rate limits). This is `security.allowedDomains` — the node
// adapter's createRequest only reads XFF when the request host matches here;
// without it clientAddress falls back to socket remoteAddress (127.0.0.1
// behind nginx). `server.allowedHosts` is dev-server only and unrelated.
security: {
  allowedDomains: [
    { hostname: "dev.styunlen.cn", protocol: "https" },
    { hostname: "styunlen.cn", protocol: "https" },
    { hostname: "localhost", protocol: "http" },
  ],
},

adapter: node({
    mode: "standalone",
    // Serve dist/client static assets with cache headers: hashed files under
    // _astro/ get immutable, others get a short public cache. Keeps nginx a
    // pure proxy (no hardcoded deploy dir) — see deploy/nginx.conf.
    staticHeaders: true,
  }),

  prefetch: {
    prefetchAll: true,
    defaultStrategy: "hover",
  },

  vite: {
    define: {
      __BUILD_COMMIT__: JSON.stringify(BUILD_COMMIT),
      __BUILD_TIME__: JSON.stringify(BUILD_TIME),
    },
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
      allowedHosts: true,
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
