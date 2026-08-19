import { tap } from "rxjs";
import {
  ApolloClient,
  ApolloLink,
  InMemoryCache,
  HttpLink,
  gql,
  type DocumentNode,
} from "@apollo/client";
import { loadErrorMessages, loadDevMessages } from "@apollo/client/dev";
import { ErrorLink } from "@apollo/client/link/error";
import {
  CombinedGraphQLErrors,
  CombinedProtocolErrors,
} from "@apollo/client/errors";
import { RetryLink } from "@apollo/client/link/retry";
import { LruLink, attachLruCacheApi, makeCacheKey } from "@/lib/lru-link";

const loggerLink = new ApolloLink((operation, forward) => {
  console.log(`Starting request for ${operation.operationName}`);
  return forward(operation).pipe(
    tap({
      next: () => {
        console.log(`Ending request for ${operation.operationName}`);
      },
    }),
  );
});
const retryLink = new RetryLink({
  delay: {
    initial: 300,
    max: Infinity,
    jitter: true,
  },
  attempts: {
    max: 5,
  },
});
// Log any GraphQL errors, protocol errors, or network error that occurred
const errorLink = new ErrorLink(({ error, operation }) => {
  if (CombinedGraphQLErrors.is(error)) {
    error.errors.forEach(({ message, locations, path }) =>
      console.error(
        `[GraphQL error]: Message: ${message}, Location: ${JSON.stringify(locations)}, Path: ${path}`,
      ),
    );
  } else if (CombinedProtocolErrors.is(error)) {
    error.errors.forEach(({ message, extensions }) =>
      console.error(
        `[Protocol error]: Message: ${message}, Extensions: ${JSON.stringify(
          extensions,
        )}`,
      ),
    );
  } else {
    console.error(`[Network error]: ${error}`);
  }
});

// HTTP Link
const proxyUrl = import.meta.env.APP_URL
  ? `${import.meta.env.APP_URL}/api/graphql-proxy`
  : "http://localhost:4321/api/graphql-proxy";
const httpLink = new HttpLink({
  uri: proxyUrl,
  credentials: "include",
  headers: {
    "Content-Type": "application/json",
  },
});

// Adds messages only in a dev environment
if (import.meta.env.DEV) {
  loadDevMessages();
  loadErrorMessages();
}

/*
 * In-process LRU cache link (SWR, ADR-0024). All queries flow through it:
 * low-volatility data serves from cache with background revalidation, and
 * read-after-write operations (articles/comments) wait for the network once
 * their entry has expired (STRONG_CONSISTENCY).
 */
const TTL_CONFIG: Record<string, number> = {
  LayoutQuery: 300,
  MegaQuery: 300,
  TimelinePosts: 300,
  TimelineStats: 300,
  PostsByMonth: 300,
  RandomPosts: 180,
  HomePosts: 60,
  GetNodeByURI: 30,
  GetPost: 30,
  PreviewByUri: 300,
  MaltoseSettings: 300,
  StatsCategories: 300,
  StatsComments: 300,
  CommentGeoStats: 300,
  StatsContent: 300,
};

const STRONG_CONSISTENCY = new Set<string>(["GetNodeByURI", "GetPost"]);

export const lruLink = new LruLink({
  ttlConfig: TTL_CONFIG,
  defaultTtl: 60,
  revalidateThreshold: 0.5,
  strongConsistency: STRONG_CONSISTENCY,
  maxEntries: 1000,
});

/** In-process cache handles for post-mutation invalidation. */
export const __internalLruCache = attachLruCacheApi(lruLink);

export const client = new ApolloClient({
  link: ApolloLink.from(
    import.meta.env.DEV
      ? [lruLink, loggerLink, errorLink, httpLink]
      : [lruLink, errorLink, httpLink],
  ),
  cache: new InMemoryCache(),
  ssrMode: true,
  defaultOptions: {
    query: {
      // InMemoryCache is only here to satisfy ApolloClient's constructor
      // (ADR-0024: cross-request caching is owned by LruLink). A cache-first
      // default would let InMemoryCache short-circuit queries before LruLink
      // runs, pinning per-process data for the process lifetime and
      // nullifying LruLink's TTLs (see ADR-0029). no-cache forces every query
      // through LruLink, which is the actual cache layer with SWR + TTL.
      fetchPolicy: "no-cache",
    },
  },
});

export async function getQuery(query, variables = {}) {
  const { data } = await client.query({
    query,
    variables,
    // Article editorBlocks are read-after-write data: must reach LruLink's
    // STRONG_CONSISTENCY + TTL every time. no-cache bypasses InMemoryCache
    // both ways (network-only would still write back and pin it, see ADR-0029).
    fetchPolicy: "no-cache",
  });
  return data;
}

// Combined query for all site-wide shared data (nav + sidebar + popular).
// Merging into one HTTP request avoids per-query connection overhead
// (~300ms each); measured 3 parallel sidebar queries at 1099ms vs 446ms
// merged (see ADR-0013). Cached in-process via LruLink (SWR, ADR-0024)
// since this data is low-volatility; real-time data (articles/comments)
// is handled by STRONG_CONSISTENCY in the same link.
// Layout-level query: only the site-wide chrome (menu + site identity) that
// every page needs. Kept separate from megaQuery (page data) so that article
// / timeline / utility pages never fetch homepage-only sidebar content (see
// ADR-0013 layered caching).
export async function layoutQuery() {
  const query = gql`
    query LayoutQuery {
      menus {
        nodes {
          name
          menuItems {
            nodes {
              uri
              url
              order
              label
            }
          }
        }
      }
      generalSettings {
        title
        url
        description
      }
    }
  `;
  const { data } = await client.query({ query, variables: {} });
  return data;
}

// Homepage data query: sidebar widgets (recent posts / comments / tags /
// categories / archive) plus sticky + most-viewed pools. Only index.astro
// consumes this — MainLayout uses layoutQuery() for the shared chrome.
export async function megaQuery(opts: {
  sidebarPosts?: number;
  recentComments?: number;
  randomFirst?: number;
  includeSticky?: boolean;
} = {}) {
  const { sidebarPosts = 5, recentComments = 5, randomFirst = 0, includeSticky = false } = opts;
  const query = gql`
    query MegaQuery($sidebarPosts: Int!, $recentComments: Int!, $randomFirst: Int!, $includeSticky: Boolean!) {
      recentPosts: posts(first: $sidebarPosts, where: { orderby: { field: DATE, order: DESC } }) {
        nodes {
          id
          date
          uri
          title
          viewCount
        }
      }
      allTags: tags(first: 100) {
        nodes {
          id
          name
          uri
          count
        }
      }
      allCategories: categories(first: 100) {
        nodes {
          id
          name
          uri
          count
          parent {
            node {
              name
            }
          }
          children {
            nodes {
              name
            }
          }
        }
      }
      recentComments: comments(first: $recentComments, where: { order: DESC }) {
        nodes {
          id
          databaseId
          content
          date
          author {
            node {
              name
            }
          }
          commentedOn {
            node {
              ... on Post {
                title
                uri
              }
              ... on Page {
                title
                uri
              }
            }
          }
        }
      }
      mostViewedPosts(first: $randomFirst) {
        id
        databaseId
        title
        uri
        commentCount
        viewCount
        categories {
          nodes {
            name
            uri
          }
        }
      }
      stickyPosts @include(if: $includeSticky) {
        id
        databaseId
        date
        uri
        title
        commentCount
        viewCount
        excerpt
        content
        categories {
          nodes {
            name
            uri
          }
        }
        tags {
          nodes {
            name
            uri
          }
        }
        featuredImage {
          node {
            srcSet
            sourceUrl
            altText
            mediaDetails {
              height
              width
            }
          }
        }
      }
    }
  `;
  const variables = { sidebarPosts, recentComments, randomFirst, includeSticky };
  const { data } = await client.query({ query, variables });
  return data;
}

export async function homePagePostsQuery(first = 10, offset = 0) {
  const { data } = await client.query({
    query: gql`
      query HomePosts($first: Int!, $offset: Int!) {
        posts(
          first: $first
          where: {
            offsetPagination: { size: $first, offset: $offset }
            orderby: { field: DATE, order: DESC }
          }
        ) {
          pageInfo {
            offsetPagination {
              total
            }
          }
          nodes {
            databaseId
            date
            uri
            title
            commentCount
            viewCount
            excerpt
            content
            categories {
              nodes {
                name
                uri
              }
            }
            tags {
              nodes {
                name
                uri
              }
            }
            featuredImage {
              node {
                sourceUrl
              }
            }
          }
        }
      }
    `,
    variables: { first, offset },
    // Homepage post list must stay real-time (new posts visible immediately).
    // no-cache reaches LruLink every time so HomePosts' 60s SWR applies;
    // network-only would write back to InMemoryCache and pin it (ADR-0029).
    fetchPolicy: "no-cache",
  });
  return data;
}

export async function getRandomPosts(
  count = 8,
  candidates = 50,
): Promise<any[]> {
  const { data } = await client.query({
    query: gql`
      query RandomPosts($first: Int!) {
        mostViewedPosts(first: $first) {
          databaseId
          date
          uri
          title
          commentCount
          viewCount
          excerpt
          categories {
            nodes {
              name
              uri
            }
          }
          tags {
            nodes {
              name
              uri
            }
          }
          featuredImage {
            node {
              srcSet
              sourceUrl
              altText
              mediaDetails {
                height
                width
              }
            }
          }
        }
      }
    `,
    variables: { first: candidates },
    // RandomPosts is SWR-cached by LruLink (TTL 180s); no-cache ensures the
    // request reaches it instead of being pinned by InMemoryCache (ADR-0029).
    fetchPolicy: "no-cache",
  });
  const pool = (data as any)?.mostViewedPosts || [];
  return shuffle(pool).slice(0, count);
}

export function shuffle<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export async function recordPostView(postId: number | string): Promise<number | undefined> {
  const { data } = await client.mutate({
    mutation: gql`
      mutation RecordPostView($postId: ID!) {
        recordPostView(input: { postId: $postId }) {
          viewCount
        }
      }
    `,
    variables: { postId: String(postId) },
  });
  return (data as any)?.recordPostView?.viewCount as number | undefined;
}

export async function getNodeByURI(uri, wpToken) {
  const context = wpToken
    ? { headers: { Authorization: `Bearer ${wpToken}` } }
    : {};
  const { data } = await client.query({
    query: gql`
      query GetNodeByURI($uri: String!) {
        nodeByUri(uri: $uri) {
          __typename
          isContentNode
          isTermNode
          ... on Post {
            id
            databaseId
            title
            date
            modified
            uri
            excerpt
            content
            commentCount
            viewCount
            commentStatus
            comments(first: 100, where: { order: ASC }) {
              nodes {
                id
                databaseId
                parentId
                parentDatabaseId
                content
                author {
                  node {
                    name
                    databaseId
                    email
                    avatar {
                      url
                      size
                    }
                  }
                }
                date
                agentPublic
                agent
              }
            }
            categories {
              nodes {
                name
                uri
              }
            }
            featuredImage {
              node {
                srcSet
                sourceUrl
                altText
                mediaDetails {
                  height
                  width
                }
              }
            }
          }
          ... on Page {
            id
            databaseId
            title
            uri
            date
            content
            commentCount
            commentStatus
            comments(first: 100, where: { order: ASC }) {
              nodes {
                id
                databaseId
                parentId
                parentDatabaseId
                content
                author {
                  node {
                    name
                    databaseId
                    email
                    avatar {
                      url
                      size
                    }
                  }
                }
                date
                agentPublic
                agent
              }
            }
          }
          ... on Category {
            id
            name
            posts {
              nodes {
                date
                title
                commentCount
                viewCount
                excerpt
                uri
                categories {
                  nodes {
                    name
                    databaseId
                    uri
                  }
                }
                featuredImage {
                  node {
                    srcSet
                    sourceUrl
                    altText
                    mediaDetails {
                      height
                      width
                    }
                  }
                }
              }
            }
          }
          ... on Tag {
            id
            name
            posts {
              nodes {
                date
                title
                commentCount
                viewCount
                excerpt
                uri
                categories {
                  nodes {
                    name
                    databaseId
                    uri
                  }
                }
                featuredImage {
                  node {
                    srcSet
                    sourceUrl
                    altText
                    mediaDetails {
                      height
                      width
                    }
                  }
                }
              }
            }
          }
        }
      }
    `,
    variables: {
      uri: uri,
    },
    context,
    // Read-after-write data (article + comments): LruLink caches it but
    // treats it as STRONG_CONSISTENCY — expired entries wait for the network
    // instead of serving stale (see ADR-0024). no-cache keeps the request
    // flowing through LruLink every time (network-only would write back to
    // InMemoryCache and pin stale data, see ADR-0029).
    fetchPolicy: "no-cache",
  });
  return data;
}

export async function getAllUris() {
  const { data } = await client.query({
    query: gql`
      query GetAllUris($first: Int!) {
        terms {
          nodes {
            databaseId
            uri
          }
        }
        posts(first: $first) {
          nodes {
            databaseId
            uri
          }
        }
        pages(first: $first) {
          nodes {
            databaseId
            uri
          }
        }
      }
    `,
    variables: { first: 100 },
  });
  const uris = Object.values(data as any)
    .reduce<any[]>(function (acc: any[], currentValue: any) {
      return acc.concat(currentValue.nodes);
    }, [])
    .filter((node: any) => node.uri !== null)
    .map((node) => {
      let trimmedURI = node.uri.substring(1);
      return {
        params: {
          uri: trimmedURI,
          id: node?.databaseId?.toString() ?? "0",
        },
      };
    });
  return uris;
}

// ── Timeline page queries (ADR-0016) ────────────────────────────────────────

// Paginated posts for the timeline list. Light fields only (no content).
export async function getTimelinePosts(
  page = 1,
  perPage = 10,
): Promise<{ nodes: any[]; total: number }> {
  const query = gql`
    query TimelinePosts($first: Int!, $offset: Int!) {
      posts(
        first: $first
        where: {
          offsetPagination: { size: $first, offset: $offset }
          orderby: { field: DATE, order: DESC }
        }
      ) {
        pageInfo {
          offsetPagination {
            total
          }
        }
        nodes {
          databaseId
          date
          uri
          title
          viewCount
          commentCount
        }
      }
    }
  `;
  const variables = { first: perPage, offset: (page - 1) * perPage };
  const { data } = await client.query({ query, variables });
  return {
    nodes: data.posts.nodes,
    total: data.posts.pageInfo?.offsetPagination?.total ?? 0,
  };
}

// All posts' light fields (date/viewCount/commentCount) for the heatmap +
// stats aggregation. Fetches ALL posts by paging through the connection
// (WPGraphQL caps `first` at 100) and caches each page 60s.
export async function getTimelineStats(): Promise<any[]> {
  const all: any[] = [];
  const PAGE = 100;
  const query = gql`
    query TimelineStats($first: Int!, $offset: Int!) {
      posts(
        first: $first
        where: {
          offsetPagination: { size: $first, offset: $offset }
          orderby: { field: DATE, order: DESC }
        }
      ) {
        pageInfo {
          offsetPagination {
            total
          }
        }
        nodes {
          databaseId
          date
          uri
          title
          viewCount
          commentCount
        }
      }
    }
  `;
  let offset = 0;
  for (;;) {
    const { data } = await client.query({
      query,
      variables: { first: PAGE, offset },
    });
    const nodes = data.posts.nodes || [];
    all.push(...nodes);
    // Stop by the server-reported total instead of node count so a total that
    // is an exact multiple of PAGE doesn't trigger one empty trailing request.
    const total = data.posts?.pageInfo?.offsetPagination?.total ?? 0;
    offset += PAGE;
    if (offset >= total) break;
  }
  return all;
}

// ── Hover link preview (ADR-0025) ──────────────────────────────────────────

// Lightweight preview payloads for the hover card. Uses nodeByUri so any
// same-site URI (post/page/category/tag) resolves in one query. Term cards
// optionally carry the most recent post titles; `recent` of 0 means total
// only. Low-volatility data → SWR cache (TTL 300s), no STRONG_CONSISTENCY.
export async function previewByUriQuery(
  uri: string,
  recent = 3,
  includeRecent = true,
) {
  const query = gql`
    query PreviewByUri($uri: String!, $recent: Int!, $includeRecent: Boolean!) {
      nodeByUri(uri: $uri) {
        __typename
        ... on Post {
          title
          uri
          date
          excerpt
          content
          commentCount
          viewCount
          featuredImage {
            node {
              sourceUrl
            }
          }
        }
        ... on Page {
          title
          uri
          date
          excerpt
          content
          commentCount
          featuredImage {
            node {
              sourceUrl
            }
          }
        }
        ... on Category {
          name
          uri
          taxonomyName
          description
          count
          posts(first: $recent) @include(if: $includeRecent) {
            nodes {
              title
              uri
              date
            }
          }
        }
        ... on Tag {
          name
          uri
          taxonomyName
          description
          count
          posts(first: $recent) @include(if: $includeRecent) {
            nodes {
              title
              uri
              date
            }
          }
        }
      }
    }
  `;
  const { data } = await client.query({
    query,
    variables: { uri, recent, includeRecent },
  });
  return data;
}

// Theme "阅读增强" settings bridged from WP options via RootQuery.maltoseSettings.
export async function maltoseSettingsQuery() {
  const query = gql`
    query MaltoseSettings {
      maltoseSettings {
        previewEnabled
        previewDelay
        previewExcerptLen
        previewWpm
        previewCacheTtl
        previewRecent
      }
    }
  `;
  const { data } = await client.query({ query, variables: {} });
  return data;
}

// ── Stats dashboard queries (ADR-0026) ─────────────────────────────────────

// Category counts for the /stats category-share section. Light fields only.
export async function statsCategoriesQuery() {
  const query = gql`
    query StatsCategories {
      categories(first: 100) {
        nodes {
          id
          databaseId
          name
          uri
          count
        }
      }
    }
  `;
  const { data } = await client.query({ query, variables: {} });
  return data;
}

// Every comment's author name for the commenter leaderboard. `author` is
// public (unlike authorIp), so the dashboard aggregates it client-side via
// cursor pagination (WPGraphQL caps `first` at 100).
export async function getAllComments(): Promise<any[]> {
  const all: any[] = [];
  const PAGE = 100;
  const query = gql`
    query StatsComments($first: Int!, $after: String) {
      comments(first: $first, after: $after, where: { order: ASC }) {
        pageInfo {
          endCursor
          hasNextPage
        }
        nodes {
          id
          author {
            node {
              name
            }
          }
        }
      }
    }
  `;
  let after: string | null = null;
  for (;;) {
    const { data } = await client.query({
      query,
      variables: { first: PAGE, after },
    });
    const nodes = data.comments?.nodes || [];
    all.push(...nodes);
    const pageInfo = data.comments?.pageInfo;
    if (!pageInfo?.hasNextPage || !pageInfo.endCursor) break;
    after = pageInfo.endCursor;
  }
  return all;
}

// Province/country leaderboards aggregated server-side by WordPress
// (bypasses the private Comment.authorIp field — see ADR-0026). Includes the
// siteBirthday option (fallback handled on the page when null).
export async function commentGeoStatsQuery() {
  const query = gql`
    query CommentGeoStats {
      siteBirthday
      commentGeoStats {
        total
        resolved
        updatedAt
        provinces {
          name
          count
        }
        countries {
          name
          count
        }
      }
    }
  `;
  const { data } = await client.query({ query, variables: {} });
  return data;
}

// All posts' content for the 累计字数 (cumulative word count) aggregate.
// Word count can't be derived from getTimelineStats' light fields, so this
// pages through every post fetching content only, then sums stripped text
// length client-side. Cached 300s like the other stats queries.
export async function getStatsContents(): Promise<string[]> {
  const all: string[] = [];
  const PAGE = 100;
  const query = gql`
    query StatsContent($first: Int!, $offset: Int!) {
      posts(
        first: $first
        where: {
          offsetPagination: { size: $first, offset: $offset }
          orderby: { field: DATE, order: DESC }
        }
      ) {
        pageInfo {
          offsetPagination {
            total
          }
        }
        nodes {
          content
        }
      }
    }
  `;
  let offset = 0;
  for (;;) {
    const { data } = await client.query({
      query,
      variables: { first: PAGE, offset },
    });
    const nodes = data.posts?.nodes || [];
    for (const node of nodes) {
      if (node?.content) all.push(node.content);
    }
    const total = data.posts?.pageInfo?.offsetPagination?.total ?? 0;
    offset += PAGE;
    if (offset >= total) break;
  }
  return all;
}

// Approximate 字数: strip HTML tags, collapse whitespace, then count
// CJK characters + latin/numeric words individually. Matches how the
// reference dashboard counts 累计字数.
export function countContentWords(html: string): number {
  if (!html) return 0;
  const text = html
    .replace(/<[^>]*>/g, " ")
    .replace(/&[a-zA-Z#0-9]+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const cjk = text.match(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g) || [];
  const cjkCount = cjk.length;
  const latin = text
    .replace(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 0).length;
  return cjkCount + latin;
}
