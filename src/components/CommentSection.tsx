"use client";

import * as React from "react";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import "dayjs/locale/zh-cn";
import MarkdownEditor from "@/components/MarkdownEditor";
import type { MarkdownEditorHandle } from "@/components/MarkdownEditor";
import ConfirmDialog from "@/components/ConfirmDialog";
import { parseUa } from "@lib/ua";
import type { UaInfo } from "@lib/ua";
import IconChrome from "virtual:icons/tabler/brand-chrome";
import IconFirefox from "virtual:icons/tabler/brand-firefox";
import IconSafari from "virtual:icons/tabler/brand-safari";
import IconEdge from "virtual:icons/tabler/brand-edge";
import IconOpera from "virtual:icons/tabler/brand-opera";
import IconWindows from "virtual:icons/tabler/brand-windows";
import IconApple from "virtual:icons/tabler/brand-apple";
import IconAndroid from "virtual:icons/tabler/brand-android";
import IconLinux from "virtual:icons/tabler/brand-ubuntu";
import { Edit2, Trash2, MessageSquare } from "lucide-react";
import {
  Message,
  MessageGroup,
  MessageAvatar,
  MessageContent,
  MessageHeader,
  MessageFooter,
} from "@/components/ui/message";
import { Bubble, BubbleContent, BubbleReactions } from "@/components/ui/bubble";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

function UaBrowser({ name }: { name: string }) {
  if (name.startsWith("Chrome")) return <IconChrome className="size-3" />;
  if (name.startsWith("Firefox")) return <IconFirefox className="size-3" />;
  if (name.startsWith("Safari")) return <IconSafari className="size-3" />;
  if (name.startsWith("Edge")) return <IconEdge className="size-3" />;
  if (name.startsWith("Opera")) return <IconOpera className="size-3" />;
  return null;
}

function UaOs({ name }: { name: string }) {
  if (name.startsWith("Windows")) return <IconWindows className="size-3" />;
  if (name.startsWith("macOS") || name === "iOS")
    return <IconApple className="size-3" />;
  if (name.startsWith("Android")) return <IconAndroid className="size-3" />;
  if (name.startsWith("Linux")) return <IconLinux className="size-3" />;
  return null;
}
// Client-side markdown rendering for dynamic comment refresh
import { marked } from "marked";
import DOMPurify from "dompurify";

dayjs.extend(relativeTime);
dayjs.locale("zh-cn");

/* ─── Types ─── */
interface CommentAuthor {
  name: string;
  email?: string;
  avatar: { url: string; size: number };
}

interface FlatComment {
  id: string;
  databaseId: number;
  parentId: number | null;
  content: string;
  rawContent?: string;
  ua?: UaInfo | null;
  author: { node: CommentAuthor };
  date: string;
  parentAuthorName?: string;
  parentDatabaseId?: number;
  children: FlatComment[];
}

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
}

/* ─── Helpers ─── */
function buildCommentMap(flat: any[]): Map<number, FlatComment> {
  const map = new Map<number, FlatComment>();
  const nameMap = new Map<number, string>();
  for (const c of flat) {
    nameMap.set(c.databaseId, c.author?.node?.name || "Anonymous");
  }
  for (const c of flat) {
    const p = c.parentDatabaseId ?? c.parentId ?? null;
    map.set(c.databaseId, {
      id: c.id,
      databaseId: c.databaseId,
      parentId: p,
      content: c.content,
      rawContent: c.rawContent,
      ua: parseUa(c.agentPublic || c.agent || ""),
      author: c.author,
      date: c.date,
      parentAuthorName: p ? nameMap.get(p) : undefined,
      parentDatabaseId: p,
      children: [],
    });
  }
  for (const n of map.values()) {
    if (n.parentId && map.has(n.parentId))
      map.get(n.parentId)!.children.push(n);
  }
  return map;
}

/* ─── Chat Bubble ─── */
// Group strictly consecutive comments by the same author into message groups.
function groupByAuthor(sorted: FlatComment[]): FlatComment[][] {
  const groups: FlatComment[][] = [];
  for (const c of sorted) {
    const last = groups[groups.length - 1];
    if (last && last[last.length - 1].author.node.name === c.author.node.name) {
      last.push(c);
    } else {
      groups.push([c]);
    }
  }
  return groups;
}

function ChatBubble({
  comment,
  onReply,
  onStartReply,
  onMention,
  isOwn = false,
  onEdit,
  onDelete,
  showAvatar = true,
}: {
  comment: FlatComment;
  onReply: (id: number, name: string, ids: number[]) => void;
  onStartReply?: (id: number, name: string) => void;
  onMention: (targetId: string) => void;
  isOwn?: boolean;
  onEdit?: (commentId: string) => void;
  onDelete?: (commentId: string) => void;
  showAvatar?: boolean;
}) {
  return (
    <Message
      align={isOwn ? "end" : "start"}
      className="chat-bubble"
      id={`chat-comment-${comment.databaseId}`}
    >
      <MessageAvatar>
        {showAvatar ? (
          <Avatar style={{ width: 36, height: 36 }}>
            {comment.author.node.avatar?.url ? (
              <AvatarImage
                src={comment.author.node.avatar.url}
                alt={comment.author.node.name}
              />
            ) : (
              <AvatarFallback>
                {comment.author.node.name.charAt(0).toUpperCase()}
              </AvatarFallback>
            )}
          </Avatar>
        ) : null}
      </MessageAvatar>
      <MessageContent>
        <MessageHeader>
          <span data-author={comment.author.node.name} className="font-bold">
            {comment.author.node.name}
          </span>
          {comment.parentAuthorName && (
            <span
              className="chat-parent-mention text-primary cursor-pointer font-semibold"
              data-target={`chat-comment-${comment.parentDatabaseId}`}
              role="button"
              tabIndex={0}
              onClick={() =>
                onMention(`chat-comment-${comment.parentDatabaseId}`)
              }
              onMouseEnter={() =>
                document
                  .getElementById(`chat-comment-${comment.parentDatabaseId}`)
                  ?.classList.add("chat-highlight-hover")
              }
              onMouseLeave={() =>
                document
                  .getElementById(`chat-comment-${comment.parentDatabaseId}`)
                  ?.classList.remove("chat-highlight-hover")
              }
            >
              @{comment.parentAuthorName}
            </span>
          )}
          <time dateTime={comment.date}>
            {dayjs(comment.date).format("YYYY-MM-DD HH:mm")}
          </time>
          {comment.ua && (
            <span
              title={
                comment.ua.browser +
                " / " +
                comment.ua.os +
                " / " +
                comment.ua.device
              }
              className="inline-flex items-center gap-0.5 opacity-60"
            >
              <UaBrowser name={comment.ua.browser} />
              {comment.ua.browser} · <UaOs name={comment.ua.os} />{" "}
              {comment.ua.os}
            </span>
          )}
        </MessageHeader>
        <Bubble variant={isOwn ? "default" : "secondary"}>
          <BubbleContent
            className="chat-content"
            style={{
              fontSize: "0.9rem",
              lineHeight: 1.55,
              wordBreak: "break-word",
            }}
            dangerouslySetInnerHTML={{ __html: comment.content }}
          />
          {comment.children.length > 0 && (
            <BubbleReactions
              side="bottom"
              align={isOwn ? "start" : "end"}
              className="reply-link-trigger"
              data-comment-id={comment.databaseId}
              data-parent-name={comment.author.node.name}
              data-children={comment.children
                .map((c) => c.databaseId)
                .join(",")}
              aria-label={`${comment.children.length} 条回复`}
              onClick={() =>
                onReply(
                  comment.databaseId,
                  comment.author.node.name,
                  comment.children.map((c) => c.databaseId),
                )
              }
            >
              <span>↳</span>
              <span>{comment.children.length} 条回复</span>
            </BubbleReactions>
          )}
        </Bubble>
        <MessageFooter>
          <button
            type="button"
            className="chat-reply-btn"
            title="回复"
            onClick={() =>
              onStartReply
                ? onStartReply(comment.databaseId, comment.author.node.name)
                : onReply(
                    comment.databaseId,
                    comment.author.node.name,
                    (comment.children || []).map((c: any) => c.databaseId),
                  )
            }
            aria-label="回复"
          >
            <MessageSquare className="size-3.5" />
            <span>回复</span>
          </button>
          {isOwn && (
            <>
              <button
                type="button"
                className="chat-edit-btn"
                title="编辑"
                onClick={() => onEdit?.(comment.id)}
                aria-label="编辑"
              >
                <Edit2 className="size-3.5" />
                <span>编辑</span>
              </button>
              <button
                type="button"
                className="chat-delete-btn"
                title="删除"
                onClick={() => onDelete?.(comment.id)}
                aria-label="删除"
              >
                <Trash2 className="size-3.5" />
                <span>删除</span>
              </button>
            </>
          )}
        </MessageFooter>
      </MessageContent>
    </Message>
  );
}

/* ─── Reply Popup Modal ─── */
function ReplyPopupModal({
  parentDbId,
  children,
  onClose,
  onReplyToComment,
  onMentionClick,
  onEditComment,
  onDeleteComment,
}: {
  parentDbId: number;
  children: FlatComment[];
  onClose: () => void;
  onReplyToComment: (id: number, name: string) => void;
  onMentionClick: (targetId: string) => void;
  onEditComment: (dbId: string) => void;
  onDeleteComment: (dbId: string) => void;
}) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        pointerEvents: "auto",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(0,0,0,0.4)",
          backdropFilter: "blur(4px)",
        }}
        onClick={onClose}
      />
      <div
        style={{
          position: "relative",
          width: "90%",
          maxWidth: 520,
          maxHeight: "70vh",
          background: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius)",
          boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0.75rem 1rem",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <span style={{ fontSize: "0.95rem", fontWeight: 700 }}>回复</span>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: 28,
              height: 28,
              border: "none",
              background: "var(--muted)",
              borderRadius: "50%",
              fontSize: "0.85rem",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--muted-foreground)",
            }}
          >
            ✕
          </button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "0.75rem 1rem" }}>
          {children.length === 0 ? (
            <p
              style={{
                textAlign: "center",
                color: "var(--muted-foreground)",
                padding: "1rem",
              }}
            >
              暂无回复
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {groupByAuthor(children).map((group, gi) => (
                <MessageGroup key={`popup-group-${gi}`}>
                  {group.map((c, ci) => (
                    <ChatBubble
                      key={c.id}
                      comment={c}
                      onReply={() => {}}
                      onStartReply={(id, name) => {
                        onClose();
                        onReplyToComment(id, name);
                      }}
                      onMention={onMentionClick}
                      showAvatar={ci === 0}
                      isOwn={false}
                      onEdit={(id) => {
                        onClose();
                        onEditComment(id);
                      }}
                      onDelete={(id) => {
                        onClose();
                        onDeleteComment(id);
                      }}
                    />
                  ))}
                </MessageGroup>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
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
}: Props) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [popup, setPopup] = React.useState<{
    commentDbId: number;
    parentDbId: number;
    parentName: string;
    childrenIds: number[];
  } | null>(null);
  const newCommentRef = React.useRef<MarkdownEditorHandle>(null);
  const editCommentRef = React.useRef<MarkdownEditorHandle>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [formError, setFormError] = React.useState("");
  const [parentId, setParentId] = React.useState<number | null>(null);
  const [replyingTo, setReplyingTo] = React.useState<string | null>(null);
  const [replyQuote, setReplyQuote] = React.useState("");
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [localComments, setLocalComments] = React.useState(rawComments);
  // Live comment count, adjusted on add/delete so the badge matches the list.
  const [liveCount, setLiveCount] = React.useState(commentCount);
  const [deleteTarget, setDeleteTarget] = React.useState<string | null>(null);

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
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
        .map((c) => commentMap.get(c.databaseId))
        .filter(Boolean) as FlatComment[],
    [localComments, commentMap],
  );

  React.useEffect(() => {
    if (scrollRef.current)
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [sorted.length]);

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

  const startReply = React.useCallback((id, n) => {
    setParentId(id);
    setReplyingTo(n);
    const t = document.getElementById(`chat-comment-${id}`);
    if (t) {
      const quoteEl = t.querySelector(".chat-content");
      if (quoteEl) {
        const text = (quoteEl as HTMLElement).innerText || "";
        setReplyQuote(text.slice(0, 200));
      }
    }
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

  return (
    <section
      id="comments-section"
      className="comments-section-global"
      style={{
        width: "800px",
        margin: "5rem auto 0",
        padding: "1.5rem 1.25rem",
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
      }}
    >
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
            {sorted.find((c) => editingId === c.id) &&
              (() => {
                const c = sorted.find((cc) => editingId === cc.id)!;
                return (
                  <div
                    key={c.id}
                    style={{
                      padding: "1rem",
                      background:
                        "color-mix(in oklch, var(--primary) 5%, transparent)",
                      border: "1px solid var(--primary)",
                      borderRadius: "var(--radius)",
                      marginBottom: "0.5rem",
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
                    <MarkdownEditor ref={editCommentRef} minHeight={120} />
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
                        onClick={() => setEditingId(null)}
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
                        onClick={async () => {
                          const md = editCommentRef.current
                            ?.getMarkdown()
                            ?.trim();
                          if (!md) return;
                          const res = await fetch("/api/comments/update", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              commentId: c.id,
                              content: md,
                            }),
                          });
                          if (res.ok) {
                            const data = await res.json();
                            const updatedContent = renderMd(
                              data?.comment?.content || md,
                            );
                            setLocalComments((prev) =>
                              prev.map((cc: any) =>
                                cc.id === c.id
                                  ? { ...cc, content: updatedContent }
                                  : cc,
                              ),
                            );
                            setEditingId(null);
                          } else {
                            const d = await res.json();
                            setFormError(d?.error || "保存失败");
                          }
                        }}
                        style={{
                          padding: "0.35rem 1rem",
                          fontSize: "0.8rem",
                          fontWeight: 600,
                          color: "#fff",
                          background: "var(--primary)",
                          border: "none",
                          borderRadius: 9999,
                          cursor: "pointer",
                        }}
                      >
                        保存
                      </button>
                    </div>
                  </div>
                );
              })()}
            {sorted.filter((c) => editingId !== c.id).filter(Boolean).length >
              0 &&
              groupByAuthor(
                sorted.filter((c) => editingId !== c.id).filter(Boolean),
              ).map((group, gi) => (
                <MessageGroup key={`group-${gi}`}>
                  {group.map((c, ci) => (
                    <ChatBubble
                      key={c.id}
                      comment={c}
                      onReply={openPopup}
                      onStartReply={startReply}
                      onMention={scrollTo}
                      showAvatar={ci === 0}
                      isOwn={
                        (currentUserId != null &&
                          c.author?.node?.databaseId === currentUserId) ||
                        (!!user?.email && c.author?.node?.email === user.email)
                      }
                      onEdit={(commentId) => {
                        setEditingId(commentId);
                        fetch("/api/comments/raw", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            commentDatabaseId: c.databaseId,
                          }),
                        })
                          .then((r) => r.json())
                          .then((data) => {
                            editCommentRef.current?.setMarkdown(
                              data.content || "",
                            );
                          })
                          .catch(() => {
                            editCommentRef.current?.setMarkdown(
                              c.rawContent || "",
                            );
                          });
                      }}
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
          <>
            {replyingTo && (
              <div
                style={{
                  marginBottom: "0.5rem",
                  padding: "0.4rem 0.6rem",
                  background: "var(--muted)",
                  borderRadius: "var(--radius)",
                  border: "1px solid var(--border)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.4rem",
                    fontSize: "0.8rem",
                    color: "var(--primary)",
                    fontWeight: 600,
                    marginBottom: "0.25rem",
                  }}
                >
                  <MessageSquare className="size-3.5" />
                  回复 @{replyingTo}
                  <button
                    type="button"
                    onClick={() => {
                      setParentId(null);
                      setReplyingTo(null);
                      setReplyQuote("");
                    }}
                    style={{
                      marginLeft: "auto",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      color: "var(--muted-foreground)",
                      fontSize: "0.75rem",
                    }}
                  >
                    取消回复
                  </button>
                </div>
                {replyQuote && (
                  <div
                    style={{
                      fontSize: "0.78rem",
                      color: "var(--muted-foreground)",
                      lineHeight: 1.45,
                      maxHeight: 60,
                      overflow: "hidden",
                      padding: "0.2rem 0.4rem",
                      borderLeft: "2px solid var(--primary)",
                      fontStyle: "italic",
                    }}
                  >
                    {replyQuote}
                  </div>
                )}
              </div>
            )}
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const text =
                  newCommentRef.current?.getMarkdown?.()?.trim() || "";
                if (!text || !postDatabaseId) return;
                setSubmitting(true);
                setFormError("");

                try {
                  const res = await fetch("/api/comments/create", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      postDatabaseId,
                      content: text,
                      parent: parentId || undefined,
                      userAgent: navigator.userAgent,
                    }),
                  });
                  const data = await res.json();

                  if (data?.error) {
                    setFormError(data.error);
                  } else if (data?.success !== false) {
                    const newComment = data?.comment;
                    if (newComment?.databaseId && newComment?.content) {
                      newComment.content = renderMd(newComment.content);
                      setLocalComments((prev) => [...prev, newComment]);
                      setLiveCount((c) => c + 1);
                    }
                    setParentId(null);
                    setReplyingTo(null);
                  } else {
                    setFormError("提交失败，请稍后重试");
                  }
                } catch {
                  setFormError("网络异常，请稍后重试");
                } finally {
                  setSubmitting(false);
                }
              }}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.4rem",
              }}
            >
              {user && (
                <div
                  style={{
                    fontSize: "0.8rem",
                    fontWeight: 600,
                    color: "var(--primary)",
                  }}
                >
                  评论者：{user.name || user.preferred_username || user.email}
                </div>
              )}
              <MarkdownEditor
                ref={newCommentRef}
                placeholder={user ? "支持 Markdown 语法…" : "请先登录后再评论"}
                disabled={!user || submitting}
                minHeight={160}
              />
              {formError && (
                <div
                  style={{
                    fontSize: "0.8rem",
                    color: "var(--destructive)",
                    fontWeight: 600,
                  }}
                >
                  {formError}
                </div>
              )}
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: "0.5rem",
                }}
              >
                {!user ? (
                  <button
                    type="button"
                    onClick={() => {
                      const loginHref = `/api/auth/login?redirect=${encodeURIComponent(window.location.pathname)}`;
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
                ) : (
                  <button
                    type="submit"
                    disabled={submitting}
                    style={{
                      padding: "0.45rem 1.2rem",
                      fontSize: "0.85rem",
                      fontWeight: 700,
                      color: "#000",
                      background: submitting
                        ? "var(--muted)"
                        : "var(--primary)",
                      border: "none",
                      borderRadius: 9999,
                      cursor: submitting ? "not-allowed" : "pointer",
                      opacity: submitting ? 0.6 : 1,
                    }}
                  >
                    {submitting
                      ? "提交中…"
                      : parentId
                        ? "提交回复"
                        : "发表评论"}
                  </button>
                )}
              </div>
            </form>
          </>
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
          onClose={() => setPopup(null)}
          onReplyToComment={(id, name) => {
            setPopup(null);
            startReply(id, name);
          }}
          onMentionClick={scrollTo}
          onEditComment={(dbId) => {
            const c = localComments.find(
              (cc: any) => String(cc.databaseId) === dbId,
            );
            if (c) {
              setEditingId(c.id);
              fetch("/api/comments/raw", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ commentDatabaseId: Number(dbId) }),
              })
                .then((r) => r.json())
                .then((data) => {
                  editCommentRef.current?.setMarkdown(data.content || "");
                })
                .catch(() => {
                  editCommentRef.current?.setMarkdown(c.rawContent || "");
                });
            }
          }}
          onDeleteComment={(dbId) => {
            const c = localComments.find(
              (cc: any) => String(cc.databaseId) === dbId,
            );
            if (c) setDeleteTarget(c.id);
          }}
        />
      )}

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
  );
}
