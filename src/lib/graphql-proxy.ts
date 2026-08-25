/**
 * Shared GraphQL proxy endpoint URL for all internal API routes.
 * Routes through the signature proxy instead of calling WPGraphQL directly.
 *
 * Always targets localhost: the proxy is only ever fetched server-side (SSR
 * routes / api handlers). Hitting APP_URL (a public domain) would loop the
 * request out through the internet and back into this box — slow and fragile
 * behind NAT / tunnels. The browser never calls this helper; it uses relative
 * same-origin URLs.
 */
export function getProxyUrl(): string {
  const port = process.env.PORT || "4321";
  // `localhost` (not 127.0.0.1) resolves to whichever loopback the server is
  // bound to — ::1 on local dev (Astro default), 0.0.0.0-implied on deploy.
  return `http://localhost:${port}/api/graphql-proxy`;
}
