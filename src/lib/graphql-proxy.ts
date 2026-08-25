/**
 * Shared GraphQL proxy endpoint URL for all internal API routes.
 * Routes through the signature proxy instead of calling WPGraphQL directly.
 */
export function getProxyUrl(): string {
  return process.env.APP_URL
    ? `${process.env.APP_URL}/api/graphql-proxy`
    : "http://localhost:4321/api/graphql-proxy";
}
