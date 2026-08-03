import { tap } from "rxjs";
import {
  ApolloClient,
  ApolloLink,
  InMemoryCache,
  HttpLink,
  gql,
} from "@apollo/client";
import { loadErrorMessages, loadDevMessages } from "@apollo/client/dev";
import { ErrorLink } from "@apollo/client/link/error";
import {
  CombinedGraphQLErrors,
  CombinedProtocolErrors,
} from "@apollo/client/errors";
import { RetryLink } from "@apollo/client/link/retry";

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

export const client = new ApolloClient({
  link: ApolloLink.from(
    import.meta.env.DEV
      ? [loggerLink, errorLink, httpLink]
      : [errorLink, httpLink],
  ),
  cache: new InMemoryCache(),
});

export async function getQuery(query, variables = {}) {
  const { data } = await client.query({
    query,
    variables,
  });
  return data;
}

export async function getPostQuery() {}

export async function navQuery() {
  const { data } = await client.query({
    query: gql`
      {
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
    `,
  });
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
    `,
    variables: { first, offset },
  });
  return data;
}

export async function getStickyPosts() {
  const { data } = await client.query({
    query: gql`
      query StickyPosts {
        stickyPosts {
          databaseId
          date
          uri
          title
          commentCount
          viewCount
          content
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
  });
  return data.stickyPosts || [];
}

export async function getMostViewedPosts(first = 10): Promise<any[]> {
  const { data } = await client.query({
    query: gql`
      query MostViewedPosts($first: Int!) {
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
    variables: { first },
  });
  return (data as any).mostViewedPosts || [];
}

/**
 * Fetch a random selection of published posts.
 * Fetches a larger candidate pool (candidates) then shuffles and slices it
 * client-side, avoiding ORDER BY RAND() on the WordPress side. Uses
 * network-only so the candidate pool itself refreshes on every request.
 */
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
    fetchPolicy: "network-only",
  });
  const pool = (data as any)?.mostViewedPosts || [];
  return shuffle(pool).slice(0, count);
}

function shuffle<T>(arr: T[]): T[] {
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

/**
 * Batch fetch the latest view counts for a set of posts.
 * Uses network-only so results are always fresh (bypasses the Apollo cache).
 * Returns a map of databaseId -> viewCount.
 */
export async function getViewCounts(
  ids: Array<number | string>,
): Promise<Map<string, number>> {
  const globalIds = ids.map((id) =>
    typeof id === "string" && id.includes(":")
      ? id
      : btoa(`post:${id}`),
  );

  const { data } = await client.query({
    query: gql`
      query ViewCounts($ids: [ID!]!) {
        posts(first: 100, where: { in: $ids }) {
          nodes {
            databaseId
            viewCount
          }
        }
      }
    `,
    variables: { ids: globalIds },
    fetchPolicy: "network-only",
  });

  const map = new Map<string, number>();
  const nodes = (data as any)?.posts?.nodes ?? [];
  for (const node of nodes) {
    if (node?.databaseId != null && typeof node.viewCount === "number") {
      map.set(String(node.databaseId), node.viewCount);
    }
  }
  return map;
}

export async function getRecentPosts(first = 5) {
  const { data } = await client.query({
    query: gql`
      query RecentPosts($first: Int!) {
        posts(first: $first, where: { orderby: { field: DATE, order: DESC } }) {
          nodes {
            date
            uri
            title
            viewCount
          }
        }
      }
    `,
    variables: { first },
  });
  return data.posts.nodes;
}

export async function getAllTags() {
  const { data } = await client.query({
    query: gql`
      query AllTags {
        tags(first: 100) {
          nodes {
            name
            uri
            count
          }
        }
      }
    `,
  });
  return data.tags.nodes;
}

export async function getRecentComments(first = 5) {
  const { data } = await client.query({
    query: gql`
      query RecentComments($first: Int!) {
        comments(first: $first, where: { order: DESC }) {
          nodes {
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
      }
    `,
    variables: { first },
  });
  return data.comments.nodes;
}

export async function getPostContent(postId) {
  const { data } = await client.query({
    query: gql`
      query GetPostContent($postId: ID!) {
        post(id: $postId) {
          id
          title
          date
          uri
          excerpt
          content
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
      }
    `,
    variables: {
      postId: postId,
    },
  });
  return data.post;
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
