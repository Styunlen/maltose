"use client";

import * as React from "react";
import MarkdownEditor from "@/components/MarkdownEditor";
import type { MarkdownEditorHandle } from "@/components/MarkdownEditor";
import type { FlatComment } from "./types";

/* ─── Inline Edit Box ─── */
// Renders in place below the comment's collapsed bubble. Fetches the raw
// markdown on mount, then lets the user edit and save/cancel.
// The editor stays read-only until both the Cherry instance is ready and the
// raw content has been filled in (see ADR-0006).
export function InlineEditBox({
  comment,
  onSave,
  onCancel,
}: {
  comment: FlatComment;
  onSave: (md: string) => void;
  onCancel: () => void;
}) {
  const ref = React.useRef<MarkdownEditorHandle>(null);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  // 编辑器实例就绪前缓存 raw 内容，onReady 后一次性填充
  const rawRef = React.useRef<string | null>(null);
  const [editorReady, setEditorReady] = React.useState(false);
  const [rawLoaded, setRawLoaded] = React.useState(false);
  const loadingDone = editorReady && rawLoaded;

  const fillRaw = React.useCallback((md: string) => {
    rawRef.current = md;
    if (ref.current) {
      ref.current.setMarkdown(md);
      ref.current.setDisabled(false);
    }
    setRawLoaded(true);
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    fetch("/api/comments/raw", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commentDatabaseId: comment.databaseId }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        fillRaw(data.content || comment.rawContent || "");
      })
      .catch(() => {
        if (cancelled) return;
        fillRaw(comment.rawContent || "");
      });
    return () => {
      cancelled = true;
    };
  }, [comment.databaseId, comment.rawContent, fillRaw]);

  const handleEditorReady = React.useCallback(() => {
    setEditorReady(true);
    // Cherry 就绪后立即使编辑框只读，防止 raw 填充前的输入被 setMarkdown 覆盖
    ref.current?.setDisabled(true);
    if (rawRef.current !== null) {
      ref.current?.setMarkdown(rawRef.current);
      ref.current?.setDisabled(false);
      setRawLoaded(true);
    }
  }, []);

  const handleSave = async () => {
    const md = ref.current?.getMarkdown()?.trim();
    if (!md || saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/comments/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commentId: comment.id, content: md }),
      });
      if (res.ok) {
        onSave(md);
      } else {
        const d = await res.json();
        setError(d?.error || "保存失败");
      }
    } catch {
      setError("保存失败，请重试");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="inline-edit-box"
      style={{
        padding: "0.75rem 1rem",
        background:
          "color-mix(in oklch, var(--primary) 5%, transparent)",
        border: "1px solid var(--primary)",
        borderRadius: "var(--radius)",
        marginTop: "0.5rem",
        position: "relative",
      }}
    >
      <div
        style={{
          fontSize: "0.8rem",
          fontWeight: 600,
          color: "var(--primary)",
          marginBottom: "0.4rem",
        }}
      >
        编辑评论
      </div>
      <MarkdownEditor ref={ref} minHeight={120} onReady={handleEditorReady} />
      {!loadingDone && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 5,
            background:
              "color-mix(in oklch, var(--card) 60%, transparent)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.5rem",
            borderRadius: "var(--radius)",
            fontSize: "0.85rem",
            color: "var(--muted-foreground)",
          }}
        >
          <span
            style={{
              width: 14,
              height: 14,
              border: "2px solid var(--border)",
              borderTopColor: "var(--primary)",
              borderRadius: "50%",
              animation: "chat-spin 0.8s linear infinite",
            }}
          />
          正在加载评论内容…
        </div>
      )}
      {error && (
        <p style={{ color: "var(--destructive)", fontSize: "0.8rem", marginTop: "0.4rem" }}>
          {error}
        </p>
      )}
      <div
        style={{
          display: "flex",
          gap: "0.5rem",
          justifyContent: "flex-end",
          marginTop: "0.5rem",
        }}
      >
        <button
          type="button"
          onClick={onCancel}
          style={{
            padding: "0.35rem 1rem",
            fontSize: "0.8rem",
            fontWeight: 600,
            color: "var(--muted-foreground)",
            background: "var(--muted)",
            border: "1px solid var(--border)",
            borderRadius: 9999,
            cursor: "pointer",
          }}
        >
          取消
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !loadingDone}
          style={{
            padding: "0.35rem 1rem",
            fontSize: "0.8rem",
            fontWeight: 600,
            color: "#fff",
            background: "var(--primary)",
            border: "none",
            borderRadius: 9999,
            cursor: "pointer",
            opacity: saving || !loadingDone ? 0.6 : 1,
          }}
        >
          {saving ? "保存中…" : "保存"}
        </button>
      </div>
      <style>{`
        @keyframes chat-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
