import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import type { FriendStatus, FriendWithStatus } from "@lib/friends";

type FriendSource = "legacy" | "astrahub";

const ASTRAHUB_SOURCE: FriendSource = "astrahub";

function hasAstraHubSource(friend: FriendWithStatus): boolean {
  const sources = "sources" in friend ? friend.sources : undefined;
  return Array.isArray(sources) && sources.includes(ASTRAHUB_SOURCE);
}

export default function FriendCard({
  friend,
  status,
}: {
  friend: FriendWithStatus;
  status: FriendStatus;
}) {
  const initial = friend.title.slice(0, 2).toUpperCase();
  const isDead = status === "dead";
  const showAstraHubBadge = hasAstraHubSource(friend);

  return (
    <div
      className="friend-card"
      style={{
        background: "var(--card)",
        borderRadius: "var(--radius)",
        boxShadow: "0 1px 2px var(--base-color-black-4)",
        border: "1px solid var(--border)",
        overflow: "hidden",
        transition: "all 0.3s",
        opacity: isDead ? 0.55 : 1,
      }}
    >
      <div className="friend-card-bar" />
      <div
        style={{ display: "flex", alignItems: "center", padding: "1.25rem" }}
      >
        <div style={{ flexShrink: 0 }}>
          <Avatar
            style={{
              width: 64,
              height: 64,
              borderRadius: "50%",
              border: "2px solid var(--border)",
            }}
          >
            <AvatarImage src={friend.cover} alt={friend.title} />
            <AvatarFallback
              style={{
                width: 64,
                height: 64,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "1rem",
                fontWeight: 700,
                color: "var(--muted-foreground)",
                background: "var(--muted)",
                borderRadius: "50%",
              }}
            >
              {initial}
            </AvatarFallback>
          </Avatar>
        </div>
        <div style={{ marginLeft: "1.25rem", flex: 1, minWidth: 0 }}>
          <h3
            style={{
              fontSize: "1.1rem",
              fontWeight: 700,
              color: "var(--foreground)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {friend.title}
          </h3>
          {showAstraHubBadge && (
            <Badge
              variant="outline"
              className="friend-card-source-badge"
              aria-label="Imported from AstraHub"
            >
              AstraHub
            </Badge>
          )}
          <p
            style={{
              fontSize: "0.88rem",
              color: "var(--muted-foreground)",
              marginTop: showAstraHubBadge ? "0.35rem" : "0.25rem",
              lineHeight: 1.65,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {isDead ? "暂时无法访问" : friend.info}
          </p>
        </div>
        <div style={{ marginLeft: "1rem", flexShrink: 0 }}>
          <a
            href={friend.link}
            target="_blank"
            rel="noopener noreferrer"
            className="friend-card-link"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 40,
              height: 40,
              borderRadius: "50%",
              background: "var(--muted)",
              color: "var(--muted-foreground)",
              transition: "all 0.2s",
            }}
            aria-label="Visit website"
            title={isDead ? "站点可能已失效，仍可尝试访问" : "访问站点"}
          >
            <svg
              width={20}
              height={20}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M15 3h6v6" />
              <path d="M10 14 21 3" />
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            </svg>
          </a>
        </div>
      </div>
      <style>{`
        .friend-card {
          position: relative;
        }
        .friend-card-bar {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 4px;
          background: linear-gradient(90deg, var(--primary), var(--accent));
          transform: scaleX(0);
          transform-origin: left;
          transition: transform 0.3s;
          z-index: 1;
        }
        .friend-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 20px 25px -5px color-mix(in oklch, var(--foreground) 10%, transparent), 0 10px 10px -5px color-mix(in oklch, var(--foreground) 4%, transparent);
          border-color: transparent;
        }
        .friend-card:hover .friend-card-bar {
          transform: scaleX(1) !important;
        }
        .friend-card:hover .friend-card-link {
          background: color-mix(in oklch, var(--primary) 12%, var(--muted)) !important;
          color: var(--primary-color) !important;
        }
        .friend-card-source-badge {
          margin-top: 0.45rem;
          border-color: color-mix(in oklch, var(--primary) 45%, var(--border)) !important;
          background: color-mix(in oklch, var(--primary) 12%, var(--card)) !important;
          color: var(--mint-700) !important;
          font-family: "JetBrains Mono", monospace;
          font-size: 0.66rem;
          font-weight: 700;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }
        .dark .friend-card-source-badge {
          color: var(--mint-300) !important;
        }
      `}</style>
    </div>
  );
}
