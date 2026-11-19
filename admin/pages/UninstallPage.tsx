import * as React from "react";
import { Button, Card, PageHeader, Toast } from "../components";
import {
  adminApi,
  type DataItem,
  type ExportBundle,
  type OtpUser,
} from "../lib/api";

const MODES = [
  {
    value: "export_clean",
    label: "① 导出后清理",
    description: "先下载所选数据的备份，然后删除所选的可清理数据",
  },
  {
    value: "export_keep",
    label: "② 仅导出保留",
    description: "下载所选数据的备份，数据留在数据库",
  },
  {
    value: "clean",
    label: "③ 直接清理",
    description: "不备份，直接删除所选的可清理数据",
  },
  {
    value: "keep",
    label: "④ 不处理",
    description: "所选数据全部保留（切换主题后仍留在数据库）",
  },
] as const;

type UninstallMode = (typeof MODES)[number]["value"];

const CLEANUP_LABEL: Record<string, string> = {
  clean: "可清理",
  ask: "可清理（待确认）",
  keep: "保留",
};

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

export function UninstallPage() {
  const [items, setItems] = React.useState<DataItem[] | null>(null);
  const [otpUsers, setOtpUsers] = React.useState<OtpUser[]>([]);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [mode, setMode] = React.useState<UninstallMode>("export_clean");
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<string | null>(null);
  const [toast, setToast] = React.useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);

  React.useEffect(() => {
    adminApi
      .uninstallOverview()
      .then(({ items: rows, otpUsers: users }) => {
        setItems(rows);
        setOtpUsers(users);
        // Default: everything selected (the wizard's original "全部处理" intent).
        setSelected(new Set(rows.map((item) => item.key)));
      })
      .catch((error) =>
        setToast({
          kind: "error",
          message: error instanceof Error ? error.message : "预览加载失败",
        }),
      );
  }, []);

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

  const run = async () => {
    if (chosen.length === 0) {
      setToast({ kind: "error", message: "请至少选择一项要处理的数据" });
      return;
    }
    const chosenMode = MODES.find((m) => m.value === mode);
    const scopeText =
      mode === "export_clean" || mode === "clean"
        ? `将清理所选的可清理数据 ${chosenCleanable.length} 类（${chosenCleanTotal} 条）`
        : `所选可导出数据 ${chosenExportable.length} 类将导出`;
    if (
      !window.confirm(
        `确定按「${chosenMode?.label}」处理 ${chosen.length} 项所选数据吗？\n\n${scopeText}${
          mode === "clean" || mode === "export_clean"
            ? "。清理后不可撤销，评论数据永不自动删除。"
            : "。"
        }`,
      )
    )
      return;
    setBusy(true);
    try {
      const response = await adminApi.runUninstall(
        mode,
        chosen.map((item) => item.key),
      );
      if (response.export) downloadJson(response.export);
      const count = Object.values(response.deleted).reduce(
        (sum, value) => sum + Number(value),
        0,
      );
      setResult(
        `方式：${chosenMode?.label}；清理 ${count} 条记录${response.export ? "；备份已下载" : ""}。`,
      );
      setToast({ kind: "success", message: "处理完成" });
    } catch (error) {
      setToast({
        kind: "error",
        message: error instanceof Error ? error.message : "处理失败",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title="卸载向导"
        description="删除主题前处理 Maltose 写入的数据。评论数据永不自动删除——它们是访客资产。"
      />

      <Card className="mb-4">
        <div className="mb-1 flex items-center justify-between">
          <div className="text-sm font-semibold">处理范围</div>
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
          勾选本次要处理的数据条目；导出只包含可导出条目，清理只处理可清理条目。
        </p>

        {items === null && (
          <p className="text-sm text-muted-foreground">加载中…</p>
        )}
        {items && items.length === 0 && (
          <p className="text-sm text-muted-foreground">无残留数据。</p>
        )}
        {items && items.length > 0 && (
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
        {otpUsers.length > 0 && (
          <p className="mt-3 text-xs text-muted-foreground">
            另有 OTP 自动创建账号 {otpUsers.length} 个（
            {otpUsers
              .slice(0, 3)
              .map((u) => u.login)
              .join("、")}
            {otpUsers.length > 3 ? "…" : ""}）：清理数据不会删除这些账号，请到
            WP 用户页自行处理。
          </p>
        )}
      </Card>

      <Card>
        <div className="mb-3 text-sm font-semibold">处理方式</div>
        <div className="flex flex-col gap-2">
          {MODES.map((item) => (
            <label
              key={item.value}
              className="flex cursor-pointer items-start gap-2 text-sm"
            >
              <input
                type="radio"
                name="uninstall-mode"
                value={item.value}
                checked={mode === item.value}
                onChange={() => setMode(item.value)}
                className="mt-0.5"
              />
              <span>
                <span className="font-semibold">{item.label}</span>
                <span className="ml-2 text-xs text-muted-foreground">
                  {item.description}
                </span>
              </span>
            </label>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          已选 {chosen.length} 项：其中可导出 {chosenExportable.length}{" "}
          类、可清理 {chosenCleanable.length} 类（{chosenCleanTotal} 条记录）。
        </p>
        <div className="mt-3">
          <Button
            variant="danger"
            onClick={run}
            disabled={busy || chosen.length === 0}
          >
            {busy ? "处理中…" : "执行卸载处理"}
          </Button>
        </div>
        {result && (
          <p className="mt-3 text-sm text-muted-foreground">{result}</p>
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
