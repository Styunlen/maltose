"use client";

import * as React from "react";
import "cherry-markdown/dist/cherry-markdown.css";

export interface MarkdownEditorHandle {
  getMarkdown: () => string;
  setMarkdown: (md: string) => void;
  setDisabled: (disabled: boolean) => void;
}

const MarkdownEditor = React.forwardRef<MarkdownEditorHandle, {
  disabled?: boolean;
  minHeight?: number;
  onReady?: () => void;
}>(({ disabled, minHeight, onReady }, ref) => {
  const uid = React.useId();
  const containerRef = React.useRef<HTMLDivElement>(null);
  const cherryRef = React.useRef<any>(null);
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    let cherryInstance: any = null;

    (async () => {
      try {
        const Cherry = (await import("cherry-markdown")).default;
        if (cancelled || !containerRef.current) return;

        // Apply border-radius and overflow to the container after mount
        containerRef.current.style.borderRadius = "var(--radius)";
        containerRef.current.style.overflow = "hidden";
        containerRef.current.style.border = "1px solid var(--border)";

        cherryInstance = new Cherry({
          el: containerRef.current,
          value: "",
          height: `${minHeight || 200}px`,
          editor: {
            defaultModel: "editOnly",
          },
          toolbars: {
            toolbar: [
              "switchModel",
              "|",
              "bold",
              "italic",
              "strikethrough",
              "header",
              "listOl",
              "listUl",
              "link",
              "codeBlock",
              "blockquote",
              "image",
              "table",
              "hr",
            ],
          },
        });

        cherryRef.current = cherryInstance;
        if (!cancelled) {
          setReady(true);
          // Notify parent that the editor instance is ready for setMarkdown
          onReady?.();
        }
      } catch (err) {
        console.error("Cherry Markdown init failed:", err);
      }
    })();

    return () => {
      cancelled = true;
      cherryInstance?.destroy?.();
      cherryRef.current = null;
    };
  }, []);

  React.useImperativeHandle(ref, () => ({
    getMarkdown: () => cherryRef.current?.getMarkdown?.() || "",
    setMarkdown: (md: string) => cherryRef.current?.setMarkdown?.(md),
    // Toggle read-only by flipping contentEditable on CodeMirror's content
    // DOM. Cherry's EditorState.readOnly is a facet (not a StateEffect), so
    // dispatching it directly breaks the view; DOM-level toggling is safe and
    // sufficient for blocking input during the raw-content load window.
    setDisabled: (d: boolean) => {
      const view = cherryRef.current?.getCodeMirror?.();
      const dom = view?.contentDOM;
      if (dom) {
        dom.contentEditable = d ? "false" : "true";
      }
    },
  }));

  return (
    <div style={{ position: "relative", width: "100%" }}>
      {!ready && (
        <div
          style={{
            padding: "0.6rem 0.8rem",
            fontSize: "0.85rem",
            color: "var(--muted-foreground)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
            background: "var(--muted)",
            minHeight: (minHeight || 200) - 10,
          }}
        >
          编辑器加载中…
        </div>
      )}
      <div
        id={uid}
        ref={containerRef}
        style={{
          display: ready ? "block" : "none",
        }}
      />
      <style>{`
        #${uid} .cherry {
          border: none !important;
        }
      `}</style>
    </div>
  );
});

MarkdownEditor.displayName = "MarkdownEditor";
export default MarkdownEditor;
