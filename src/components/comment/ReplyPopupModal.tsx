"use client";

import * as React from "react";
import type { EditScope } from "@/stores/edit-store";
import { MessageGroup } from "@/components/ui/message";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { ChatBubble } from "./ChatBubble";
import { groupByAuthor, type FlatComment } from "./types";

/* ─── Reply Popup Modal ─── */
export function ReplyPopupModal({
  parentDbId,
  children,
  commentMap,
  onClose,
  onReplyToComment,
  onMentionClick,
  onDeleteComment,
  onEditSave,
  onEditCancel,
  isEditing,
  onEditRequest,
  currentUserId,
  siteOwnerUserIds,
  blockClientIds,
  onRebind,
  onBlockRefClick,
}: {
  parentDbId: number;
  children: FlatComment[];
  commentMap: Map<number, FlatComment>;
  onClose: () => void;
  onReplyToComment: (id: number, name: string) => void;
  onMentionClick: (targetId: string) => void;
  onDeleteComment: (dbId: string) => void;
  onEditSave: (commentId: string, md: string) => void;
  onEditCancel: () => void;
  isEditing: (id: string, scope: EditScope) => boolean;
  onEditRequest: (id: string, scope: EditScope) => void;
  currentUserId?: number | null;
  siteOwnerUserIds?: number[];
  blockClientIds?: string[];
  onRebind?: (comment: FlatComment) => void;
  onBlockRefClick?: (clientId: string) => void;
}) {
  // Navigation stack: each entry is a focused comment plus its direct replies.
  // The bottom entry is the original parent from the main list; clicking a
  // reply's reaction pushes that reply and its children onto the stack.
  const [stack, setStack] = React.useState<{ parent: FlatComment; children: FlatComment[] }[]>([
    {
      parent: commentMap.get(parentDbId) ?? ({ databaseId: parentDbId } as FlatComment),
      children,
    },
  ]);

  const current = stack[stack.length - 1];
  const canGoBack = stack.length > 1;

  const pushLevel = (comment: FlatComment) => {
    const grandChildren = commentMap.get(comment.databaseId)?.children ?? [];
    if (grandChildren.length > 0) {
      setStack((prev) => [...prev, { parent: comment, children: grandChildren }]);
    }
  };

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
          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap" }}>
            <span style={{ fontSize: "0.95rem", fontWeight: 700 }}>回复</span>
            {stack.map((lvl, i) => (
              <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
                <span style={{ color: "var(--muted-foreground)" }}>/</span>
                {i < stack.length - 1 ? (
                  <button
                    type="button"
                    onClick={() => setStack((prev) => prev.slice(0, i + 1))}
                    style={{
                      border: "none",
                      background: "transparent",
                      cursor: "pointer",
                      fontSize: "0.8rem",
                      fontWeight: 600,
                      color: "var(--primary)",
                      padding: 0,
                    }}
                  >
                    {lvl.parent?.author?.node?.name || "回复"}
                  </button>
                ) : (
                  <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--muted-foreground)" }}>
                    {lvl.parent?.author?.node?.name || "回复"}
                  </span>
                )}
              </span>
            ))}
          </div>
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
          {current.parent?.databaseId && (
            <div
              className="reply-popup-context"
              style={{
                display: "flex",
                gap: "0.6rem",
                padding: "0.6rem 0.75rem",
                marginBottom: "0.75rem",
                background: "var(--muted)",
                borderLeft: "3px solid var(--primary)",
                borderRadius: "calc(var(--radius) - 2px)",
              }}
            >
              <Avatar style={{ width: 24, height: 24, flexShrink: 0 }}>
                {current.parent.author?.node?.avatar?.url && (
                  <AvatarImage
                    src={current.parent.author.node.avatar.url}
                    alt={current.parent.author.node.name}
                  />
                )}
                <AvatarFallback>
                  {current.parent.author?.node?.name?.charAt(0)?.toUpperCase() || "?"}
                </AvatarFallback>
              </Avatar>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    color: "var(--muted-foreground)",
                    marginBottom: "0.2rem",
                  }}
                >
                  回复 {current.parent.author?.node?.name || "匿名"}
                </div>
                <div
                  className="chat-content cherry-markdown"
                  style={{
                    fontSize: "0.82rem",
                    lineHeight: 1.5,
                    color: "var(--muted-foreground)",
                    wordBreak: "break-word",
                    display: "-webkit-box",
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                >
                  {current.parent.parentAuthorName &&
                    current.parent.parentDatabaseId && (
                      <span className="chat-parent-mention">
                        @{current.parent.parentAuthorName}
                      </span>
                    )}
                  <span
                    dangerouslySetInnerHTML={{
                      __html: current.parent.content,
                    }}
                  />
                </div>
              </div>
            </div>
          )}
          {current.children.length === 0 ? (
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
              {groupByAuthor(current.children).map((group, gi) => (
                <MessageGroup key={`popup-group-${gi}`}>
                  {group.map((c, ci) => (
                    <ChatBubble
                      key={c.id}
                      comment={c}
                      onReply={(id) => pushLevel(c)}
                      onStartReply={(id, name) => {
                        onClose();
                        onReplyToComment(id, name);
                      }}
                      onMention={onMentionClick}
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
                      editing={isEditing(c.id, "popup")}
                      onEdit={(id) => onEditRequest(id, "popup")}
                      onEditSave={onEditSave}
                      onEditCancel={onEditCancel}
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
