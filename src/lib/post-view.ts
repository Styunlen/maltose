// Browser-safe view recording (ADR-0002). Unlike the rest of src/api/api.ts
// (the server-side GraphQL facade), this module imports NOTHING from the Node
// runtime — no Apollo, no cache, no pino. It talks to the same
// /api/graphql-proxy endpoint that every other island uses with a plain
// fetch, so it can be bundled into the client without dragging the server
// module graph (pino/lmdb/node-gyp-build) into the browser.
//
// PostViewCounter historically did `await import("@api/api")` to reach the
// recordPostView mutation — that pulled the entire server facade into a
// client chunk and crashed with `ReferenceError: process is not defined`
// (node-gyp-build's top-level `process.config` read). This module is the
// replacement: same mutation, no server imports.

export async function recordPostView(
  postId: number | string,
): Promise<number | undefined> {
  const res = await fetch(`/api/graphql-proxy`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: `
        mutation RecordPostView($postId: ID!) {
          recordPostView(input: { postId: $postId }) {
            viewCount
          }
        }
      `,
      variables: { postId: String(postId) },
    }),
  });
  if (!res.ok) throw new Error(`recordPostView HTTP ${res.status}`);
  const json = (await res.json()) as {
    data?: { recordPostView?: { viewCount?: number | null } };
  };
  // Rate-limited responses return viewCount: null — return undefined so the
  // caller keeps its optimistic value (PostViewCounter only updates when a
  // number comes back).
  const viewCount = json?.data?.recordPostView?.viewCount;
  return typeof viewCount === "number" ? viewCount : undefined;
}
