import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const LOGGER_ENV_KEYS = [
  "LOG_LEVEL",
  "NTFY_URL",
  "NTFY_TOKEN",
  "NTFY_USER",
  "NTFY_PASSWORD",
  "NTFY_LEVEL",
  "NTFY_DEDUP_MS",
] as const;

type LoggerEnv = Partial<Record<(typeof LOGGER_ENV_KEYS)[number], string>>;

async function loadLogger(env: LoggerEnv = {}) {
  vi.resetModules();
  for (const key of LOGGER_ENV_KEYS) delete process.env[key];
  Object.assign(process.env, env);
  return import("./logger");
}

async function flushNtfy() {
  await new Promise<void>((resolve) => setImmediate(resolve));
  await Promise.resolve();
}

describe("logger ntfy routing", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let stdoutWrite: ReturnType<typeof vi.spyOn>;
  let originalStdoutMaxListeners: number;

  beforeAll(() => {
    originalStdoutMaxListeners = process.stdout.getMaxListeners();
    process.stdout.setMaxListeners(originalStdoutMaxListeners + 50);
  });

  afterAll(() => {
    process.stdout.setMaxListeners(originalStdoutMaxListeners);
  });

  beforeEach(() => {
    fetchMock = vi.fn(async () => new Response("ok"));
    vi.stubGlobal("fetch", fetchMock);
    stdoutWrite = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    stdoutWrite.mockRestore();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.resetModules();
    for (const key of LOGGER_ENV_KEYS) delete process.env[key];
  });

  it("defaults ntfy to warn while excluding debug and info", async () => {
    const { logger } = await loadLogger({
      LOG_LEVEL: "trace",
      NTFY_URL: "https://ntfy.example.com/maltose",
    });

    logger.debug({ module: "test" }, "debug only");
    logger.info({ module: "test" }, "info only");
    logger.warn({ module: "test" }, "warn routed");
    await flushNtfy();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({
      Title: "[WARN] warn routed",
      Priority: "3",
    });
  });

  it("routes explicit alerts below the ntfy threshold", async () => {
    const { logger } = await loadLogger({
      LOG_LEVEL: "trace",
      NTFY_URL: "https://ntfy.example.com/maltose",
      NTFY_LEVEL: "error",
    });

    logger.info({ module: "cache", alert: true }, "manual alert");
    await flushNtfy();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({
      Title: "[INFO] manual alert",
      Priority: "3",
    });
  });

  it("routes explicit debug alerts even when stdout defaults to info", async () => {
    const { logger } = await loadLogger({
      NTFY_URL: "https://ntfy.example.com/maltose",
      NTFY_LEVEL: "error",
    });

    logger.debug({ module: "cache", alert: true }, "debug alert");
    await flushNtfy();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({
      Title: "[DEBUG] debug alert",
      Priority: "3",
    });
  });

  it("forwards curated event context to ntfy and keeps ntfy failures non-blocking", async () => {
    fetchMock.mockRejectedValueOnce(new Error("ntfy offline"));
    const { logger } = await loadLogger({
      LOG_LEVEL: "trace",
      NTFY_URL: "https://ntfy.example.com/maltose",
    });

    expect(() =>
      logger.error(
        {
          module: "graphql-proxy",
          op: "GetPost",
          uri: "/posts/example",
          postId: "post-123",
          databaseId: 456,
          variables: { first: 10, email: "reader@example.com", nested: { token: "secret-token" } },
          err: new Error("WordPress said no"),
        },
        "GraphQL failed",
      ),
    ).not.toThrow();
    await flushNtfy();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = String(fetchMock.mock.calls[0][1]?.body);
    expect(body).toContain("module: `graphql-proxy`");
    expect(body).toContain("op: `GetPost`");
    expect(body).toContain("uri: `/posts/example`");
    expect(body).toContain("postId: `post-123`");
    expect(body).toContain("databaseId: `456`");
    expect(body).toContain('"first": 10');
    expect(body).toContain('"email": "[Redacted]"');
    expect(body).toContain('"token": "[Redacted]"');
    expect(body).toContain("WordPress said no");
  });

  it("keeps structured context on stdout after safe sanitization", async () => {
    const { logger } = await loadLogger({ LOG_LEVEL: "trace" });

    logger.warn(
      {
        module: "stdout-check",
        op: "GetNodeByURI",
        uri: "/posts/stdout",
        variables: { uri: "/posts/stdout", token: "secret-token" },
      },
      "stdout structured",
    );
    await flushNtfy();

    const output = stdoutWrite.mock.calls.map((call) => String(call[0])).join("");
    expect(output).toContain("stdout structured");
    expect(output).toContain("stdout-check");
    expect(output).toContain("GetNodeByURI");
    expect(output).toContain("/posts/stdout");
    expect(output).toContain("[Redacted]");
    expect(output).not.toContain("secret-token");
  });

  it("redacts sensitive keys and truncates large ntfy payloads", async () => {
    const { logger } = await loadLogger({
      LOG_LEVEL: "trace",
      NTFY_URL: "https://ntfy.example.com/maltose",
    });

    logger.warn(
      {
        module: "comments/create",
        password: "pw",
        passphrase: "pw2",
        Authorization: "Bearer token",
        cookie: "sid=abc",
        otpCode: "123456",
        mailTo: "reader@example.com",
        rawCommentBody: "this raw comment body must not appear",
        variables: {
          safe: "visible",
          long: "x".repeat(5_000),
          list: Array.from({ length: 30 }, (_, index) => index),
        },
      },
      "redaction check",
    );
    await flushNtfy();

    const body = String(fetchMock.mock.calls[0][1]?.body);
    expect(body).toContain('"password": "[Redacted]"');
    expect(body).toContain('"passphrase": "[Redacted]"');
    expect(body).toContain('"Authorization": "[Redacted]"');
    expect(body).toContain('"cookie": "[Redacted]"');
    expect(body).toContain('"otpCode": "[Redacted]"');
    expect(body).toContain('"mailTo": "[Redacted]"');
    expect(body).toContain('"rawCommentBody": "[Redacted]"');
    expect(body).toContain('"safe": "visible"');
    expect(body).toContain("[Truncated]");
    expect(body).not.toContain("reader@example.com");
    expect(body).not.toContain("this raw comment body must not appear");
    expect(body.length).toBeLessThanOrEqual(8_200);
  });

  it("redacts interpolation/rest object arguments on stdout", async () => {
    const { logger } = await loadLogger({ LOG_LEVEL: "trace" });

    logger.warn("interpolated %o", { token: "secret-token", nested: { Authorization: "Bearer secret" } });
    await flushNtfy();

    const output = stdoutWrite.mock.calls.map((call) => String(call[0])).join("");
    expect(output).toContain("interpolated");
    expect(output).toContain("[Redacted]");
    expect(output).not.toContain("secret-token");
    expect(output).not.toContain("Bearer secret");
  });

  it("deduplicates by event identity, not message alone", async () => {
    const { logger } = await loadLogger({
      LOG_LEVEL: "trace",
      NTFY_URL: "https://ntfy.example.com/maltose",
      NTFY_DEDUP_MS: "60000",
    });

    logger.warn({ module: "comments", event: "mutation.failed", postId: "post-a" }, "same message");
    logger.warn({ module: "comments", event: "mutation.failed", postId: "post-b" }, "same message");
    logger.warn({ module: "comments", event: "mutation.failed", postId: "post-a" }, "same message");
    await flushNtfy();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const bodies = fetchMock.mock.calls.map((call) => String(call[1]?.body));
    expect(bodies[0]).toContain("postId: `post-a`");
    expect(bodies[1]).toContain("postId: `post-b`");
  });

  it("prefers token auth over basic auth for ntfy", async () => {
    const { logger } = await loadLogger({
      LOG_LEVEL: "trace",
      NTFY_URL: "https://ntfy.example.com/maltose",
      NTFY_TOKEN: "tk_secret",
      NTFY_USER: "user",
      NTFY_PASSWORD: "password",
    });

    logger.error("auth check");
    await flushNtfy();

    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({
      Authorization: "Bearer tk_secret",
    });
  });

  it("uses basic auth for ntfy when token auth is absent", async () => {
    const { logger } = await loadLogger({
      LOG_LEVEL: "trace",
      NTFY_URL: "https://ntfy.example.com/maltose",
      NTFY_USER: "user",
      NTFY_PASSWORD: "password",
    });

    logger.error("basic auth check");
    await flushNtfy();

    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({
      Authorization: "Basic dXNlcjpwYXNzd29yZA==",
    });
  });
});
