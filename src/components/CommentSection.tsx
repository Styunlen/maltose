"use client";

import * as React from "react";
import { commentDateValue } from "@lib/time";
import { CommentComposer } from "@/components/comment/Composer";
import ConfirmDialog from "@/components/ConfirmDialog";
import ErrorBoundary from "@/components/ErrorBoundary";
import { CommentTooltipProvider } from "@/components/comment/CommentTooltipProvider";
import { MessageGroup } from "@/components/ui/message";
import {
  useEditStore,
  startEdit,
  cancelEdit,
  type EditScope,
} from "@/stores/edit-store";
import {
  buildCommentMap,
  groupByAuthor,
  type FlatComment,
} from "@/components/comment/types";
import { ChatBubble } from "@/components/comment/ChatBubble";
import { ReplyPopupModal } from "@/components/comment/ReplyPopupModal";
// Client-side markdown rendering for dynamic comment refresh
import { marked } from "marked";
import DOMPurify from "dompurify";

interface Props {
  comments: any[];
  commentCount: number;
  commentStatus: string;
  postUri?: string;
  postDatabaseId?: number;
  user?: {
    sub: string;
    email?: string;
    name?: string;
    preferred_username?: string;
  } | null;
  currentUserId?: number | null;
  /** Blogger WP user ids (comma-separated env); any match gets the 博主 badge. */
  siteOwnerUserIds?: number[];
  /** All block clientIds in the article (ADR-0036 P3 orphan detection). */
  blockClientIds?: string[];
}

/* ─── Main Component ─── */
export default function CommentSection({
  comments: rawComments,
  commentCount,
  commentStatus,
  postUri,
  postDatabaseId,
  user,
  currentUserId,
  siteOwnerUserIds,
  blockClientIds,
}: Props) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [popup, setPopup] = React.useState<{
    commentDbId: number;
    parentDbId: number;
    parentName: string;
    childrenIds: number[];
  } | null>(null);
  const [parentId, setParentId] = React.useState<number | null>(null);
  const [replyingTo, setReplyingTo] = React.useState<string | null>(null);
  // 待确认的编辑切换目标（当前有编辑态时点其他评论的编辑按钮 → 弹确认）
  const [pendingEdit, setPendingEdit] = React.useState<{
    id: string;
    scope: EditScope;
  } | null>(null);
  // 待确认的弹窗关闭（弹窗内有编辑态时点关闭 → 弹确认）
  const [pendingPopupClose, setPendingPopupClose] = React.useState(false);
  const { editingId, scope, isEditing } = useEditStore();
  const [localComments, setLocalComments] = React.useState(rawComments);
  // Live comment count, adjusted on add/delete so the badge matches the list.
  const [liveCount, setLiveCount] = React.useState(commentCount);
  const [deleteTarget, setDeleteTarget] = React.useState<string | null>(null);
  // ADR-0036 P3: comment currently being re-bound to a new paragraph.
  const [rebinding, setRebinding] = React.useState<FlatComment | null>(null);

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

  const wpUrl =
    (typeof import.meta !== "undefined" &&
      (import.meta as any).env?.WORDPRESS_API_URL?.replace("/graphql", "")) ||
    "https://styunlen.cn";
  const isOpen = commentStatus === "open";
  const commentMap = React.useMemo(
    () => buildCommentMap(localComments),
    [localComments],
  );
  const sorted = React.useMemo(
    () =>
      [...localComments]
        .sort((a, b) => commentDateValue(a.date) - commentDateValue(b.date))
        .map((c) => commentMap.get(c.databaseId))
        .filter(Boolean) as FlatComment[],
    [localComments, commentMap],
  );

  React.useEffect(() => {
    if (scrollRef.current)
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [sorted.length]);

  // Reset the global edit store on unmount so an in-progress edit never
  // leaks into the next page's comment section (see review #9).
  React.useEffect(() => {
    return () => cancelEdit();
  }, []);

  // Paragraph-comment sync (ADR-0036 P3): a comment posted from the inline
  // paragraph panel dispatches `maltose:comment-posted`. Reload the comment
  // list so the footer section reflects it (the LruLink GetNodeByURI cache was
  // already invalidated by the create route).
  React.useEffect(() => {
    if (!postUri) return;
    const onPosted = () => {
      fetch(`/api/graphql-proxy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: `query RefreshComments($uri: String!) {
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
            // comments posted from the paragraph popup render correctly.
            // Existing entries are overwritten wholesale; nothing is stripped.
            setLocalComments((prev) => {
              const byId = new Map(prev.map((c: any) => [c.databaseId, c]));
              for (const n of nodes) {
                const existing = byId.get(n.databaseId);
                byId.set(n.databaseId, {
                  ...existing,
                  ...n,
                  content: renderMd(n.content || ""),
                });
              }
              return [...byId.values()];
            });
          }
        })
        .catch(() => {});
    };
    window.addEventListener("maltose:comment-posted", onPosted);
    return () => window.removeEventListener("maltose:comment-posted", onPosted);
  }, [postUri]);

  const openPopup = React.useCallback((id, n, ids) => {
    const t = document.getElementById(`chat-comment-${id}`);
    if (!t) return;
    setPopup({
      commentDbId: id,
      parentDbId: id,
      parentName: n,
      childrenIds: ids,
    });
    t.classList.add("chat-highlight");
    setTimeout(() => t.classList.remove("chat-highlight"), 2000);
  }, []);

  // 请求进入编辑态。若已有其他评论处于编辑态（不同 id/scope），先弹确认
  // 丢弃草稿再切换，避免未保存的编辑被静默丢弃。
  const onEditRequest = React.useCallback(
    (id: string, nextScope: EditScope) => {
      if (editingId && editingId !== id) {
        setPendingEdit({ id, scope: nextScope });
        return;
      }
      startEdit(id, nextScope);
      // 编辑框渲染在气泡下方，若不在可视区则平滑滚动到编辑框
      setTimeout(() => {
        const c = scrollRef.current;
        if (!c) return;
        const box = document.querySelector(".inline-edit-box");
        if (!box) return;
        const containerRect = c.getBoundingClientRect();
        const boxRect = box.getBoundingClientRect();
        const visible =
          boxRect.top >= containerRect.top &&
          boxRect.bottom <= containerRect.bottom;
        if (!visible) {
          box.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }, 150);
    },
    [editingId],
  );

  // 关闭弹窗。若弹窗内有编辑态，先弹确认：确认则清编辑态并关闭，取消则阻止。
  const requestClosePopup = React.useCallback(() => {
    if (scope === "popup" && editingId) {
      setPendingPopupClose(true);
      return;
    }
    setPopup(null);
  }, [scope, editingId]);

  const startReply = React.useCallback((id, n) => {
    setParentId(id);
    setReplyingTo(n);
    // Scroll to editor
    setTimeout(() => {
      const editor = document.querySelector(".markdown-editor-wrapper");
      if (editor)
        editor.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
  }, []);

  const scrollTo = React.useCallback((id: string) => {
    const c = scrollRef.current;
    if (!c) return;
    const t = document.getElementById(id);
    if (!t) return;

    const containerRect = c.getBoundingClientRect();
    const viewportHeight = window.innerHeight;

    // 判断容器是否在视口中可见
    console.log("Container rect:", containerRect);
    const isContainerInViewport =
      containerRect.bottom < viewportHeight && containerRect.top > 140; // container margin + header height

    if (!isContainerInViewport) {
      // 容器不在视口中 → 滚动整个页面让目标居中
      t.scrollIntoView({ behavior: "smooth", block: "center" });
    } else {
      // 容器已在视口中 → 只滚动容器让目标居中
      const targetRect = t.getBoundingClientRect();
      const relativeTop = targetRect.top - containerRect.top;
      const centerOffset =
        c.scrollTop +
        relativeTop -
        containerRect.height / 2 +
        targetRect.height / 2;
      c.scrollTo({ top: centerOffset, behavior: "smooth" });
    }

    t.classList.add("chat-highlight");
    setTimeout(() => t.classList.remove("chat-highlight"), 2000);
  }, []);

  const scrollToBlock = React.useCallback((clientId: string) => {
    const el = document.querySelector<HTMLElement>(`[data-block-id="${clientId}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("block-ref-highlight");
    setTimeout(() => el.classList.remove("block-ref-highlight"), 2000);
  }, []);

  return (
    <CommentTooltipProvider>
    <ErrorBoundary>
    <section
      id="comments-section"
      className="comments-section-global"
      style={{
        width: "100%",
        ...(rebinding
          ? { outline: "2px dashed var(--primary)", outlineOffset: "4px" }
          : {}),
        maxWidth: 800,
        margin: "5rem auto 0",
        padding: "1.5rem 1.25rem",
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
      }}
    >
      {rebinding && (
        <div
          className="chat-rebind-banner"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "0.75rem",
            marginBottom: "1rem",
            padding: "0.6rem 0.9rem",
            borderRadius: "calc(var(--radius) - 4px)",
            background: "color-mix(in oklch, var(--primary) 12%, transparent)",
            border: "1px solid color-mix(in oklch, var(--primary) 35%, transparent)",
          }}
        >
          <span style={{ fontSize: "0.85rem" }}>
            请点击正文中要绑定到的段落（虚线高亮处）
          </span>
          <button
            type="button"
            onClick={cancelRebind}
            style={{
              border: "none",
              background: "transparent",
              color: "var(--muted-foreground)",
              cursor: "pointer",
              fontSize: "0.8rem",
              textDecoration: "underline",
            }}
          >
            取消
          </button>
        </div>
      )}
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "1.25rem",
          paddingBottom: "0.75rem",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <span
          style={{
            fontSize: "1rem",
            fontWeight: 700,
            color: "var(--foreground)",
          }}
        >
          💬 评论 ({liveCount})
        </span>
        <span style={{ fontSize: "1rem", opacity: 0.5 }} aria-hidden>
          ✿
        </span>
      </div>

      {/* List */}
      {sorted.length > 0 ? (
        <div
          ref={scrollRef}
          id="chat-scroll"
          style={{
            maxHeight: 600,
            overflowY: "auto",
            scrollBehavior: "smooth",
          }}
        >
          <div
            style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}
          >
            {groupByAuthor(sorted).map((group, gi) => (
                <MessageGroup key={`group-${gi}`}>
                  {group.map((c, ci) => (
                    <ChatBubble
                      key={c.id}
                      comment={c}
                      onReply={openPopup}
                      onStartReply={(id, name) => {
                        cancelEdit();
                        startReply(id, name);
                      }}
                      onMention={scrollTo}
                      showAvatar={ci === 0}
                      isOwn={
                        (currentUserId != null &&
                          c.author?.node?.databaseId === currentUserId) ||
                        (!!user?.email && c.author?.node?.email === user.email)
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
                      onRebind={startRebind}
                      onBlockRefClick={scrollToBlock}
                      editing={isEditing(c.id, "main")}
                      onEdit={(commentId) => onEditRequest(commentId, "main")}
                      onEditSave={(commentId, md) => {
                        setLocalComments((prev) =>
                          prev.map((cc: any) =>
                            cc.id === commentId
                              ? { ...cc, content: renderMd(md) }
                              : cc,
                          ),
                        );
                        cancelEdit();
                      }}
                      onEditCancel={cancelEdit}
                      onDelete={(commentId) => setDeleteTarget(commentId)}
                    />
                  ))}
                </MessageGroup>
              ))}
          </div>
        </div>
      ) : (
        <div style={{ textAlign: "center", padding: "2rem 1rem" }}>
          <p
            style={{
              fontSize: "1rem",
              fontWeight: 600,
              color: "var(--muted-foreground)",
            }}
          >
            还没有评论呢 ~ 快来抢沙发吧 🛋️
          </p>
        </div>
      )}

      {/* ─── Comment Form ─── */}
      <div
        style={{
          marginTop: "1rem",
          paddingTop: "1rem",
          borderTop: "1px solid var(--border)",
        }}
      >
        {isOpen ? (
          user ? (
            postDatabaseId != null && (
              <CommentComposer
                postDatabaseId={postDatabaseId}
                parent={parentId}
                replyTargetName={replyingTo}
                onCancelReply={() => {
                  setParentId(null);
                  setReplyingTo(null);
                }}
                onPosted={() => {
                  setLiveCount((c) => c + 1);
                  setParentId(null);
                  setReplyingTo(null);
                }}
              />
            )
          ) : (
            <div style={{ textAlign: "center" }}>
              <button
                type="button"
                onClick={() => {
                  const loginHref = `/login?redirect=${encodeURIComponent(window.location.pathname)}`;
                  window.location.href = loginHref;
                }}
                style={{
                  padding: "0.45rem 1.2rem",
                  fontSize: "0.85rem",
                  fontWeight: 700,
                  color: "#000",
                  background: "var(--primary)",
                  border: "none",
                  borderRadius: 9999,
                  cursor: "pointer",
                }}
              >
                登录后评论
              </button>
            </div>
          )
        ) : (
          <p
            style={{
              textAlign: "center",
              fontSize: "0.9rem",
              fontWeight: 600,
              color: "var(--muted-foreground)",
            }}
          >
            📕 评论已关闭
          </p>
        )}
      </div>

      {/* Popup */}
      {popup && (
        <ReplyPopupModal
          parentDbId={popup.parentDbId}
          children={
            popup.childrenIds
              .map((id) => commentMap.get(id))
              .filter(Boolean) as FlatComment[]
          }
          commentMap={commentMap}
          onClose={requestClosePopup}
          onReplyToComment={(id, name) => {
            cancelEdit();
            setPopup(null);
            startReply(id, name);
          }}
          onMentionClick={scrollTo}
          isEditing={isEditing}
          onEditRequest={onEditRequest}
          onEditSave={(commentId, md) => {
            setLocalComments((prev) =>
              prev.map((cc: any) =>
                cc.id === commentId
                  ? { ...cc, content: renderMd(md) }
                  : cc,
              ),
            );
            cancelEdit();
          }}
          onEditCancel={cancelEdit}
          currentUserId={currentUserId}
          siteOwnerUserIds={siteOwnerUserIds}
          blockClientIds={blockClientIds}
          onRebind={startRebind}
          onBlockRefClick={scrollToBlock}
          onDeleteComment={(dbId) => {
            const c = localComments.find(
              (cc: any) => String(cc.databaseId) === dbId,
            );
            if (c) setDeleteTarget(c.id);
          }}
        />
      )}

      {/* 编辑切换确认（主区/弹窗跨作用域丢弃草稿） */}
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
          const { id, scope } = pendingEdit;
          setPendingEdit(null);
          startEdit(id, scope);
        }}
      />

      {/* 弹窗关闭确认（弹窗内有编辑态） */}
      <ConfirmDialog
        open={pendingPopupClose}
        onOpenChange={(o) => {
          if (!o) setPendingPopupClose(false);
        }}
        title="关闭弹窗？"
        description="当前有正在编辑的评论，关闭弹窗将丢弃未保存的内容。"
        confirmLabel="关闭并丢弃"
        cancelLabel="取消"
        onConfirm={() => {
          setPendingPopupClose(false);
          cancelEdit();
          setPopup(null);
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
            setLocalComments((prev) =>
              prev.filter((cc: any) => cc.id !== deleteTarget),
            );
            setLiveCount((c) => Math.max(0, c - 1));
          }
          setDeleteTarget(null);
        }}
      />
    </section>
    </ErrorBoundary>
    </CommentTooltipProvider>
  );
}
