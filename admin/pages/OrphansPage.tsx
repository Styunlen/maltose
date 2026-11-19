import * as React from "react";
import { Card, PageHeader, Toast } from "../components";
import { adminApi, type OrphanCommentItem } from "../lib/api";

export function OrphansPage() {
  const [items, setItems] = React.useState<OrphanCommentItem[] | null>(null);
  const [toast, setToast] = React.useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);

  React.useEffect(() => {
    adminApi
      .orphanComments()
      .then(({ items: list }) => setItems(list))
      .catch((error) =>
        setToast({
          kind: "error",
          message: error instanceof Error ? error.message : "列表加载失败",
        }),
      );
  }, []);

  return (
    <>
      <PageHeader
        title="悬空评论"
        description="带段落锚定（maltose_block_ref）的评论总览。若锚定段落被删除/重构，评论会显示「原段落已删除」；可在文章评论区用「重新绑定段落」把它挂到新段落。"
      />
      <Card>
        {items === null && (
          <p className="text-sm text-muted-foreground">加载中…</p>
        )}
        {items && items.length === 0 && (
          <p className="text-sm text-muted-foreground">
            暂无带段落锚定的评论。
          </p>
        )}
        {items && items.length > 0 && (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="py-2 pr-3 font-medium">评论 ID</th>
                <th className="py-2 pr-3 font-medium">作者</th>
                <th className="py-2 pr-3 font-medium">锚定段落</th>
                <th className="py-2 pr-3 font-medium">评论摘要</th>
                <th className="py-2 pr-3 font-medium">时间</th>
                <th className="py-2 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.commentId} className="border-b border-border/50">
                  <td className="py-2 pr-3">{item.commentId}</td>
                  <td className="py-2 pr-3">
                    <div>{item.author}</div>
                    <div className="text-xs text-muted-foreground">
                      {item.authorEmail}
                    </div>
                  </td>
                  <td className="py-2 pr-3">
                    <code className="text-xs">{item.clientId}</code>
                    <div className="line-clamp-2 text-xs text-muted-foreground">
                      {item.snippet}
                    </div>
                  </td>
                  <td className="py-2 pr-3">
                    <div className="line-clamp-3 text-xs">
                      {item.content.replace(/<[^>]*>/g, "").slice(0, 80)}
                    </div>
                  </td>
                  <td className="py-2 pr-3 text-xs">{item.date}</td>
                  <td className="py-2">
                    {item.link && (
                      <a
                        href={item.link}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-semibold text-primary hover:underline"
                      >
                        在文章内查看/重绑
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      {toast && (
        <Toast
          kind={toast.kind}
          message={toast.message}
          onDismiss={() => setToast(null)}
        />
      )}
    </>
  );
}
