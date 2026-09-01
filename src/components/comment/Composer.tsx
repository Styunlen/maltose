"use client";

import * as React from "react";
import MarkdownEditor from "@/components/MarkdownEditor";
import type { MarkdownEditorHandle } from "@/components/MarkdownEditor";
import { MessageSquare } from "lucide-react";

/* ─── Comment Composer (shared) ───
 * Unified "new/reply comment" interaction for both the footer CommentSection
 * and the paragraph comment popup (ADR-0036 P3): a Cherry markdown editor +
 * submit button + reply-state banner + inline error display.
 */
export interface CommentComposerProps {
  postDatabaseId: number;
  /** Reply target parentId; when set the submit button reads "提交回复". */
  parent?: number | null;
  /** When set, shows the "回复 @name" banner above the editor. */
  replyTargetName?: string | null;
  /** Clears the parent/reply state (called when the banner's cancel is hit). */
  onCancelReply?: () => void;
  /** Paragraph anchor (popup only). */
  blockReference?: { clientId: string; snippet: string } | null;
  /** Called after a successful submit (after the editor is cleared). */
  onPosted?: () => void;
  placeholder?: string;
  minHeight?: number;
  /** "panel" tweaks the spacing for the floating paragraph panel. */
  variant?: "inline" | "panel";
}

export function CommentComposer({
  postDatabaseId,
  parent,
  replyTargetName,
  onCancelReply,
  blockReference,
  onPosted,
  minHeight,
  variant = "inline",
}: CommentComposerProps) {
  const editorRef = React.useRef<MarkdownEditorHandle>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const content = editorRef.current?.getMarkdown?.()?.trim() || "";
    if (!content || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/comments/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          postDatabaseId,
          content,
          parent: parent || undefined,
          blockReference: blockReference || undefined,
          userAgent: navigator.userAgent,
        }),
      });
      const data = await res.json();
      if (!res.ok || data?.error) {
        setError(data?.error || "提交失败，请稍后重试");
        return;
      }
      editorRef.current?.setMarkdown("");
      // Both CommentSection and ParagraphComments listen for this to refresh.
      window.dispatchEvent(new CustomEvent("maltose:comment-posted"));
      onPosted?.();
    } catch {
      setError("网络异常，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      className={
        variant === "panel"
          ? "comment-composer comment-composer--panel"
          : "comment-composer"
      }
      onSubmit={submit}
    >
      {replyTargetName && (
        <div className="comment-composer__replybar">
          <MessageSquare className="comment-composer__replybar-icon" />
          <span className="comment-composer__replybar-text">
            回复 @{replyTargetName}
          </span>
          <button
            type="button"
            className="comment-composer__replybar-cancel"
            onClick={onCancelReply}
          >
            取消回复
          </button>
        </div>
      )}
      <MarkdownEditor
        ref={editorRef}
        disabled={submitting}
        minHeight={minHeight ?? (variant === "panel" ? 120 : 160)}
      />
      {error && <p className="comment-composer-error">{error}</p>}
      <div className="comment-composer__actions">
        <span className="comment-composer__hint">支持 Markdown</span>
        <button
          type="submit"
          className="comment-composer__submit"
          disabled={submitting}
        >
          {submitting ? "提交中…" : parent ? "提交回复" : "发表评论"}
        </button>
      </div>
    </form>
  );
}
