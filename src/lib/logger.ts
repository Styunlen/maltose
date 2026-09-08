import { Writable } from "node:stream";
import pino, { type Logger, type DestinationStream } from "pino";
import pretty from "pino-pretty";

/**
 * Application logger (pino, ADR-0034 runtime-env + ADR-0037).
 *
 * Reads configuration from process.env at module load (NOT import.meta.env —
 * Astro inlines those at build time, which is exactly what ADR-0034 removed).
 * Level follows pino's npm levels: error < warn < info < debug.
 *
 * Outputs:
 *  - stdout — human-readable via pino-pretty. Colored when stdout is a TTY
 *    (dev terminal); colorless when piped to a file/pm2 (pino-pretty's
 *    colorize follows colorette.isColorSupported, so pm2 log files never get
 *    ANSI codes). All environments get the pretty text (no log aggregator is
 *    consuming NDJSON today — ADR-0037).
 *  - optional ntfy sink when NTFY_URL is set (self-hosted ntfy push). The
 *    sink runs in the MAIN thread (pino stream, not worker transport):
 *    fire-and-forget HTTP, never blocks the caller, and avoids the
 *    "worker transport needs a standalone file" problem under Astro's
 *    bundling (see ADR-0034 note). It receives the same serialized NDJSON as
 *    every multistream destination, so it re-formats into a structured
 *    ntfy Markdown message (web/Android render it).
 *
 * Config:
 *  LOG_LEVEL:      minimum level to stdout (trace|debug|info|warn|error; default info)
 *  NTFY_URL:       full ntfy publish URL, e.g. https://ntfy.example.com/topic
 *  NTFY_TOKEN:     optional ntfy access token (Bearer auth, tk_…)
 *  NTFY_USER/PASSWORD: optional ntfy Basic auth (Authorization: Basic …)
 *                  — use either token OR user/password, not both
 *  NTFY_LEVEL:     minimum level that triggers a push (default "error")
 *  NTFY_DEDUP_MS:  dedup window for identical messages (default 60000)
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
const NTFY_LEVEL = (process.env.NTFY_LEVEL ?? "error").toLowerCase();
const NTFY_DEDUP_MS = Number(process.env.NTFY_DEDUP_MS) || 60_000;

// pino numeric levels: fatal=60, error=50, warn=40, info=30, debug=20.
const LEVEL_NUM: Record<string, number> = {
  fatal: 60, error: 50, warn: 40, info: 30, debug: 20, trace: 10,
};
const ntfyThreshold = LEVEL_NUM[NTFY_LEVEL] ?? 50;

// ntfy severity mapping (docs.ntfy.sh/publish): tag emoji + priority per level.
// 1=min, 2=default, 3=high, 4=urgent, 5=emergency.
const NTFY_LEVEL_STYLE: Record<
  string,
  { tag: string; priority: string }
> = {
  fatal: { tag: "rotating_light", priority: "5" },
  error: { tag: "warning", priority: "4" },
  warn: { tag: "warning", priority: "3" },
};

/** Build the ntfy Authorization header from token or Basic user/password. */
function ntfyAuthHeader(): string | undefined {
  if (NTFY_TOKEN) return `Bearer ${NTFY_TOKEN}`;
  if (NTFY_USER) {
    const cred = `${NTFY_USER}:${NTFY_PASSWORD ?? ""}`;
    return `Basic ${Buffer.from(cred, "utf8").toString("base64")}`;
  }
  return undefined;
}

// ── Optional ntfy sink (main-thread stream) ─────────────────────────────
// pino writes one NDJSON line per log into this sink. We parse it back and,
// for messages at/above NTFY_LEVEL, fire a push to the self-hosted ntfy.
// The body is structured Markdown (rendered by ntfy web + Android apps);
// severity becomes an emoji tag + priority so phone lockscreens still read
// "this is an error" without Markdown rendering.
const recent = new Map<string, number>();

function maybeSink(): DestinationStream | undefined {
  if (!NTFY_URL) return undefined;

  return new Writable({
    write(chunk, _enc, cb) {
      let info: {
        level?: number;
        levelLabel?: string;
        msg?: string;
        err?: { message?: string; stack?: string };
        op?: string;
        module?: string;
        [k: string]: unknown;
      };
      try {
        info = JSON.parse(chunk.toString());
      } catch {
        cb();
        return;
      }

      const level = info.level ?? 0;
      if (level >= ntfyThreshold) {
        const levelName = (info.levelLabel ?? "").toLowerCase() || levelNameOf(level);
        const style = NTFY_LEVEL_STYLE[levelName] ?? NTFY_LEVEL_STYLE.error;
        const message = info.msg || "maltose log";
        const now = Date.now();
        const last = recent.get(message);
        if (!last || now - last > NTFY_DEDUP_MS) {
          recent.set(message, now);
          if (recent.size > 500) {
            for (const [k, t] of recent) {
              if (now - t > NTFY_DEDUP_MS) recent.delete(k);
            }
          }
          void sendNtfy({
            message,
            levelName,
            tag: style.tag,
            priority: style.priority,
            err: info.err,
            op: info.op as string | undefined,
            module: info.module as string | undefined,
          });
        }
      }
      cb();
    },
  });
}

function levelNameOf(level: number): string {
  const byNum: Record<number, string> = { 60: "fatal", 50: "error", 40: "warn", 30: "info", 20: "debug", 10: "trace" };
  return byNum[level] ?? "info";
}

interface NtfyPayload {
  message: string;
  levelName: string;
  tag: string;
  priority: string;
  err?: { message?: string; stack?: string };
  op?: string;
  module?: string;
}

async function sendNtfy(p: NtfyPayload): Promise<void> {
  if (!NTFY_URL) return;
  try {
    // Structured Markdown body — rendered by ntfy web + Android. Lockscreen
    // shows Title (+emoji via Tags) which stays readable as plain text.
    const lines: string[] = [`**${escapeMd(p.message)}**`];
    if (p.module || p.op) {
      const ctx = [p.module && `module: \`${p.module}\``, p.op && `op: \`${p.op}\``]
        .filter(Boolean)
        .join(" · ");
      lines.push(`_${ctx}_`);
    }
    if (p.err?.message && p.err.message !== p.message) {
      lines.push(`> ${escapeMd(p.err.message)}`);
    }
    if (p.err?.stack) {
      lines.push("```\n" + p.err.stack.slice(0, 2000) + "\n```");
    }

    const auth = ntfyAuthHeader();
    // HTTP headers are Latin-1 only (fetch throws "Cannot convert argument to
    // a ByteString" on non-ASCII). ntfy does NOT url-decode header values
    // (readParam in server.go reads them raw), so the Title must be pure
    // ASCII — strip non-ASCII and keep it short. Full text lives in the body.
    const asciiTitle = p.message
      .replace(/[^\x20-\x7e]/g, "")
      .trim()
      .slice(0, 60);
    await fetch(NTFY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "text/markdown",
        Markdown: "yes",
        Title: `[${p.levelName.toUpperCase()}] ${asciiTitle || "maltose"}`,
        Tags: p.tag,
        Priority: p.priority,
        ...(auth ? { Authorization: auth } : {}),
      },
      body: lines.join("\n\n"),
    });
  } catch {
    // Silent: ntfy being down must never affect the app.
  }
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

// Single shared logger instance for the whole server process.
// stdout always; ntfy sink appended only when NTFY_URL is configured.
export const logger: AppLogger = NTFY_URL
  ? pino(
      { level: LOG_LEVEL },
      pino.multistream([
        { stream: stdoutStream, level: LOG_LEVEL },
        { stream: maybeSink() as DestinationStream, level: NTFY_LEVEL },
      ]),
    )
  : pino({ level: LOG_LEVEL }, stdoutStream);
