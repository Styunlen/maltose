"use client";

import * as React from "react";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";

interface CommentNode {
  id: string;
  databaseId: number;
  content: string;
  date: string;
  status: string;
  commentedOn?: { node?: { databaseId?: number; title?: string; uri?: string } };
}

interface PageData {
  user: { id: number; name: string; email: string };
  comments: CommentNode[];
  hasNextPage: boolean;
  endCursor: string | null;
}

export default function UserComments() {
  const [data, setData] = React.useState<PageData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [dateFrom, setDateFrom] = React.useState("");
  const [dateTo, setDateTo] = React.useState("");
  const [cursor, setCursor] = React.useState<string | null>(null);
  const [history, setHistory] = React.useState<string[]>([]);

  const fetchComments = React.useCallback(async (after = "", replace = true, recordHistory = true) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ first: "100" });
      if (after) params.set("after", after);
      if (search) params.set("search", search);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);

      const res = await fetch(`/api/user/comments?${params.toString()}`);
      const json = await res.json();
      if (json.error) {
        setError(json.error);
      } else {
        setData(json);
        if (replace) setHistory([after]);
        else if (recordHistory) setHistory((h) => [...h, after]);
        setCursor(json.endCursor);
      }
    } catch {
      setError("获取失败");
    } finally {
      setLoading(false);
    }
  }, [search, dateFrom, dateTo]);

  React.useEffect(() => {
    fetchComments("", true);
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchComments("", true);
  };

  const canGoBack = history.length > 1;
  const goBack = () => {
    const prev = history[history.length - 2];
    setHistory((h) => h.slice(0, -1));
    fetchComments(prev, false, false);
  };

  return (
    <div style={{ maxWidth: 800, margin: "1.5rem auto 0" }}>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 800, marginBottom: "1rem" }}>💬 我的评论</h1>

      {/* Search & Filter */}
      <form onSubmit={handleSearch} style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "1rem" }}>
        <div style={{ flex: 1, minWidth: 180, display: "flex", alignItems: "center", gap: "0.3rem", padding: "0.35rem 0.6rem", border: "1px solid var(--border)", borderRadius: "var(--radius)", background: "var(--background)" }}>
          <Search className="size-4" style={{ color: "var(--muted-foreground)", flexShrink: 0 }} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索评论内容…"
            style={{ border: "none", outline: "none", flex: 1, fontSize: "0.85rem", background: "transparent", color: "var(--foreground)" }}
          />
        </div>
        <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={{ padding: "0.35rem 0.5rem", fontSize: "0.8rem", borderRadius: "var(--radius)", border: "1px solid var(--border)", background: "var(--background)", color: "var(--foreground)" }} />
        <span style={{ alignSelf: "center", fontSize: "0.8rem", color: "var(--muted-foreground)" }}>至</span>
        <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={{ padding: "0.35rem 0.5rem", fontSize: "0.8rem", borderRadius: "var(--radius)", border: "1px solid var(--border)", background: "var(--background)", color: "var(--foreground)" }} />
        <button type="submit" style={{ padding: "0.35rem 1rem", fontSize: "0.8rem", fontWeight: 600, color: "#000", background: "var(--primary)", border: "none", borderRadius: 9999, cursor: "pointer" }}>
          筛选
        </button>
      </form>

      {/* Status bar */}
      {data && !loading && (
        <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--primary)", marginBottom: "0.75rem", padding: "0.3rem 0", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>{data.user.name} ({data.user.email}) — 共 {data.comments.length} 条</span>
          <div style={{ display: "flex", gap: "0.3rem" }}>
            {canGoBack && (
              <button onClick={goBack} style={{ display: "inline-flex", alignItems: "center", gap: "0.2rem", padding: "0.2rem 0.6rem", fontSize: "0.75rem", fontWeight: 600, color: "var(--foreground)", background: "var(--muted)", border: "1px solid var(--border)", borderRadius: 9999, cursor: "pointer" }}>
                <ChevronLeft className="size-3.5" /> 上一页
              </button>
            )}
            {data.hasNextPage && (
              <button onClick={() => fetchComments(cursor || "", false)} style={{ display: "inline-flex", alignItems: "center", gap: "0.2rem", padding: "0.2rem 0.6rem", fontSize: "0.75rem", fontWeight: 600, color: "var(--foreground)", background: "var(--muted)", border: "1px solid var(--border)", borderRadius: 9999, cursor: "pointer" }}>
                下一页 <ChevronRight className="size-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Error */}
      {error && <p style={{ color: "var(--destructive)", fontSize: "0.9rem", fontWeight: 600, textAlign: "center", padding: "2rem" }}>{error}</p>}

      {/* Loading */}
      {loading && <p style={{ textAlign: "center", padding: "3rem", fontSize: "0.9rem", color: "var(--muted-foreground)" }}>加载中…</p>}

      {/* Comments list */}
      {!loading && !error && data?.comments.length === 0 && (
        <p style={{ textAlign: "center", padding: "3rem", fontSize: "1rem", color: "var(--muted-foreground)" }}>暂无匹配的评论</p>
      )}

      {data?.comments.map((c: CommentNode) => (
        <div key={c.databaseId} style={{ padding: "1rem", marginBottom: "0.75rem", background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--radius)" }}>
          <div style={{ fontSize: "0.8rem", color: "var(--muted-foreground)", marginBottom: "0.4rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>
              发表在：
              <a href={c.commentedOn?.node?.uri || "#"} style={{ color: "var(--primary)", fontWeight: 600, textDecoration: "none" }}>
                {c.commentedOn?.node?.title || "(未知文章)"}
              </a>
            </span>
            <span>{c.date ? new Date(c.date).toLocaleDateString("zh-CN") : ""}</span>
          </div>
          <div style={{ fontSize: "0.85rem", lineHeight: 1.6, color: "var(--foreground)", marginBottom: "0.5rem", wordBreak: "break-word" }} dangerouslySetInnerHTML={{ __html: c.content }} />
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", fontSize: "0.75rem" }}>
            <span style={{ padding: "0.1rem 0.5rem", borderRadius: 9999, fontSize: "0.7rem", fontWeight: 600, background: c.status === "APPROVE" ? "color-mix(in oklch, var(--primary) 15%, transparent)" : "color-mix(in oklch, var(--muted-foreground) 15%, transparent)", color: c.status === "APPROVE" ? "var(--primary)" : "var(--muted-foreground)" }}>
              {c.status === "APPROVE" ? "已发布" : c.status === "HOLD" ? "待审核" : c.status}
            </span>
            <a href={`${c.commentedOn?.node?.uri || "#"}#chat-comment-${c.databaseId}`} style={{ color: "var(--primary)", fontWeight: 600, textDecoration: "none" }}>
              查看上下文
            </a>
          </div>
        </div>
      ))}
    </div>
  );
}
