import * as React from "react";
import { Pencil, Plus, Star, Trash2 } from "lucide-react";
import { Button, Card, Field, PageHeader, Switch, Toast } from "../components";
import {
  adminApi,
  type AnnouncementItem,
  type AnnouncementPayload,
} from "../lib/api";

function formatDate(value: string): string {
  const d = new Date(value.endsWith("Z") ? value : `${value}Z`);
  if (Number.isNaN(d.getTime())) return value;
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd} ${hh}:${mi}`;
}

function stripHtml(text: string): string {
  return text
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sortItems(items: AnnouncementItem[]): AnnouncementItem[] {
  return [...items].sort((a, b) => {
    if (a.sticky !== b.sticky) return a.sticky ? -1 : 1;
    return (b.date ?? "").localeCompare(a.date ?? "");
  });
}

type Draft = {
  id: number | null;
  content: string;
  sticky: boolean;
  status: "publish" | "draft";
};

const EMPTY_DRAFT: Draft = {
  id: null,
  content: "",
  sticky: false,
  status: "publish",
};

export function AnnouncementsPage() {
  const [items, setItems] = React.useState<AnnouncementItem[] | null>(null);
  const [draft, setDraft] = React.useState<Draft | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [toast, setToast] = React.useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);

  const load = React.useCallback(() => {
    adminApi
      .listAnnouncements()
      .then(({ items: list }) => setItems(sortItems(list)))
      .catch((error) =>
        setToast({
          kind: "error",
          message: error instanceof Error ? error.message : "公告加载失败",
        }),
      );
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const patch = (next: Partial<Draft>) =>
    setDraft((prev) => (prev ? { ...prev, ...next } : prev));

  const startCreate = () => setDraft({ ...EMPTY_DRAFT });
  const startEdit = (item: AnnouncementItem) =>
    setDraft({
      id: item.id,
      content: item.content,
      sticky: item.sticky,
      status: item.status,
    });

  const save = async () => {
    if (!draft) return;
    if (stripHtml(draft.content) === "") {
      setToast({ kind: "error", message: "公告内容不能为空" });
      return;
    }
    const payload: AnnouncementPayload = {
      content: draft.content,
      sticky: draft.sticky,
      status: draft.status,
    };
    setSaving(true);
    try {
      if (draft.id === null) {
        await adminApi.createAnnouncement(payload);
        setToast({ kind: "success", message: "已发布" });
      } else {
        await adminApi.updateAnnouncement(draft.id, payload);
        setToast({ kind: "success", message: "已保存" });
      }
      setDraft(null);
      load();
    } catch (error) {
      setToast({
        kind: "error",
        message: error instanceof Error ? error.message : "保存失败",
      });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (item: AnnouncementItem) => {
    const preview = stripHtml(item.content).slice(0, 40);
    if (!window.confirm(`删除这条公告？\n\n${preview}`)) return;
    try {
      await adminApi.deleteAnnouncement(item.id);
      setToast({ kind: "success", message: "已删除" });
      load();
    } catch (error) {
      setToast({
        kind: "error",
        message: error instanceof Error ? error.message : "删除失败",
      });
    }
  };

  return (
    <>
      <PageHeader
        title="公告"
        description="侧栏公告卡展示最新一条（置顶优先）；点击可查看全部公告时间轴"
        actions={
          <Button onClick={startCreate} disabled={!!draft}>
            <Plus className="size-4" />
            新建公告
          </Button>
        }
      />

      {draft && (
        <Card className="mb-4">
          <div className="mb-3 text-sm font-semibold">
            {draft.id === null ? "新建公告" : "编辑公告"}
          </div>
          <Field
            label="内容（HTML）"
            description="支持 HTML（如 <p>、<strong>、<a>）；纯文本会自动按段落渲染。"
          >
            <textarea
              className="min-h-40 w-full"
              value={draft.content}
              placeholder="<p>站点公告内容……</p>"
              onChange={(e) => patch({ content: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field
              label="置顶"
              description="置顶公告优先显示在侧栏与时间轴顶部。"
            >
              <Switch
                checked={draft.sticky}
                onChange={(v) => patch({ sticky: v })}
                label="置顶"
              />
            </Field>
            <Field label="状态" description="草稿不会在前台展示。">
              <select
                value={draft.status}
                onChange={(e) =>
                  patch({ status: e.target.value as Draft["status"] })
                }
              >
                <option value="publish">发布</option>
                <option value="draft">草稿</option>
              </select>
            </Field>
          </div>
          <div className="mt-2 flex gap-2">
            <Button onClick={save} disabled={saving}>
              {saving ? "保存中…" : "保存"}
            </Button>
            <Button variant="secondary" onClick={() => setDraft(null)}>
              取消
            </Button>
          </div>
        </Card>
      )}

      <Card>
        {items === null && (
          <p className="py-2 text-sm text-muted-foreground">加载中…</p>
        )}
        {items && items.length === 0 && (
          <p className="py-2 text-sm text-muted-foreground">
            暂无公告，点击右上角「新建公告」发布第一条。
          </p>
        )}
        {items && items.length > 0 && (
          <div className="flex flex-col">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex items-start gap-3 border-b border-border py-3 last:border-b-0"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="text-muted-foreground">
                      {formatDate(item.date)}
                    </span>
                    {item.sticky && (
                      <span className="inline-flex items-center gap-0.5 rounded bg-primary/15 px-1.5 py-0.5 font-bold text-primary">
                        <Star className="size-3" />
                        置顶
                      </span>
                    )}
                    <span
                      className={
                        item.status === "publish"
                          ? "rounded bg-mint-100 px-1.5 py-0.5 font-semibold text-mint-800"
                          : "rounded bg-muted px-1.5 py-0.5 font-semibold text-muted-foreground"
                      }
                    >
                      {item.status === "publish" ? "已发布" : "草稿"}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-foreground/85">
                    {stripHtml(item.content).slice(0, 120) || "（空内容）"}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    variant="ghost"
                    onClick={() => startEdit(item)}
                    aria-label="编辑"
                    title="编辑"
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => remove(item)}
                    aria-label="删除"
                    title="删除"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
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
