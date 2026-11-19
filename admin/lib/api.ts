// Typed bridge between the admin app and the WP REST controller
// (wordpress-theme/includes/class-rest-controller.php, ADR-0044).

export interface MaltoseSettings {
  secret_key: string;
  sign_expire: number;
  debug_mode: 0 | 1;
  preview_enabled: 0 | 1;
  preview_delay: number;
  preview_excerpt_len: number;
  preview_wpm: number;
  preview_cache_ttl: number;
  preview_recent: number;
  site_birthday: string;
  social_links: SocialLink[];
  owner_user_ids: number[];
}

export interface SocialLink {
  key?: string;
  label: string;
  url: string;
  iconType: "url" | "iconify";
  icon: string;
}

export interface WpUser {
  id: number;
  name: string;
}

export interface AdminBootConfig {
  restUrl: string;
  nonce: string;
  userName: string;
}

declare global {
  interface Window {
    MaltoseAdminConfig: AdminBootConfig;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${window.MaltoseAdminConfig.restUrl}${path}`, {
    credentials: "same-origin",
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-WP-Nonce": window.MaltoseAdminConfig.nonce,
      ...(init?.headers || {}),
    },
  });
  if (res.status === 403) {
    throw new Error("会话已过期，请刷新页面后重试。");
  }
  if (!res.ok) {
    let message = `请求失败（HTTP ${res.status}）`;
    try {
      const body = (await res.json()) as { message?: string };
      if (body.message) message = body.message;
    } catch {
      // keep the fallback message
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}

export const adminApi = {
  getSettings: () =>
    request<{ options: MaltoseSettings; users: WpUser[] }>("/settings"),
  saveSettings: (options: Partial<MaltoseSettings>) =>
    request<{ options: MaltoseSettings }>("/settings", {
      method: "PUT",
      body: JSON.stringify(options),
    }),
  listAnnouncements: () =>
    request<{ items: AnnouncementItem[] }>("/announcements"),
  createAnnouncement: (payload: AnnouncementPayload) =>
    request<AnnouncementItem>("/announcements", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateAnnouncement: (id: number, payload: AnnouncementPayload) =>
    request<AnnouncementItem>(`/announcements/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  deleteAnnouncement: (id: number) =>
    request<{ deleted: boolean; id: number }>(`/announcements/${id}`, {
      method: "DELETE",
    }),
  dataOverview: () =>
    request<{
      items: DataItem[];
      preview: DataPreviewRow[];
      otpUsers: OtpUser[];
      exportables: ExportableItem[];
    }>("/data/overview"),
  dataExport: (categories?: string[]) => {
    const params = new URLSearchParams();
    categories?.forEach((key) => params.append("categories[]", key));
    const query = params.toString();
    return request<ExportBundle>(`/data/export${query ? `?${query}` : ""}`);
  },
  dataImport: (payload: unknown, mode: "restore" | "migrate") =>
    request<{ report: unknown }>("/data/import", {
      method: "POST",
      body: JSON.stringify({ payload, mode }),
    }),
  dataCleanup: (categories?: string[]) =>
    request<{ deleted: Record<string, number> }>("/data/cleanup", {
      method: "POST",
      body: JSON.stringify({ categories: categories ?? null }),
    }),
  dataMigrateClientIds: () =>
    request<{ total: number; updated: number }>("/data/migrate-clientids", {
      method: "POST",
    }),
  uninstallOverview: () =>
    request<{
      items: DataItem[];
      preview: DataPreviewRow[];
      otpUsers: OtpUser[];
    }>("/uninstall"),
  runUninstall: (
    mode: "export_clean" | "export_keep" | "clean" | "keep",
    categories?: string[],
  ) =>
    request<{
      mode: string;
      deleted: Record<string, number>;
      export: ExportBundle | null;
    }>("/uninstall", {
      method: "POST",
      body: JSON.stringify({ mode, categories: categories ?? null }),
    }),
  orphanComments: () => request<{ items: OrphanCommentItem[] }>("/orphans"),
};

export interface AnnouncementItem {
  id: number;
  date: string;
  modified: string;
  content: string;
  sticky: boolean;
  status: "publish" | "draft";
}

export interface AnnouncementPayload {
  content: string;
  sticky: boolean;
  status: "publish" | "draft";
}

export interface DataPreviewRow {
  key: string;
  label: string;
  cleanup: "clean" | "ask" | "keep";
  count: number;
}

export interface ExportableItem {
  key: string;
  label: string;
  medium: string;
}

export interface DataItem {
  key: string;
  label: string;
  medium: string;
  cleanup: "clean" | "ask" | "keep";
  exportable: boolean;
  count: number;
}

export interface OtpUser {
  id: number;
  login: string;
  email: string;
  created: string;
}

export interface ExportBundle {
  filename: string;
  payload: unknown;
}

export interface OrphanCommentItem {
  commentId: number;
  author: string;
  authorEmail: string;
  clientId: string;
  snippet: string;
  content: string;
  date: string;
  link: string;
}
