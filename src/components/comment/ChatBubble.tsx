"use client";

import * as React from "react";
import { formatCommentTime } from "@lib/time";
import IconChrome from "virtual:icons/tabler/brand-chrome";
import IconFirefox from "virtual:icons/tabler/brand-firefox";
import IconSafari from "virtual:icons/tabler/brand-safari";
import IconEdge from "virtual:icons/tabler/brand-edge";
import IconOpera from "virtual:icons/tabler/brand-opera";
import IconWindows from "virtual:icons/tabler/brand-windows";
import IconApple from "virtual:icons/tabler/brand-apple";
import IconAndroid from "virtual:icons/tabler/brand-android";
import IconLinux from "virtual:icons/tabler/brand-ubuntu";
import { Edit2, Trash2, MessageSquare, Crown } from "lucide-react";
import {
  Message,
  MessageAvatar,
  MessageContent,
  MessageHeader,
  MessageFooter,
} from "@/components/ui/message";
import { Bubble, BubbleContent, BubbleReactions } from "@/components/ui/bubble";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import type { FlatComment } from "./types";
import { InlineEditBox } from "./InlineEditBox";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@components/animate-ui/components/tooltip";

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

/* ─── Chat Bubble ─── */
export function ChatBubble({
  comment,
  onReply,
  onStartReply,
  onMention,
  isOwn = false,
  isOwner = false,
  onEdit,
  onDelete,
  showAvatar = true,
  editing = false,
  onEditSave,
  onEditCancel,
  isOrphan = false,
  onRebind,
  canRebind = false,
  currentUserIsOwner = false,
  onBlockRefClick,
}: {
  comment: FlatComment;
  onReply: (id: number, name: string, ids: number[]) => void;
  onStartReply?: (id: number, name: string) => void;
  onMention: (targetId: string) => void;
  isOwn?: boolean;
  isOwner?: boolean;
  onEdit?: (commentId: string) => void;
  onDelete?: (commentId: string) => void;
  showAvatar?: boolean;
  editing?: boolean;
  onEditSave?: (commentId: string, md: string) => void;
  onEditCancel?: () => void;
  /** ADR-0036 P3: this comment's anchor block no longer exists. */
  isOrphan?: boolean;
  onRebind?: (comment: FlatComment) => void;
  /** Strict author check (databaseId only) — gates the rebind button. */
  canRebind?: boolean;
  /** Current logged-in user is a blog owner — also gates the rebind button. */
  currentUserIsOwner?: boolean;
  /** Click the paragraph-quote chip → scroll & flash the anchor block. */
  onBlockRefClick?: (clientId: string) => void;
}) {
  const timeInfo = formatCommentTime(comment.date || "");
  return (
    <Message
      align={isOwn ? "end" : "start"}
      className="chat-bubble"
      id={`chat-comment-${comment.databaseId}`}
    >
      <MessageAvatar>
        {showAvatar ? (
          <Avatar
            className="chat-avatar"
            style={{
              width: "var(--chat-avatar-size, 36px)",
              height: "var(--chat-avatar-size, 36px)",
            }}
          >
            {comment.author.node.avatar?.url && (
              <AvatarImage
                src={comment.author.node.avatar.url}
                alt={comment.author.node.name}
              />
            )}
            <AvatarFallback>
              {comment.author.node.name.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        ) : null}
      </MessageAvatar>
      <MessageContent>
        <MessageHeader>
          {comment.author.node.url ? (
            <a
              href={comment.author.node.url}
              target="_blank"
              rel="nofollow ugc noopener"
              data-author={comment.author.node.name}
              className="chat-author-name font-bold hover:underline"
            >
              {comment.author.node.name}
            </a>
          ) : (
            <span
              data-author={comment.author.node.name}
              className="chat-author-name font-bold"
            >
              {comment.author.node.name}
            </span>
          )}
          {isOwner && (
            <span className="chat-badge chat-badge--owner">
              <Crown className="chat-badge-icon" />
              博主
            </span>
          )}
          {isOwn && <span className="chat-badge chat-badge--self">我</span>}
          <Tooltip>
            <TooltipTrigger>
              <span className="chat-time-trigger">
                <time dateTime={comment.date} className="chat-time chat-time--full">
                  {timeInfo.display}
                </time>
                <time dateTime={comment.date} className="chat-time chat-time--short">
                  {timeInfo.display}
                </time>
              </span>
            </TooltipTrigger>
            <TooltipContent>
              <div className="flex flex-col items-center leading-tight">
                <span className="text-[0.8rem] font-semibold">{timeInfo.title}</span>
                <span className="text-[0.68rem] opacity-70">{timeInfo.relative}</span>
              </div>
            </TooltipContent>
          </Tooltip>
          {(comment.ua || comment.commentGeo) && (
            <span
              className="chat-meta-line inline-flex items-center gap-1 opacity-60"
              title={
                comment.ua
                  ? comment.ua.browser +
                    " / " +
                    comment.ua.os +
                    " / " +
                    comment.ua.device
                  : undefined
              }
            >
              {comment.ua && (
                <>
                  <UaBrowser name={comment.ua.browser} />
                  {comment.ua.browser} · <UaOs name={comment.ua.os} />{" "}
                  {comment.ua.os}
                  {comment.commentGeo && <span aria-hidden="true">·</span>}
                </>
              )}
              {comment.commentGeo && (
                <span className="chat-geo">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                    className="chat-geo-icon"
                  >
                    <path d="M12 21s-7-5.1-7-11a7 7 0 0 1 14 0c0 5.9-7 11-7 11Z" />
                    <circle cx="12" cy="10" r="2.5" />
                  </svg>
                  {comment.commentGeo.province || comment.commentGeo.country}
                </span>
              )}
            </span>
          )}
        </MessageHeader>

        {isOrphan && !editing && (
          <div className="chat-orphan-bar">
            <span>原段落已删除</span>
            {onRebind && (canRebind || currentUserIsOwner) && (
              <button
                type="button"
                className="chat-orphan-rebind"
                onClick={() => onRebind(comment)}
              >
                重新绑定段落
              </button>
            )}
          </div>
        )}

        {!editing && comment.blockReference?.snippet && (
          <div
            className={[
              "chat-block-ref",
              isOwn ? "chat-block-ref--end" : "",
              isOrphan ? "chat-block-ref--orphan" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            title={comment.blockReference.snippet}
            role={onBlockRefClick && !isOrphan ? "button" : undefined}
            tabIndex={onBlockRefClick && !isOrphan ? 0 : undefined}
            onClick={
              onBlockRefClick && !isOrphan && comment.blockReference?.clientId
                ? () => onBlockRefClick(comment.blockReference!.clientId!)
                : undefined
            }
            onKeyDown={
              onBlockRefClick && !isOrphan && comment.blockReference?.clientId
                ? (e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onBlockRefClick(comment.blockReference!.clientId!);
                    }
                  }
                : undefined
            }
          >
            <svg
              className="chat-block-ref__icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M13 4v16" />
              <path d="M17 4v16" />
              <path d="M19 4H9.5a4.5 4.5 0 0 0 0 9H13" />
            </svg>
            <span className="chat-block-ref__text">{comment.blockReference.snippet}</span>
          </div>
        )}

        {!editing && (
          <Bubble
            variant={isOwn ? "default" : "secondary"}
            className={comment.children.length > 0 ? "mb-4" : ""}
          >
            <BubbleContent
              className="chat-content cherry-markdown"
              style={{
                fontSize: "0.9rem",
                lineHeight: 1.55,
                wordBreak: "break-word",
              }}
            >
              <span className="chat-body-inline">
                {comment.parentRenderedHtml &&
                  comment.parentAuthorName &&
                  comment.parentDatabaseId && (
                    <span
                      className="chat-parent-quote cursor-pointer"
                      title={comment.parentContent}
                      onClick={() =>
                        onMention(`chat-comment-${comment.parentDatabaseId}`)
                      }
                      onMouseEnter={() =>
                        document
                          .getElementById(
                            `chat-comment-${comment.parentDatabaseId}`,
                          )
                          ?.classList.add("chat-highlight-hover")
                      }
                      onMouseLeave={() =>
                        document
                          .getElementById(
                            `chat-comment-${comment.parentDatabaseId}`,
                          )
                          ?.classList.remove("chat-highlight-hover")
                      }
                    >
                      {/* Full markdown render (already sanitized) clipped by
                          CSS line-clamp; avoids mid-tag truncation. */}
                      <span
                        className="chat-parent-quote-content"
                        dangerouslySetInnerHTML={{
                          __html: comment.parentRenderedHtml,
                        }}
                      />
                    </span>
                  )}
                {comment.parentAuthorName && comment.parentDatabaseId && (
                  <span
                    className={
                      isOwn
                        ? "chat-parent-mention font-semibold cursor-pointer"
                        : "chat-parent-mention font-semibold cursor-pointer text-primary"
                    }
                    onClick={() =>
                      onMention(`chat-comment-${comment.parentDatabaseId}`)
                    }
                    onMouseEnter={() =>
                      document
                        .getElementById(
                          `chat-comment-${comment.parentDatabaseId}`,
                        )
                        ?.classList.add("chat-highlight-hover")
                    }
                    onMouseLeave={() =>
                      document
                        .getElementById(
                          `chat-comment-${comment.parentDatabaseId}`,
                        )
                        ?.classList.remove("chat-highlight-hover")
                    }
                  >
                    @{comment.parentAuthorName}
                  </span>
                )}
                <span
                  dangerouslySetInnerHTML={{ __html: comment.content }}
                />
              </span>
            </BubbleContent>
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
                <span>{comment.children.length}</span>
              </BubbleReactions>
            )}
          </Bubble>
        )}
        {!editing && (
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
        )}
        {editing && (
          <InlineEditBox
            comment={comment}
            onSave={(md) => onEditSave?.(comment.id, md)}
            onCancel={() => onEditCancel?.()}
          />
        )}
      </MessageContent>
    </Message>
  );
}
