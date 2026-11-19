import * as React from "react";
import { adminApi, type MaltoseSettings, type WpUser } from "./api";

export type SettingsToast = {
  kind: "success" | "error";
  message: string;
};

/**
 * Shared load/save state for the settings pages: GET on mount, PUT on save,
 * server response becomes the new local state (sanitized values round-trip).
 */
export function useSettingsForm() {
  const [form, setForm] = React.useState<MaltoseSettings | null>(null);
  const [users, setUsers] = React.useState<WpUser[]>([]);
  const [saving, setSaving] = React.useState(false);
  const [toast, setToast] = React.useState<SettingsToast | null>(null);

  React.useEffect(() => {
    let disposed = false;
    adminApi
      .getSettings()
      .then(({ options, users: list }) => {
        if (disposed) return;
        setForm(options);
        setUsers(list ?? []);
      })
      .catch((error) => {
        if (!disposed) {
          setToast({
            kind: "error",
            message: error instanceof Error ? error.message : "设置加载失败",
          });
        }
      });
    return () => {
      disposed = true;
    };
  }, []);

  const set = <K extends keyof MaltoseSettings>(
    key: K,
    value: MaltoseSettings[K],
  ) => setForm((prev) => (prev ? { ...prev, [key]: value } : prev));

  const save = async (patch: Partial<MaltoseSettings>) => {
    if (!form) return;
    setSaving(true);
    try {
      const { options } = await adminApi.saveSettings(patch);
      setForm(options);
      setToast({ kind: "success", message: "已保存" });
    } catch (error) {
      setToast({
        kind: "error",
        message: error instanceof Error ? error.message : "保存失败",
      });
    } finally {
      setSaving(false);
    }
  };

  return { form, users, saving, toast, setToast, set, save };
}
