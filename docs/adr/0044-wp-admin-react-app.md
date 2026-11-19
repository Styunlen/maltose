# ADR-0044: Argon-Style WordPress Admin App (React + REST)

- Status: Accepted
- Date: 2026-11-20

## Context

The owner asked for an Argon-like admin experience: a **top-level** WordPress
menu (not buried under Settings) whose page is rendered with frontend
technology and follows the theme's visual language. The legacy settings lived
in `class-admin-settings.php` as three `add_options_page` screens built from
the Settings API, PHP `<table class="form-field">` markup and inline jQuery —
functional but visually disconnected from the brand and awkward to extend.
Announcements (ADR-0043 CPT) had no management UI beyond the native editor.

Constraints found during exploration: the WP theme had no build assets, no
enqueue logic and no REST precedent; CI only deploys the Astro `dist/` (the
WP theme is synced separately); the active theme is a **child theme**
(`argon_styunlen` under `argon`), so bundle paths must be child-theme aware.

## Decision

- **Top-level admin menu + React SPA**: `add_menu_page('Maltose', …)` renders
  a container div; `admin_enqueue_scripts` loads a prebuilt bundle only on
  that page (`get_theme_file_path/uri` so child themes work). The bundle is
  a **standalone Vite build** (`vite.admin.config.ts`, `pnpm build:admin`)
  written to `wordpress-theme/assets/admin/{admin.js,admin.css}` and
  **committed to the repo**; the owner syncs the theme as before (no new CI
  pipeline). React 19 + Tailwind v4, reusing root dependencies and brand
  tokens.
- **Data channel: WP REST under `maltose/v1`** with
  `permission_callback => current_user_can('manage_options')` and the
  standard `wp_rest` nonce. Routes: `/settings` (GET/PUT, reusing the existing
  sanitizers), `/announcements` (GET/POST/PUT/DELETE over the CPT),
  `/data/{overview,export,import,cleanup,migrate-clientids}`,
  `/uninstall` (GET/POST), `/orphans` (GET). Sensitive options (signing key)
  never leave the admin context.
- **Cascade-layer strategy for the admin bundle** (hard-won): the app CSS
  skips Tailwind's global preflight, declares `@layer properties, theme,
  base, components` explicitly **before** the layer imports (an import
  registers its layer at first appearance), and emits **utilities
  unlayered**. Reason: WP admin plugins (e.g. FileBird) load their own
  **unlayered Tailwind v3 preflight** whose `*,:before,:after { --tw-*: 0 }`
  reset beats any layered utility and froze transforms/shadows. Unlayered
  utilities (0-1-0) out-rank that universal selector (0-0-0). Form controls
  and heading margins get **unlayered id-scoped resets** (1-0-1) that beat
  both WP core (`#wpbody h2`) and plugin rules.
- **Feature set**: 常规（签名/调试/建站日期）、阅读增强（悬浮预览 6 项）、
  站点配置（社交链接动态行 + 博主多选）、公告（列表 + 内嵌 HTML 编辑器 +
  置顶/草稿/发布）、数据管理（预览/导出/导入/清理/段落锚定迁移）、
  卸载向导（四模式 + 备份下载）、悬空评论（只读总览 + 文章内重绑跳转）。
- **Legacy pages removed**: the three `add_options_page` registrations
  (settings/uninstall/orphans) are gone; their `admin_post` handlers and
  sanitizers stay registered as compatibility fallbacks, and the
  switch-theme notice now points at the new app.

## Consequences

- One coherent branded admin surface; phase-4 features live in one place.
- The bundle is 469KB (139KB gzip) JS + 32KB CSS, loaded only on this page.
- Admin styling is immune to WP core and plugin style collisions after the
  layer fixes; future utilities (transforms/shadows) stay safe.
- No new deploy channel: the built assets are committed and synced with the
  theme; PHP changes still need a server round-trip.
- Limitations: no media/rich-text editor yet (announcement content is an HTML
  textarea); uninstall/cleanup actions are destructive by design and are not
  exercised by automated tests.

## Alternatives considered

- **Vue (Argon's stack)** — rejected: the repo already ships React/Tailwind
  and dozens of React components; adding Vue doubles the toolchain.
- **Settings-API page with inline JS** — rejected: the owner explicitly asked
  for a frontend-rendered admin and a top-level menu.
- **iframe-isolated admin page** — rejected: heavier, awkward asset loading,
  and it would still need the same REST layer.
- **Layered Tailwind utilities** — rejected after a real collision with
  plugin preflights (see above).
- **CI deploy channel for `wordpress-theme/`** — deferred: the WP host is
  separate from the Astro deploy target; the owner syncs manually for now.
