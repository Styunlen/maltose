import { Writable } from "node:stream";
import pino, { type DestinationStream, type Logger, type LoggerOptions } from "pino";
import pretty from "pino-pretty";

/**
 * Application logger (pino, ADR-0034 runtime-env + ADR-0037).
 *
 * Reads configuration from process.env at module load (NOT import.meta.env —
 * Astro inlines those at build time, which is exactly what ADR-0034 removed).
 * Level follows pino's npm levels: fatal > error > warn > info > debug > trace.
 *
 * Outputs:
 *  - stdout — human-readable via pino-pretty. Colored when stdout is a TTY
 *    (dev terminal); colorless when piped to a file/pm2. All structured fields
 *    remain on the pino record so PM2/stdout receives the full context.
 *  - optional ntfy sink when NTFY_URL is set (self-hosted ntfy push). The
 *    sink runs in the MAIN thread (pino stream, not worker transport):
 *    fire-and-forget HTTP, never blocks the caller, and avoids the
 *    "worker transport needs a standalone file" problem under Astro's
 *    bundling. It derives the same canonical structured event as stdout, then
 *    formats a curated, redacted/truncated ntfy Markdown alert.
 *
 * Config:
 *  LOG_LEVEL:      minimum level to stdout (trace|debug|info|warn|error; default info)
 *  NTFY_URL:       full ntfy publish URL, e.g. https://ntfy.example.com/topic
 *  NTFY_TOKEN:     optional ntfy access token (Bearer auth, tk_...)
 *  NTFY_USER/PASSWORD: optional ntfy Basic auth (Authorization: Basic ...)
 *                  — use either token OR user/password, not both
 *  NTFY_LEVEL:     minimum level that triggers a push (default "warn")
 *  NTFY_DEDUP_MS:  dedup window for identical structured events (default 60000)
 */
export interface AppLogger extends Logger {
  /** Child logger bound to the given module/component name. */
  child: Logger["child"];
}

const LOG_LEVEL = (process.env.LOG_LEVEL ?? "info").toLowerCase();
const NTFY_URL = process.env.NTFY_URL;
const NTFY_TOKEN = process.env.NTFY_TOKEN;
const NTFY_USER = process.env.NTFY_USER;
const NTFY_PASSWORD = process.env.NTFY_PASSWORD;
const NTFY_LEVEL = (process.env.NTFY_LEVEL ?? "warn").toLowerCase();
const NTFY_DEDUP_MS = Number(process.env.NTFY_DEDUP_MS) || 60_000;

const MAX_DEPTH = 5;
const MAX_BREADTH = 25;
const MAX_STRING_LENGTH = 1_000;
const MAX_PAYLOAD_LENGTH = 8_000;
const REDACTED = "[Redacted]";
const TRUNCATED = "[Truncated]";

// pino numeric levels: fatal=60, error=50, warn=40, info=30, debug=20, trace=10.
const LEVEL_NUM: Record<string, number> = {
  fatal: 60,
  error: 50,
  warn: 40,
  info: 30,
  debug: 20,
  trace: 10,
};
const ntfyThreshold = LEVEL_NUM[NTFY_LEVEL] ?? LEVEL_NUM.warn;

// ntfy severity mapping (docs.ntfy.sh/publish): tag emoji + priority per level.
// 1=min, 2=default, 3=high, 4=urgent, 5=emergency.
const NTFY_LEVEL_STYLE: Record<string, { tag: string; priority: string }> = {
  fatal: { tag: "rotating_light", priority: "5" },
  error: { tag: "warning", priority: "4" },
  warn: { tag: "warning", priority: "3" },
  info: { tag: "bell", priority: "3" },
  debug: { tag: "bell", priority: "3" },
  trace: { tag: "bell", priority: "3" },
};

const recent = new Map<string, number>();

type LogRecord = {
  level?: number;
  levelLabel?: string;
  msg?: string;
  err?: unknown;
  error?: unknown;
  event?: unknown;
  alert?: unknown;
  module?: unknown;
  op?: unknown;
  uri?: unknown;
  postId?: unknown;
  databaseId?: unknown;
  variables?: unknown;
  [key: string]: unknown;
};

type CanonicalEvent = {
  level: number;
  levelName: string;
  message: string;
  alert: boolean;
  event?: string;
  module?: string;
  op?: string;
  uri?: string;
  postId?: string;
  databaseId?: string;
  variables?: unknown;
  error?: { message?: string; stack?: string; type?: string } | unknown;
  context: Record<string, unknown>;
};

function maybeSink(): DestinationStream | undefined {
  if (!NTFY_URL) return undefined;

  return new Writable({
    write(chunk, _enc, cb) {
      let record: LogRecord;
      try {
        record = JSON.parse(chunk.toString()) as LogRecord;
      } catch {
        cb();
        return;
      }

      const event = toCanonicalEvent(record);
      if (shouldRouteToNtfy(event) && shouldSendEvent(event)) {
        const style = NTFY_LEVEL_STYLE[event.levelName] ?? NTFY_LEVEL_STYLE.error;
        void sendNtfy({ event, tag: style.tag, priority: style.priority });
      }
      cb();
    },
  });
}

function toCanonicalEvent(record: LogRecord): CanonicalEvent {
  const level = typeof record.level === "number" ? record.level : 0;
  const levelName = (typeof record.levelLabel === "string" ? record.levelLabel.toLowerCase() : "") || levelNameOf(level);
  const message = typeof record.msg === "string" && record.msg.length > 0 ? record.msg : "maltose log";
  const error = record.err ?? record.error;
  const eventName = stringField(record.event);
  const context = sanitizeRecordContext(record);

  return {
    level,
    levelName,
    message,
    alert: record.alert === true,
    ...(eventName ? { event: eventName } : {}),
    ...optionalString("module", record.module),
    ...optionalString("op", record.op),
    ...optionalString("uri", record.uri),
    ...optionalString("postId", record.postId),
    ...optionalString("databaseId", record.databaseId),
    ...(record.variables !== undefined ? { variables: sanitizeValue(record.variables) } : {}),
    ...(error !== undefined ? { error: sanitizeValue(error) } : {}),
    context,
  };
}

function sanitizeRecordContext(record: LogRecord): Record<string, unknown> {
  const reserved = new Set([
    "level",
    "levelLabel",
    "time",
    "pid",
    "hostname",
    "msg",
    "err",
    "error",
    "alert",
    "event",
    "module",
    "op",
    "uri",
    "postId",
    "databaseId",
    "variables",
  ]);
  const context: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (!reserved.has(key)) context[key] = sanitizeValueByKey(key, value, 0);
  }
  return context;
}

function shouldRouteToNtfy(event: CanonicalEvent): boolean {
  return event.alert || event.level >= ntfyThreshold;
}

function shouldSendEvent(event: CanonicalEvent): boolean {
  const now = Date.now();
  const key = dedupKey(event);
  const last = recent.get(key);
  if (last && now - last <= NTFY_DEDUP_MS) return false;
  recent.set(key, now);
  if (recent.size > 500) {
    for (const [recentKey, timestamp] of recent) {
      if (now - timestamp > NTFY_DEDUP_MS) recent.delete(recentKey);
    }
  }
  return true;
}

function dedupKey(event: CanonicalEvent): string {
  return stableStringify({
    levelName: event.levelName,
    message: event.message,
    event: event.event,
    module: event.module,
    op: event.op,
    uri: event.uri,
    postId: event.postId,
    databaseId: event.databaseId,
  });
}

function levelNameOf(level: number): string {
  const byNum: Record<number, string> = { 60: "fatal", 50: "error", 40: "warn", 30: "info", 20: "debug", 10: "trace" };
  return byNum[level] ?? "info";
}

type NtfyPayload = {
  event: CanonicalEvent;
  tag: string;
  priority: string;
};

async function sendNtfy(payload: NtfyPayload): Promise<void> {
  if (!NTFY_URL) return;
  try {
    const event = payload.event;
    const lines = formatNtfyBody(event);
    const auth = ntfyAuthHeader();
    const asciiTitle = event.message
      .replace(/[^\x20-\x7e]/g, "")
      .trim()
      .slice(0, 60);
    await fetch(NTFY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "text/markdown",
        Markdown: "yes",
        Title: `[${event.levelName.toUpperCase()}] ${asciiTitle || "maltose"}`,
        Tags: payload.tag,
        Priority: payload.priority,
        ...(auth ? { Authorization: auth } : {}),
      },
      body: lines.join("\n\n"),
    });
  } catch {
    // Silent: ntfy being down must never affect the app.
  }
}

function formatNtfyBody(event: CanonicalEvent): string[] {
  const lines: string[] = [`**${escapeMd(event.message)}**`];
  const summary = [
    event.event && `event: \`${event.event}\``,
    event.module && `module: \`${event.module}\``,
    event.op && `op: \`${event.op}\``,
    event.uri && `uri: \`${event.uri}\``,
    event.postId && `postId: \`${event.postId}\``,
    event.databaseId && `databaseId: \`${event.databaseId}\``,
  ]
    .filter(Boolean)
    .join(" · ");
  if (summary) lines.push(`_${summary}_`);

  const error = normalizedError(event.error);
  if (error?.message && error.message !== event.message) lines.push(`> ${escapeMd(error.message)}`);
  if (event.variables !== undefined) lines.push(formatPayloadSection("variables", event.variables));
  if (Object.keys(event.context).length > 0) lines.push(formatPayloadSection("context", event.context));
  if (error?.stack) lines.push("```\n" + truncateString(error.stack, 2_000) + "\n```");
  return boundBody(lines);
}

function formatPayloadSection(label: string, value: unknown): string {
  return `${label}:\n\`\`\`json\n${truncateString(JSON.stringify(value, null, 2) ?? "null", MAX_PAYLOAD_LENGTH)}\n\`\`\``;
}

function boundBody(lines: string[]): string[] {
  const bounded: string[] = [];
  let total = 0;
  for (const line of lines) {
    const remaining = MAX_PAYLOAD_LENGTH - total;
    if (remaining <= 0) break;
    const next = line.length > remaining ? `${line.slice(0, Math.max(0, remaining - TRUNCATED.length))}${TRUNCATED}` : line;
    bounded.push(next);
    total += next.length + 2;
    if (line.length > remaining) break;
  }
  return bounded;
}

function ntfyAuthHeader(): string | undefined {
  if (NTFY_TOKEN) return `Bearer ${NTFY_TOKEN}`;
  if (NTFY_USER) {
    const cred = `${NTFY_USER}:${NTFY_PASSWORD ?? ""}`;
    return `Basic ${Buffer.from(cred, "utf8").toString("base64")}`;
  }
  return undefined;
}

function sanitizeValue(value: unknown): unknown {
  return sanitizeValueByKey("", value, 0);
}

function sanitizeLogArgs(args: unknown[]): unknown[] {
  if (args.length === 0) return args;
  const [first, ...rest] = args;
  if (first instanceof Error) return [{ err: sanitizeValue(first) }, ...rest.map(sanitizeLogArg)];
  if (first && typeof first === "object" && !Array.isArray(first)) {
    return [sanitizeObject(first as Record<string, unknown>, 0), ...rest.map(sanitizeLogArg)];
  }
  return [sanitizeLogArg(first), ...rest.map(sanitizeLogArg)];
}

function sanitizeLogArg(value: unknown): unknown {
  if (value instanceof Error) return sanitizeValue(value);
  if (Array.isArray(value)) return sanitizeArray(value, 0);
  if (value && typeof value === "object") return sanitizeObject(value as Record<string, unknown>, 0);
  return typeof value === "string" ? truncateString(value, MAX_STRING_LENGTH) : value;
}

function sanitizeValueByKey(key: string, value: unknown, depth: number): unknown {
  if (isSensitiveKey(key)) return REDACTED;
  if (value instanceof Error) {
    return sanitizeObject({ type: value.name, message: value.message, stack: value.stack }, depth);
  }
  if (typeof value === "string") return truncateString(value, MAX_STRING_LENGTH);
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "undefined") return undefined;
  if (typeof value === "function") return "[Function]";
  if (typeof value === "symbol") return value.toString();
  if (Array.isArray(value)) return sanitizeArray(value, depth);
  if (typeof value === "object") return sanitizeObject(value as Record<string, unknown>, depth);
  return String(value);
}

function sanitizeArray(value: unknown[], depth: number): unknown[] {
  if (depth >= MAX_DEPTH) return [TRUNCATED];
  const items = value.slice(0, MAX_BREADTH).map((item) => sanitizeValueByKey("", item, depth + 1));
  if (value.length > MAX_BREADTH) items.push(TRUNCATED);
  return items;
}

function sanitizeObject(value: Record<string, unknown>, depth: number): Record<string, unknown> {
  if (depth >= MAX_DEPTH) return { [TRUNCATED]: true };
  const sanitized: Record<string, unknown> = {};
  const entries = Object.entries(value).slice(0, MAX_BREADTH);
  for (const [key, item] of entries) sanitized[key] = sanitizeValueByKey(key, item, depth + 1);
  if (Object.keys(value).length > MAX_BREADTH) sanitized[TRUNCATED] = true;
  return sanitized;
}

function isSensitiveKey(key: string): boolean {
  return /password|pass|token|secret|authorization|auth|cookie|code|otp|email|mail|headers?|query|comment.*body|raw.*body/i.test(key);
}

function optionalString<K extends string>(key: K, value: unknown): Partial<Record<K, string>> {
  const field = stringField(value);
  return field ? { [key]: field } as Partial<Record<K, string>> : {};
}

function stringField(value: unknown): string | undefined {
  if (typeof value === "string" && value.length > 0) return truncateString(value, MAX_STRING_LENGTH);
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") return String(value);
  return undefined;
}

function normalizedError(error: unknown): { message?: string; stack?: string; type?: string } | undefined {
  if (!error || typeof error !== "object") return undefined;
  const record = error as Record<string, unknown>;
  return {
    ...(typeof record.message === "string" ? { message: record.message } : {}),
    ...(typeof record.stack === "string" ? { stack: record.stack } : {}),
    ...(typeof record.type === "string" ? { type: record.type } : {}),
  };
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function truncateString(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - TRUNCATED.length))}${TRUNCATED}`;
}

/** Escape markdown specials in untrusted log text so it renders literally. */
function escapeMd(s: string): string {
  return s.replace(/([\\`*_[\]])/g, "\\$1");
}

// stdout stream: pino-pretty, colored only when attached to a TTY.
// pino-pretty's default destination is a SonicBoom on raw fd 1, which BYPASSES
// process.stdout.write — under pm2 (and other supervisors that capture stdout
// by wrapping the stream) that output is lost. Explicitly passing
// `destination: process.stdout` routes through the stream pm2 intercepts, so
// logs actually reach the pm2 out file. Color still follows isTTY (pm2 pipe →
// colorless).
const stdoutStream = pretty({
  destination: process.stdout,
  colorize: process.stdout.isTTY,
});

const loggerOptions: LoggerOptions = {
  level: NTFY_URL ? "trace" : LOG_LEVEL,
  hooks: {
    logMethod(args, method) {
      return method.apply(this, sanitizeLogArgs(args as unknown[]) as Parameters<typeof method>);
    },
  },
};

// Single shared logger instance for the whole server process.
// stdout always; ntfy sink appended only when NTFY_URL is configured.
export const logger: AppLogger = NTFY_URL
  ? pino(
      loggerOptions,
      pino.multistream([
        { stream: stdoutStream, level: LOG_LEVEL },
        { stream: maybeSink() as DestinationStream, level: "trace" },
      ]),
    )
  : pino(loggerOptions, stdoutStream);
