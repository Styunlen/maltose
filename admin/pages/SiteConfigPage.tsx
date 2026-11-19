import * as React from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button, Card, Field, PageHeader, Toast } from "../components";
import { useSettingsForm } from "../lib/useSettingsForm";
import type { SocialLink } from "../lib/api";

function emptyLink(): SocialLink {
  return { label: "", url: "", iconType: "iconify", icon: "" };
}

export function SiteConfigPage() {
  const { form, users, saving, toast, setToast, set, save } = useSettingsForm();
  const [manualId, setManualId] = React.useState("");

  if (!form) {
    return (
      <PageHeader title="站点配置" description="作者卡社交链接与博主账号" />
    );
  }

  const links = form.social_links;
  const ownerIds = form.owner_user_ids;
  const knownUsers = new Map(users.map((user) => [user.id, user.name]));

  const updateLink = (index: number, patch: Partial<SocialLink>) => {
    const next = links.map((link, i) =>
      i === index ? { ...link, ...patch } : link,
    );
    set("social_links", next);
  };

  const removeLink = (index: number) => {
    set(
      "social_links",
      links.filter((_, i) => i !== index),
    );
  };

  const addLink = () => set("social_links", [...links, emptyLink()]);

  const toggleOwner = (id: number, checked: boolean) => {
    const next = checked
      ? Array.from(new Set([...ownerIds, id]))
      : ownerIds.filter((x) => x !== id);
    set("owner_user_ids", next);
  };

  return (
    <>
      <PageHeader
        title="站点配置"
        description="作者卡社交链接与博主账号（前台侧栏作者卡、评论博主徽章共用）"
        actions={
          <Button
            onClick={() =>
              save({
                social_links: links,
                owner_user_ids: ownerIds,
              })
            }
            disabled={saving}
          >
            {saving ? "保存中…" : "保存"}
          </Button>
        }
      />

      <Card className="mb-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold">社交链接</div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              图标类型选「图片 URL」时填写完整图片地址（https://…，建议正方形约
              48×48）；选「iconify 代号」时填写 Iconify 图标名（如
              mdi:github、simple-icons:bilibili），前台将渲染对应矢量图标。
            </div>
          </div>
          <Button variant="secondary" onClick={addLink}>
            <Plus className="size-4" />
            添加
          </Button>
        </div>

        {links.length === 0 && (
          <p className="py-4 text-sm text-muted-foreground">
            还没有社交链接，点击「添加」创建。
          </p>
        )}

        <div className="flex flex-col gap-3">
          {links.map((link, index) => (
            <div
              key={index}
              className="grid grid-cols-[repeat(4,minmax(0,1fr))_auto] items-end gap-2 rounded-lg border border-border p-3"
            >
              <label className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">平台名</span>
                <input
                  value={link.label}
                  placeholder="GitHub"
                  onChange={(e) => updateLink(index, { label: e.target.value })}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">链接</span>
                <input
                  value={link.url}
                  placeholder="https://github.com/you"
                  onChange={(e) => updateLink(index, { url: e.target.value })}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">图标类型</span>
                <select
                  value={link.iconType}
                  onChange={(e) =>
                    updateLink(index, {
                      iconType: e.target.value as SocialLink["iconType"],
                    })
                  }
                >
                  <option value="iconify">iconify 代号</option>
                  <option value="url">图片 URL</option>
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">图标值</span>
                <input
                  value={link.icon}
                  placeholder={
                    link.iconType === "url"
                      ? "https://…/icon.png"
                      : "mdi:github"
                  }
                  onChange={(e) => updateLink(index, { icon: e.target.value })}
                />
              </label>
              <Button
                variant="ghost"
                onClick={() => removeLink(index)}
                aria-label={`删除 ${link.label || "该链接"}`}
                title="删除"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <Field
          label="博主账号"
          description="选中的用户将作为站点博主：前台侧栏作者卡展示其头像/昵称/简介，评论中显示「博主」徽章。可多选；也可手动添加 ID（即使该用户当前不存在）。"
        >
          <div className="flex flex-col gap-3">
            {ownerIds.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {ownerIds.map((id) => {
                  const name = knownUsers.get(id);
                  return (
                    <span
                      key={id}
                      className={
                        name
                          ? "inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-2.5 py-1 text-xs font-semibold text-primary"
                          : "inline-flex items-center gap-1.5 rounded-full bg-destructive/10 px-2.5 py-1 text-xs font-semibold text-destructive"
                      }
                    >
                      #{id} {name ?? "用户不存在"}
                      <button
                        type="button"
                        onClick={() => toggleOwner(id, false)}
                        aria-label={`移除 ${id}`}
                        className="cursor-pointer opacity-70 hover:opacity-100"
                      >
                        ×
                      </button>
                    </span>
                  );
                })}
              </div>
            )}

            <div className="flex items-end gap-2">
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                手动添加用户 ID
                <input
                  type="number"
                  min={1}
                  value={manualId}
                  placeholder="例如 1"
                  className="w-32"
                  onChange={(e) => setManualId(e.target.value)}
                />
              </label>
              <Button
                variant="secondary"
                onClick={() => {
                  const id = Number.parseInt(manualId, 10);
                  if (!Number.isFinite(id) || id <= 0) {
                    setToast({ kind: "error", message: "请输入有效的用户 ID" });
                    return;
                  }
                  toggleOwner(id, true);
                  setManualId("");
                }}
              >
                添加 ID
              </Button>
            </div>

            <div className="flex max-h-64 flex-col gap-1.5 overflow-y-auto pr-1">
              {users.map((user) => (
                <label
                  key={user.id}
                  className="flex cursor-pointer items-center gap-2 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={ownerIds.includes(user.id)}
                    onChange={(e) => toggleOwner(user.id, e.target.checked)}
                  />
                  <span>{user.name}</span>
                  <span className="text-xs text-muted-foreground">
                    #{user.id}
                  </span>
                </label>
              ))}
              {users.length === 0 && (
                <span className="text-sm text-muted-foreground">
                  没有可选的用户。
                </span>
              )}
            </div>
          </div>
        </Field>
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
