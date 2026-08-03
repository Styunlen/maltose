/**
 * Shared GraphQL proxy endpoint URL for all internal API routes.
 * Routes through the signature proxy instead of calling WPGraphQL directly.
 */
export function getProxyUrl(): string {
  return import.meta.env.APP_URL
    ? `${import.meta.env.APP_URL}/api/graphql-proxy`
    : "http://localhost:4321/api/graphql-proxy";
}
