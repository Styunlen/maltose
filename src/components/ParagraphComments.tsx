import * as React from "react";
import { createPortal } from "react-dom";
import { MessageGroup } from "@components/ui/message";
import ConfirmDialog from "@/components/ConfirmDialog";
import { commentDateValue } from "@lib/time";
import {
  useEditStore,
  startEdit,
  cancelEdit,
  editTargetStore,
  type EditScope,
} from "@/stores/edit-store";
import {
  buildCommentMap,
  groupByAuthor,
  type FlatComment,
} from "@/components/comment/types";
import { ChatBubble } from "@/components/comment/ChatBubble";
import { CommentComposer } from "@/components/comment/Composer";
import { CommentTooltipProvider } from "@/components/comment/CommentTooltipProvider";
// Client-side markdown rendering for dynamic comment refresh
import { marked } from "marked";
import DOMPurify from "dompurify";

interface ParagraphCommentsProps {
  comments: any[];
  postDatabaseId: number;
  postUri?: string;
  canComment: boolean;
  loginUrl?: string;
  currentUserId?: number | null;
  siteOwnerUserIds?: number[];
  blockClientIds?: string[];
}

/**
 * Paragraph comments (ADR-0036 P3): a React island mounted over the article
 * body. Uses event delegation on `.block-comment-trigger` (rendered by
 * BlockRenderer on CoreParagraph/CoreListItem) to toggle an inline comment
 * panel inserted right after the clicked block. Comments come from the same
 * flat list as the footer CommentSection — two-way synced by construction.
 */
export default function ParagraphComments({
  comments: initialComments,
  postDatabaseId,
  postUri,
  canComment,
  loginUrl = "/login",
  currentUserId,
  siteOwnerUserIds,
  blockClientIds = [],
}: ParagraphCommentsProps) {
  const [activeBlockId, setActiveBlockId] = React.useState<string | null>(null);
  const [comments, setComments] = React.useState<any[]>(initialComments);
  const { editingId, scope, isEditing } = useEditStore();
  const [rebinding, setRebinding] = React.useState<FlatComment | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<string | null>(null);
  const [pendingEdit, setPendingEdit] = React.useState<string | null>(null);
  const [confirmClose, setConfirmClose] = React.useState(false);

  // Cancel any panel-scoped edit when the island unmounts so an in-progress
  // edit never leaks across pages (mirrors CommentSection's unmount cleanup).
  React.useEffect(() => {
    return () => {
      const t = editTargetStore.get();
      if (t?.scope === "panel") cancelEdit();
    };
  }, []);

  const commentMap = React.useMemo(() => buildCommentMap(comments), [comments]);

  const blockComments = activeBlockId
    ? comments.filter((c) => c.blockReference?.clientId === activeBlockId)
    : [];

  const flatBlockComments = React.useMemo(
    () =>
      [...blockComments]
        .sort((a, b) => commentDateValue(a.date) - commentDateValue(b.date))
        .map((c) => commentMap.get(c.databaseId))
        .filter(Boolean) as FlatComment[],
    [blockComments, commentMap],
  );

  // Two-way sync (ADR-0036 P3): when the footer CommentSection posts/rebinds,
  // it dispatches maltose:comment-posted; re-fetch so the paragraph panel
  // reflects the change too.
  React.useEffect(() => {
    if (!postUri) return;
    const onRefresh = () => {
      fetch(`/api/graphql-proxy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: `query RefreshBlockComments($uri: String!) {
            nodeByUri(uri: $uri) {
              ... on Post { comments(first: 100, where: { order: ASC }) { nodes { id databaseId parentId parentDatabaseId content author { node { name databaseId email url avatar { url size } } } date agentPublic agent commentGeo { country province } blockReference { clientId snippet } } } }
              ... on Page { comments(first: 100, where: { order: ASC }) { nodes { id databaseId parentId parentDatabaseId content author { node { name databaseId email url avatar { url size } } } date agentPublic agent commentGeo { country province } blockReference { clientId snippet } } } }
            }
          }`,
          variables: { uri: postUri },
        }),
      })
        .then((r) => r.json())
        .then((d) => {
          const nodes = d?.data?.nodeByUri?.comments?.nodes;
          if (Array.isArray(nodes)) {
            // Merge refresh: full field set (author/date/geo) so brand-new
            // comments posted from anywhere render correctly. Existing entries
            // keep their rich SSR fields (rendered content, rawContent); only
            // freshly-fetched data is overlaid.
            setComments((prev) => {
              const byId = new Map(prev.map((c: any) => [c.databaseId, c]));
              for (const n of nodes) {
                const existing = byId.get(n.databaseId);
                byId.set(n.databaseId, {
                  ...existing,
                  ...n,
                  content: existing ? existing.content : n.content,
                });
              }
              return [...byId.values()];
            });
          }
        })
        .catch(() => {});
    };
    window.addEventListener("maltose:comment-posted", onRefresh);
    return () => window.removeEventListener("maltose:comment-posted", onRefresh);
  }, [postUri]);

  React.useEffect(() => {
    const onTriggerClick = (e: MouseEvent) => {
      const trigger = (e.target as HTMLElement).closest(".block-comment-trigger");
      if (!trigger) return;
      e.preventDefault();
      e.stopPropagation();
      const host = trigger.closest("[data-block-id]") as HTMLElement | null;
      const blockId = host?.dataset.blockId;
      if (!blockId) return;
      setActiveBlockId((prev) => (prev === blockId ? null : blockId));
    };
    document.addEventListener("click", onTriggerClick);
    return () => document.removeEventListener("click", onTriggerClick);
  }, [postUri]);

  // ADR-0036 P3: enter "pick a paragraph" mode — every commentable block gets
  // a temporary .block-rebind-target highlight; clicking one re-anchors the
  // orphan comment and clears the mode.
  const startRebind = React.useCallback((comment: FlatComment) => {
    setRebinding(comment);
    document.querySelectorAll("[data-block-id]").forEach((el) => {
      el.classList.add("block-rebind-target");
    });
  }, []);

  const cancelRebind = React.useCallback(() => {
    setRebinding(null);
    document.querySelectorAll(".block-rebind-target").forEach((el) => {
      el.classList.remove("block-rebind-target");
    });
  }, []);

  React.useEffect(() => {
    if (!rebinding) return;
    const onClick = (e: MouseEvent) => {
      const host = (e.target as HTMLElement).closest("[data-block-id]");
      if (!host) return;
      const clientId = (host as HTMLElement).dataset.blockId;
      if (!clientId) return;
      const snippet = (host.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
      e.preventDefault();
      fetch("/api/comments/rebind", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          commentDatabaseId: rebinding.databaseId,
          clientId,
          snippet,
        }),
      })
        .then((r) => r.json())
        .then((d) => {
          if (d.success) {
            setRebinding(null);
            document.querySelectorAll(".block-rebind-target").forEach((el) => {
              el.classList.remove("block-rebind-target");
            });
            window.dispatchEvent(new CustomEvent("maltose:comment-posted"));
          } else {
            console.error("Rebind failed:", d.error);
          }
        })
        .catch((err) => console.error("Rebind error:", err));
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [rebinding]);

  // Client-side markdown renderer (mirrors server-side renderCommentMd)
  const renderMd = React.useCallback((md: string) => {
    const raw = md
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>\s*<p>/gi, "\n\n")
      .replace(/<\/?p>/gi, "")
      .replace(/&gt;/g, ">")
      .replace(/&lt;/g, "<")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#0?39;/g, "'")
      .replace(/&nbsp;/g, " ")
      .trim();
    return DOMPurify.sanitize(marked.parse(raw, { async: false }) as string, {
      ALLOWED_TAGS: [
        "p",
        "br",
        "b",
        "i",
        "em",
        "strong",
        "u",
        "s",
        "del",
        "ins",
        "a",
        "img",
        "code",
        "pre",
        "blockquote",
        "hr",
        "ul",
        "ol",
        "li",
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
        "table",
        "thead",
        "tbody",
        "tr",
        "th",
        "td",
        "span",
        "div",
        "figure",
        "figcaption",
      ],
      ALLOWED_ATTR: [
        "href",
        "src",
        "alt",
        "title",
        "target",
        "rel",
        "class",
        "align",
      ],
      ALLOW_DATA_ATTR: false,
      ADD_ATTR: ["target"],
    });
  }, []);

  const onMention = React.useCallback((targetId: string) => {
    const el = document.getElementById(targetId);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("chat-highlight");
    setTimeout(() => el.classList.remove("chat-highlight"), 2000);
  }, []);

  const scrollToBlock = React.useCallback((clientId: string) => {
    const el = document.querySelector<HTMLElement>(`[data-block-id="${clientId}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("block-ref-highlight");
    setTimeout(() => el.classList.remove("block-ref-highlight"), 2000);
  }, []);

  // 请求进入编辑态。若已有其他评论处于编辑态（不同 id），先弹确认
  // 丢弃草稿再切换，避免未保存的编辑被静默丢弃。
  const onEditRequest = React.useCallback(
    (id: string) => {
      if (editingId && editingId !== id) {
        setPendingEdit(id);
        return;
      }
      startEdit(id, "panel");
    },
    [editingId],
  );

  const onEditSave = React.useCallback((commentId: string, md: string) => {
    setComments((prev) =>
      prev.map((c: any) =>
        c.id === commentId ? { ...c, content: renderMd(md) } : c,
      ),
    );
    cancelEdit();
    // Keep the footer section in sync with the paragraph panel.
    window.dispatchEvent(new CustomEvent("maltose:comment-posted"));
  }, []);

  const onDelete = React.useCallback((commentId: string) => {
    setDeleteTarget(commentId);
  }, []);

  const requestClosePanel = React.useCallback(() => {
    if (scope === "panel" && editingId) {
      setConfirmClose(true);
      return;
    }
    cancelRebind();
    setActiveBlockId(null);
  }, [scope, editingId, cancelRebind]);

  return (
    <CommentTooltipProvider>
    <div data-paragraph-comments-root>
      {activeBlockId && (
        <ParagraphCommentPanel
          key={activeBlockId}
          blockId={activeBlockId}
          comments={flatBlockComments}
          canComment={canComment}
          loginUrl={loginUrl}
          onClose={requestClosePanel}
          postDatabaseId={postDatabaseId}
          currentUserId={currentUserId}
          siteOwnerUserIds={siteOwnerUserIds}
          blockClientIds={blockClientIds}
          onRebind={startRebind}
          onBlockRefClick={scrollToBlock}
          onMention={onMention}
          onEditRequest={onEditRequest}
          isEditing={isEditing}
          onEditSave={onEditSave}
          onEditCancel={cancelEdit}
          onDelete={onDelete}
        />
      )}

      {/* 编辑切换确认（丢弃未保存的草稿） */}
      <ConfirmDialog
        open={pendingEdit !== null}
        onOpenChange={(o) => {
          if (!o) setPendingEdit(null);
        }}
        title="丢弃未保存的编辑？"
        description="当前有一条评论正在编辑中。切换编辑目标将丢弃其未保存的内容。"
        confirmLabel="丢弃并切换"
        cancelLabel="取消"
        onConfirm={() => {
          if (!pendingEdit) return;
          setPendingEdit(null);
          startEdit(pendingEdit, "panel");
        }}
      />

      {/* 段落面板关闭确认（面板内有编辑态） */}
      <ConfirmDialog
        open={confirmClose}
        onOpenChange={(o) => {
          if (!o) setConfirmClose(false);
        }}
        title="关闭段落评论？"
        description="当前有正在编辑的评论，关闭将丢弃未保存的内容。"
        confirmLabel="关闭并丢弃"
        cancelLabel="取消"
        onConfirm={() => {
          setConfirmClose(false);
          cancelEdit();
          cancelRebind();
          setActiveBlockId(null);
        }}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => {
          if (!o) setDeleteTarget(null);
        }}
        title="删除评论"
        description="确定要删除此评论吗？删除后不可恢复。"
        confirmLabel="删除"
        cancelLabel="取消"
        onConfirm={async () => {
          if (!deleteTarget) return;
          const res = await fetch("/api/comments/delete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ commentId: deleteTarget }),
          });
          if (res.ok) {
            setComments((prev) =>
              prev.filter((c: any) => c.id !== deleteTarget),
            );
          }
          setDeleteTarget(null);
        }}
      />
    </div>
    </CommentTooltipProvider>
  );
}

function ParagraphCommentPanel({
  blockId,
  comments,
  canComment,
  loginUrl,
  onClose,
  postDatabaseId,
  currentUserId,
  siteOwnerUserIds,
  blockClientIds,
  onRebind,
  onBlockRefClick,
  onMention,
  onEditRequest,
  isEditing,
  onEditSave,
  onEditCancel,
  onDelete,
}: {
  blockId: string;
  comments: FlatComment[];
  canComment: boolean;
  loginUrl: string;
  onClose: () => void;
  postDatabaseId: number;
  currentUserId?: number | null;
  siteOwnerUserIds?: number[];
  blockClientIds?: string[];
  onRebind?: (comment: FlatComment) => void;
  onBlockRefClick?: (clientId: string) => void;
  onMention: (targetId: string) => void;
  onEditRequest: (id: string) => void;
  isEditing: (id: string, scope: EditScope) => boolean;
  onEditSave: (commentId: string, md: string) => void;
  onEditCancel: () => void;
  onDelete: (commentId: string) => void;
}) {
  const [pos, setPos] = React.useState<{ top: number } | null>(null);
  const [replyTarget, setReplyTarget] = React.useState<{ id: number; name: string } | null>(null);
  const [blockRef, setBlockRef] = React.useState<{
    clientId: string;
    snippet: string;
  } | null>(null);

  React.useLayoutEffect(() => {
    const host = document.querySelector<HTMLElement>(`[data-block-id="${blockId}"]`);
    if (host) {
      const rect = host.getBoundingClientRect();
      setPos({ top: rect.bottom + window.scrollY + 8 });
    }
  }, [blockId]);

  React.useEffect(() => {
    const host = document.querySelector<HTMLElement>(`[data-block-id="${blockId}"]`);
    // Exclude the affordance button (trigger/count) from the snippet text.
    const clone = host?.cloneNode(true) as HTMLElement | null;
    clone?.querySelectorAll(".block-comment-trigger").forEach((el) => el.remove());
    const raw = clone?.textContent?.replace(/\s+/g, " ").trim() ?? "";
    setBlockRef({ clientId: blockId, snippet: raw.slice(0, 80) });
  }, [blockId]);

  const startReply = React.useCallback((id: number, name: string) => {
    setReplyTarget({ id, name });
  }, []);

  if (!pos) return null;

  // Portal to body + absolute positioning keeps the panel visually anchored
  // under the clicked block without moving React-rendered DOM (insertAdjacent
  // on a React node desyncs the virtual DOM on re-render).
  return createPortal(
    <div className="paragraph-comment-panel paragraph-comment-panel--floating" style={{ top: pos.top }} data-block-comment-panel>
      <div className="paragraph-comment-panel__head">
        <span className="paragraph-comment-panel__title">这段的评论</span>
        <span className="paragraph-comment-panel__count">{comments.length}</span>
        <button
          type="button"
          className="paragraph-comment-panel__close"
          onClick={onClose}
          aria-label="关闭"
        >
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
      {comments.length === 0 ? (
        <p className="paragraph-comment-panel__empty">还没有评论，来说两句？</p>
      ) : (
        <ul className="paragraph-comment-panel__list">
          {groupByAuthor(comments).map((group, gi) => (
            <li key={`panel-group-${gi}`} className="paragraph-comment-item">
              <MessageGroup>
                {group.map((c, ci) => (
                  <ChatBubble
                    key={c.id}
                    comment={c}
                    onReply={(id, name) => startReply(id, name)}
                    onStartReply={(id, name) => startReply(id, name)}
                    onMention={onMention}
                    showAvatar={ci === 0}
                    isOwn={
                      currentUserId != null &&
                      c.author?.node?.databaseId === currentUserId
                    }
                    isOwner={
                      siteOwnerUserIds?.includes(c.author?.node?.databaseId) ??
                      false
                    }
                    isOrphan={
                      !!c.blockReference?.clientId &&
                      !(blockClientIds ?? []).includes(c.blockReference.clientId)
                    }
                    canRebind={
                      currentUserId != null &&
                      c.author?.node?.databaseId === currentUserId
                    }
                    currentUserIsOwner={
                      currentUserId != null &&
                      (siteOwnerUserIds ?? []).includes(currentUserId)
                    }
                    onRebind={onRebind}
                    onBlockRefClick={onBlockRefClick}
                    editing={isEditing(c.id, "panel")}
                    onEdit={(id) => onEditRequest(id)}
                    onEditSave={onEditSave}
                    onEditCancel={onEditCancel}
                    onDelete={onDelete}
                  />
                ))}
              </MessageGroup>
            </li>
          ))}
        </ul>
      )}
      <div className="paragraph-comment-panel__compose">
        {canComment ? (
          <CommentComposer
            postDatabaseId={postDatabaseId}
            blockReference={blockRef}
            parent={replyTarget?.id}
            replyTargetName={replyTarget?.name}
            onCancelReply={() => setReplyTarget(null)}
            onPosted={() => onClose()}
            variant="panel"
            minHeight={120}
          />
        ) : (
          <a className="paragraph-comment-panel__cta" href={loginUrl}>
             登录后评论
          </a>
        )}
      </div>
    </div>,
    document.body,
  );
}

