import * as React from "react";
import {
  Button,
  Card,
  Field,
  PageHeader,
  Switch,
  TextInput,
  Toast,
} from "../components";
import { adminApi } from "../lib/api";
import { useSettingsForm } from "../lib/useSettingsForm";

export function GeneralPage() {
  const { form, saving, toast, setToast, set, save } = useSettingsForm();
  const [migrating, setMigrating] = React.useState(false);
  const [migrateResult, setMigrateResult] = React.useState<string | null>(null);

  const migrate = async () => {
    setMigrating(true);
    try {
      const result = await adminApi.dataMigrateClientIds();
      setMigrateResult(
        `已完成：检查 ${result.total} 篇文章（含页面），其中 ${result.updated} 篇补写了段落锚点` +
          (result.updated === 0 ? "——所有段落均已有标识，无需处理。" : "。"),
      );
      setToast({ kind: "success", message: "段落锚定迁移完成" });
    } catch (error) {
      setToast({
        kind: "error",
        message: error instanceof Error ? error.message : "迁移失败",
      });
    } finally {
      setMigrating(false);
    }
  };

  if (!form)
    return <PageHeader title="常规" description="签名、调试与站点基础信息" />;

  return (
    <>
      <PageHeader
        title="常规"
        description="签名、调试与站点基础信息"
        actions={
          <Button
            onClick={() =>
              save({
                secret_key: form.secret_key,
                sign_expire: Number(form.sign_expire),
                debug_mode: form.debug_mode,
                site_birthday: form.site_birthday,
              })
            }
            disabled={saving}
          >
            {saving ? "保存中…" : "保存"}
          </Button>
        }
      />
      <Card>
        <Field
          label="签名密钥"
          description="用于 GraphQL 代理请求的 HMAC 签名。更改后前端代理需同步更新。"
        >
          <TextInput
            value={form.secret_key}
            onChange={(e) => set("secret_key", e.target.value)}
            spellCheck={false}
          />
        </Field>
        <Field
          label="签名有效期（秒）"
          description="GraphQL 代理请求时间戳允许的最大偏差。"
        >
          <TextInput
            type="number"
            min={1}
            value={String(form.sign_expire)}
            onChange={(e) => set("sign_expire", Number(e.target.value))}
          />
        </Field>
        <Field label="调试模式" description="开启后输出更详细的诊断日志。">
          <Switch
            checked={form.debug_mode === 1}
            onChange={(v) => set("debug_mode", v ? 1 : 0)}
            label="调试模式"
          />
        </Field>
        <Field
          label="建站日期"
          description="格式 YYYY-MM-DD，用于站点运行时长展示。"
        >
          <TextInput
            value={form.site_birthday}
            placeholder="2020-02-10"
            onChange={(e) => set("site_birthday", e.target.value)}
          />
        </Field>
      </Card>
      <Card className="mt-4">
        <div className="mb-3 text-sm font-semibold">维护</div>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" onClick={migrate} disabled={migrating}>
            {migrating ? "处理中…" : "补全段落锚点"}
          </Button>
          <span className="text-xs text-muted-foreground">
            段落评论依靠段落标识（clientId）定位到具体段落。本功能为旧文章补写缺失的标识；
            已有标识的段落不会被改动，可安全重复执行。
          </span>
        </div>
        {migrateResult && (
          <p className="mt-2 text-sm text-muted-foreground">{migrateResult}</p>
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
