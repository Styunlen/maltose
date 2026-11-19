import {
  Button,
  Card,
  Field,
  PageHeader,
  Switch,
  TextInput,
  Toast,
} from "../components";
import { useSettingsForm } from "../lib/useSettingsForm";

export function PreviewPage() {
  const { form, saving, toast, setToast, set, save } = useSettingsForm();

  if (!form) {
    return <PageHeader title="阅读增强" description="内链悬浮预览的参数" />;
  }

  return (
    <>
      <PageHeader
        title="阅读增强"
        description="文章内链悬浮预览（链接卡片）的行为参数"
        actions={
          <Button
            onClick={() =>
              save({
                preview_enabled: form.preview_enabled,
                preview_delay: Number(form.preview_delay),
                preview_excerpt_len: Number(form.preview_excerpt_len),
                preview_wpm: Number(form.preview_wpm),
                preview_cache_ttl: Number(form.preview_cache_ttl),
                preview_recent: Number(form.preview_recent),
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
          label="悬浮预览"
          description="关闭后鼠标悬停站内链接不再弹出预览卡片。"
        >
          <Switch
            checked={form.preview_enabled === 1}
            onChange={(v) => set("preview_enabled", v ? 1 : 0)}
            label="悬浮预览"
          />
        </Field>
        <Field
          label="触发延时（毫秒）"
          description="悬停多久后显示预览，避免快速划过时闪烁。"
        >
          <TextInput
            type="number"
            min={0}
            value={String(form.preview_delay)}
            onChange={(e) => set("preview_delay", Number(e.target.value))}
          />
        </Field>
        <Field
          label="摘要字数"
          description="预览卡片中显示的文章摘要长度（字符）。"
        >
          <TextInput
            type="number"
            min={20}
            value={String(form.preview_excerpt_len)}
            onChange={(e) => set("preview_excerpt_len", Number(e.target.value))}
          />
        </Field>
        <Field label="阅读速度（字/分钟）" description="用于估算阅读时长。">
          <TextInput
            type="number"
            min={100}
            value={String(form.preview_wpm)}
            onChange={(e) => set("preview_wpm", Number(e.target.value))}
          />
        </Field>
        <Field label="缓存时长（秒）" description="预览数据的服务端缓存时间。">
          <TextInput
            type="number"
            min={0}
            value={String(form.preview_cache_ttl)}
            onChange={(e) => set("preview_cache_ttl", Number(e.target.value))}
          />
        </Field>
        <Field
          label="归档卡最近文章数"
          description="归档卡片中显示的最近文章条数。"
        >
          <TextInput
            type="number"
            min={1}
            value={String(form.preview_recent)}
            onChange={(e) => set("preview_recent", Number(e.target.value))}
          />
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
