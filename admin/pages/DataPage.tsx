import * as React from "react";
import { Button, Card, PageHeader, Toast } from "../components";
import {
  adminApi,
  type DataItem,
  type ExportBundle,
  type OtpUser,
} from "../lib/api";

function downloadJson(bundle: ExportBundle) {
  const blob = new Blob([JSON.stringify(bundle.payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = bundle.filename;
  a.click();
  URL.revokeObjectURL(url);
}

const CLEANUP_LABEL: Record<string, string> = {
  clean: "可清理",
  ask: "可清理（待确认）",
  keep: "保留",
};

function summarizeReport(report: unknown): string {
  const r = report as {
    ok?: Record<string, number>;
    skipped?: Record<string, string>;
  };
  const ok = Object.entries(r.ok ?? {});
  const skipped = Object.entries(r.skipped ?? {});
  const parts: string[] = [];
  if (ok.length > 0) {
    parts.push(
      `成功：${ok.map(([key, count]) => `${key}（${count} 条）`).join("、")}`,
    );
  }
  if (skipped.length > 0) {
    parts.push(
      `跳过：${skipped.map(([key, reason]) => `${key}（${reason}）`).join("、")}`,
    );
  }
  return parts.join("；") || "无变化";
}

export function DataPage() {
  const [items, setItems] = React.useState<DataItem[] | null>(null);
  const [otpUsers, setOtpUsers] = React.useState<OtpUser[]>([]);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [busy, setBusy] = React.useState(false);
  const [report, setReport] = React.useState<string | null>(null);
  const [toast, setToast] = React.useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [importMode, setImportMode] = React.useState<"restore" | "migrate">(
    "restore",
  );

  const load = React.useCallback(() => {
    adminApi
      .dataOverview()
      .then(({ items: rows, otpUsers: users }) => {
        setItems(rows);
        setOtpUsers(users);
        // Default: nothing selected (explicit user choice for export/cleanup).
        setSelected(new Set());
      })
      .catch((error) =>
        setToast({
          kind: "error",
          message: error instanceof Error ? error.message : "数据预览加载失败",
        }),
      );
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const toggleItem = (key: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  const allSelected =
    !!items && items.length > 0 && selected.size === items.length;

  const chosen = (items ?? []).filter((item) => selected.has(item.key));
  const chosenExportable = chosen.filter((item) => item.exportable);
  const chosenCleanable = chosen.filter((item) => item.cleanup !== "keep");
  const chosenCleanTotal = chosenCleanable.reduce(
    (sum, item) => sum + item.count,
    0,
  );

  const exportSelected = async () => {
    if (chosenExportable.length === 0) {
      setToast({ kind: "error", message: "所选条目中没有可导出的数据" });
      return;
    }
    setBusy(true);
    try {
      const bundle = await adminApi.dataExport(
        chosenExportable.map((item) => item.key),
      );
      downloadJson(bundle);
      setToast({
        kind: "success",
        message: `已导出 ${chosenExportable.length} 类`,
      });
    } catch (error) {
      setToast({
        kind: "error",
        message: error instanceof Error ? error.message : "导出失败",
      });
    } finally {
      setBusy(false);
    }
  };

  const importFile = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setToast({ kind: "error", message: "请先选择 JSON 文件" });
      return;
    }
    setBusy(true);
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      const { report: result } = await adminApi.dataImport(payload, importMode);
      setReport(summarizeReport(result));
      setToast({ kind: "success", message: "导入完成" });
      load();
    } catch (error) {
      setToast({
        kind: "error",
        message: error instanceof Error ? error.message : "导入失败",
      });
    } finally {
      setBusy(false);
    }
  };

  const cleanup = async () => {
    if (chosenCleanable.length === 0) {
      setToast({ kind: "error", message: "所选条目中没有可清理的数据" });
      return;
    }
    const names = chosenCleanable.map((item) => item.label).join("、");
    if (
      !window.confirm(
        `确定清理以下 ${chosenCleanable.length} 类主题数据（共 ${chosenCleanTotal} 条记录）吗？\n\n${names}\n\n评论数据永不自动删除。此操作不可撤销，建议先导出备份。`,
      )
    )
      return;
    setBusy(true);
    try {
      const { deleted } = await adminApi.dataCleanup(
        chosenCleanable.map((item) => item.key),
      );
      const count = Object.values(deleted).reduce(
        (sum, value) => sum + Number(value),
        0,
      );
      setToast({ kind: "success", message: `已清理 ${count} 条记录` });
      load();
    } catch (error) {
      setToast({
        kind: "error",
        message: error instanceof Error ? error.message : "清理失败",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title="数据管理"
        description="导入主题数据；勾选条目后可导出或清理。评论数据永不自动删除。"
      />

      <Card className="mb-4">
        <div className="mb-1 text-sm font-semibold">导入</div>
        <p className="mb-3 text-xs text-muted-foreground">
          导入此前导出的 JSON 文件（schema 2 起包含评论锚定等条目的完整标识）。
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            导入文件
            <input type="file" accept="application/json" ref={fileRef} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            导入方式
            <select
              value={importMode}
              onChange={(e) =>
                setImportMode(e.target.value as "restore" | "migrate")
              }
            >
              <option value="restore">恢复（覆盖同 key 数据）</option>
              <option value="migrate">迁移（跨站迁移到本机）</option>
            </select>
          </label>
          <Button variant="secondary" onClick={importFile} disabled={busy}>
            导入
          </Button>
        </div>
        {report && (
          <p className="mt-3 break-all text-xs text-muted-foreground">
            导入结果：{report}
          </p>
        )}
      </Card>

      <Card>
        <div className="mb-1 flex items-center justify-between">
          <div className="text-sm font-semibold">主题数据</div>
          <div className="flex items-center gap-2 text-xs">
            <button
              type="button"
              className="cursor-pointer font-semibold text-primary hover:underline"
              onClick={() =>
                setSelected(
                  allSelected
                    ? new Set()
                    : new Set((items ?? []).map((item) => item.key)),
                )
              }
            >
              {allSelected ? "取消全选" : "全选"}
            </button>
            <span className="text-muted-foreground">
              已选 {selected.size}/{items?.length ?? 0} 项
            </span>
          </div>
        </div>
        <p className="mb-3 text-xs text-muted-foreground">
          同一张表同时用于导出与清理：导出只包含可导出条目，清理只处理可清理条目。
        </p>

        {items === null && (
          <p className="text-sm text-muted-foreground">加载中…</p>
        )}
        {items && (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="w-8 py-2 pr-3 font-medium">选择</th>
                <th className="py-2 pr-3 font-medium">数据</th>
                <th className="py-2 pr-3 font-medium">类型</th>
                <th className="py-2 pr-3 font-medium">导出</th>
                <th className="py-2 pr-3 font-medium">清理</th>
                <th className="py-2 font-medium">当前数量</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.key} className="border-b border-border/50">
                  <td className="py-2 pr-3">
                    <input
                      type="checkbox"
                      checked={selected.has(item.key)}
                      onChange={(e) => toggleItem(item.key, e.target.checked)}
                      aria-label={`选择 ${item.label}`}
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <div>{item.label}</div>
                    <div className="text-xs text-muted-foreground">
                      {item.key}
                    </div>
                  </td>
                  <td className="py-2 pr-3 text-xs text-muted-foreground">
                    {item.medium}
                  </td>
                  <td className="py-2 pr-3 text-xs">
                    {item.exportable ? "可导出" : "—"}
                  </td>
                  <td className="py-2 pr-3 text-xs">
                    {CLEANUP_LABEL[item.cleanup] ?? item.cleanup}
                  </td>
                  <td className="py-2">{item.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button
            onClick={exportSelected}
            disabled={busy || chosenExportable.length === 0}
          >
            导出所选（{chosenExportable.length}）
          </Button>
          <Button
            variant="danger"
            onClick={cleanup}
            disabled={busy || chosenCleanable.length === 0}
          >
            清理所选（{chosenCleanable.length} 类 / {chosenCleanTotal} 条）
          </Button>
        </div>
      </Card>

      {otpUsers.length > 0 && (
        <Card className="mt-4">
          <div className="mb-2 text-sm font-semibold">
            OTP 自动创建账号（{otpUsers.length}）
          </div>
          <p className="mb-2 text-xs text-muted-foreground">
            通过无密码 OTP
            登录创建，密码为机器生成。清理数据不会删除这些账号，请到 WP
            用户页自行处理。
          </p>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="py-2 pr-3 font-medium">ID</th>
                <th className="py-2 pr-3 font-medium">用户名</th>
                <th className="py-2 pr-3 font-medium">邮箱</th>
                <th className="py-2 font-medium">创建时间</th>
              </tr>
            </thead>
            <tbody>
              {otpUsers.map((user) => (
                <tr key={user.id} className="border-b border-border/50">
                  <td className="py-2 pr-3">{user.id}</td>
                  <td className="py-2 pr-3">{user.login}</td>
                  <td className="py-2 pr-3">{user.email}</td>
                  <td className="py-2">{user.created.slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

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
